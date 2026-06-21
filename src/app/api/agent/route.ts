import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AgentResponse } from "@/lib/agent/card-types";
import {
  AuthenticationRequiredError,
  getCurrentFinancialSnapshot,
  NoFinancialDataError,
} from "@/lib/data/current-snapshot";
import { recordAgentChatTurnSafely } from "@/lib/data/agent-chat-turns";
import {
  type ConnectedAccountsResult,
  deleteCurrentUserFinancialData,
  loadConnectedAccountsForUser,
  loadFinancialSnapshotForUser,
  loadInstitutionForUser,
  markPipCashSnapshotsStaleForUser,
  removeInstitutionForUser,
  upsertAccountInclusionPreference,
  upsertAccountProtectedSavingsPreference,
  upsertUserSettings,
} from "@/lib/data/financial-repository";
import {
  createSavingsGoalForUser,
  listSavingsGoalsForUser,
  loadSavingsGoalForUser,
  updateSavingsGoalForUser,
} from "@/lib/data/savings-goals-repository";
import { loadManualRefreshOnlyForUser } from "@/lib/data/user-settings";
import {
  ignoreRecurringObligationForUser,
  normalizeMerchantKey,
  upsertRecurringObligationRuleForUser,
} from "@/lib/data/recurring-obligation-rules";
import { runManualSync, ManualSyncRateLimitError } from "@/lib/data/manual-sync";
import { recordProductEventSafely } from "@/lib/data/product-events";
import { loadSyncStatusForUser, type SyncStatus } from "@/lib/data/sync-status";
import {
  runAIAgent,
  toAgentErrorPayload,
  type PipAgentActions,
  type PipAgentOnboardingState,
  type PipAgentActionResult,
} from "@/lib/agent/ai-agent";
import { resolvePipAgentQualityVariant } from "@/lib/agent/quality-variants";
import { pendingActionSchema } from "@/lib/agent/response-schema";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  getDisplayedSpendableCashTodayCents,
  getSpendableCashTodayState,
} from "@/lib/pip-cash/spendable-cash-today";
import {
  shouldStalePipCashForGoalChange,
  toSavingsGoalPlanResponse,
  validateSavingsGoalInput,
} from "@/app/api/savings-goals/route-helpers";
import {
  buildSavingsGoalPlanCard,
  buildSavingsGoalsSummaryCard,
} from "@/lib/savings-goals/cards";
import { isSavingsGoalsEnabled } from "@/lib/savings-goals/feature-flags";
import type { SavingsGoalUpdate } from "@/lib/savings-goals/types";
import type { SavingsGoal, SavingsGoalInput } from "@/lib/savings-goals/types";
import type { FakeDataScenario } from "@/lib/fake-data";
import type {
  ConnectSession,
  FinancialProviderName,
  PlaidConnectSession,
  PlaidLinkMode,
} from "@/lib/providers/FinancialDataProvider";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import {
  getFinancialDataProvider,
  ProviderUnavailableError,
} from "@/lib/providers/provider-registry";
import { getSafeErrorMessage, sanitizeSensitiveText } from "@/lib/security/error-messages";
import { getClientPipPlatform } from "@/lib/platform/android-shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { FinancialSnapshot } from "@/lib/types";
import {
  createChatTurnRequestMetadata,
  recordAgentEvents,
} from "@/lib/agent/route-telemetry";
import {
  buildAgentModelGatePlan,
  claimAgentModelGate,
  getAgentModelGateScope,
  getClientIp,
  releaseAgentModelGate,
  toAgentModelGateResponse,
} from "@/lib/agent/agent-model-gate";
import {
  buildAccountConnectionsCard,
  createLocalDevConnectedAccounts,
  resolveAccountTarget,
  resolveInstitutionTarget,
} from "@/lib/agent/account-connections";

const requestSchema = z.object({
  message: z.string().min(1).max(500),
  requestKind: z.enum(["chat", "prompt_chips", "opening_bubble"]).optional(),
  conversationId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional(),
  scenario: z
    .enum([
      "default",
      "healthy",
      "overspending",
      "shortfall",
      "low-confidence",
      "missing-card",
      "cash-guardrail",
      "cutback-dining",
      "negative",
    ])
    .optional(),
  selectedPromptChipId: z.string().min(1).max(80).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(500),
      }),
    )
    .max(8)
    .optional(),
  conversationState: z
    .object({
      shownCards: z
        .array(
          z.object({
            type: z.string().min(1).max(80),
            title: z.string().max(120).optional(),
          }),
        )
        .max(8)
        .optional(),
      lastToolNames: z.array(z.string().min(1).max(80)).max(8).optional(),
      promptChips: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(56),
            prompt: z.string().min(1).max(160),
          }),
        )
        .max(24)
        .optional(),
      pendingAction: pendingActionSchema.optional(),
    })
    .optional(),
});

type AgentRouteRequest = z.infer<typeof requestSchema>;

type EventContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

type RouteAgentContext = {
  eventContext: EventContext | null;
  onboardingState: PipAgentOnboardingState;
  snapshot?: FinancialSnapshot;
  syncStatus: SyncStatus | null;
  actions?: PipAgentActions;
};

const localDevSavingsGoals: SavingsGoal[] = [];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Message is required.",
      },
      { status: 400 },
    );
  }

  const conversationId = parsed.data.conversationId ?? createServerConversationId();
  let routeContext: RouteAgentContext | undefined;
  let modelGateLeaseId: string | undefined;

  try {
    routeContext = await createRouteAgentContext({
      scenario: parsed.data.scenario,
    });
    const requestKind = parsed.data.requestKind ?? "chat";
    const modelGatePlan = buildAgentModelGatePlan({
      onboardingStatus: routeContext.onboardingState.status,
      requestKind,
    });
    const modelGateClaim = await claimRouteAgentModelGate({
      routeContext,
      request,
      requestKind,
      modelGatePlan,
    });

    if (modelGateClaim.outcome !== "allowed") {
      const payload = toAgentModelGateResponse(modelGateClaim);
      const { status, ...body } = payload;

      return NextResponse.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(payload.retryAfterSeconds),
        },
      });
    }

    modelGateLeaseId = modelGateClaim.leaseId;
    const response = await runAIAgent(
      {
        message: parsed.data.message,
        snapshot: routeContext.snapshot,
        requestKind: parsed.data.requestKind,
        platform: getClientPipPlatform(request.headers.get("user-agent")),
        history: parsed.data.history,
        conversationState: parsed.data.conversationState,
        syncStatus: routeContext.syncStatus,
        onboardingState: routeContext.onboardingState,
        selectedPromptChipId: parsed.data.selectedPromptChipId,
        qualityVariant: resolvePipAgentQualityVariant(
          request.headers.get("x-pip-agent-variant") || process.env.PIP_AGENT_VARIANT,
        ),
        actions: routeContext.actions,
      },
    );

    if ((parsed.data.requestKind ?? "chat") === "chat") {
      const routeResult = routeContext.snapshot ? calculatePipCash(routeContext.snapshot) : null;

      await Promise.all([
        recordAgentEvents(routeContext.eventContext, {
          conversationId,
          message: parsed.data.message,
          requestKind: parsed.data.requestKind ?? "chat",
          scenario: parsed.data.scenario,
          selectedPromptChipId: parsed.data.selectedPromptChipId,
          historyLength: parsed.data.history?.length ?? 0,
          response,
          pipCashTodayCents: routeResult
            ? getDisplayedSpendableCashTodayCents(routeResult)
            : null,
          isShortfall: routeResult ? getSpendableCashTodayState(routeResult) === "shortfall" : false,
        }),
        recordAgentChatTurnSafely(routeContext.eventContext?.supabase ?? null, {
          userId: routeContext.eventContext?.userId ?? null,
          conversationId,
          userMessage: parsed.data.message,
          response,
          requestMetadata: createChatTurnRequestMetadata(parsed.data, routeContext, response),
        }),
      ]);
    }

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const payload = toAgentErrorPayload(error);
    const { status, ...body } = payload;

    if ((parsed.data.requestKind ?? "chat") === "chat") {
      await recordAgentChatTurnSafely(routeContext?.eventContext?.supabase ?? null, {
        userId: routeContext?.eventContext?.userId ?? null,
        conversationId,
        userMessage: parsed.data.message,
        errorMessage: [body.error, body.detail].filter(Boolean).join(" "),
        requestMetadata: {
          ...createChatTurnRequestMetadata(parsed.data, routeContext),
          errorCode: body.code,
          status,
        },
      });
    }

    return NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } finally {
    if (modelGateLeaseId) {
      await releaseAgentModelGate(modelGateLeaseId);
    }
  }
}

async function claimRouteAgentModelGate(input: {
  routeContext: RouteAgentContext;
  request: Request;
  requestKind: "chat" | "prompt_chips" | "opening_bubble";
  modelGatePlan: ReturnType<typeof buildAgentModelGatePlan>;
}) {
  try {
    return await claimAgentModelGate({
      scopeHash: getAgentModelGateScope({
        userId: input.routeContext.eventContext?.userId,
        clientIp: getClientIp(input.request),
        userAgent: input.request.headers.get("user-agent"),
        salt: process.env.PIP_RATE_LIMIT_SALT,
      }),
      requestKind: input.requestKind,
      plan: input.modelGatePlan,
    });
  } catch (error) {
    console.warn(
      "Agent model gate claim failed.",
      getSafeErrorMessage(error, "Agent model gate unavailable."),
    );
    return {
      outcome: "unavailable" as const,
      retryAfterSeconds: 30,
    };
  }
}

function createServerConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `server-${crypto.randomUUID()}`;
  }

  return `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createRouteAgentContext(input: {
  scenario?: FakeDataScenario;
}): Promise<RouteAgentContext> {
  if (!isSupabaseConfigured()) {
    try {
      const snapshot = await getCurrentFinancialSnapshot({
        scenario: input.scenario,
      });

      return {
        eventContext: null,
        onboardingState: {
          status: "ready",
          hasFinancialData: true,
        },
        snapshot,
        syncStatus: null,
        actions: createLocalDevAgentActions(snapshot),
      };
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return createGuestContext();
      }

      if (error instanceof NoFinancialDataError) {
        return createReadyWithoutDataContext(null, null);
      }

      throw error;
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return createGuestContext();
  }

  const eventContext = {
    supabase,
    userId: user.id,
  };
  const [hasConsented, syncStatus] = await Promise.all([
    loadConsentState(supabase, user.id),
    loadSyncStatus(supabase, user.id),
  ]);

  if (!hasConsented) {
    return {
      eventContext,
      onboardingState: {
        status: "needs-consent",
        email: user.email ?? undefined,
        hasFinancialData: false,
      },
      syncStatus,
      actions: createAgentActions({
        eventContext,
        onboardingStatus: "needs-consent",
        syncStatus,
      }),
    };
  }

  try {
    const snapshot = await getCurrentFinancialSnapshot({
      scenario: input.scenario,
    });

    return {
      eventContext,
      onboardingState: {
        status: "ready",
        email: user.email ?? undefined,
        hasFinancialData: true,
      },
      snapshot,
      syncStatus,
      actions: createAgentActions({
        eventContext,
        onboardingStatus: "ready",
        syncStatus,
      }),
    };
  } catch (error) {
    if (error instanceof NoFinancialDataError) {
      return createReadyWithoutDataContext(eventContext, syncStatus, user.email ?? undefined);
    }

    if (error instanceof AuthenticationRequiredError) {
      return createGuestContext();
    }

    throw error;
  }
}

function createGuestContext(): RouteAgentContext {
  return {
    eventContext: null,
    onboardingState: {
      status: "guest",
      hasFinancialData: false,
    },
    syncStatus: null,
  };
}

function createReadyWithoutDataContext(
  eventContext: EventContext | null,
  syncStatus: SyncStatus | null,
  email?: string,
): RouteAgentContext {
  return {
    eventContext,
    onboardingState: {
      status: "ready",
      email,
      hasFinancialData: false,
    },
    syncStatus,
    actions: eventContext
      ? createAgentActions({
          eventContext,
          onboardingStatus: "ready",
          syncStatus,
        })
      : undefined,
  };
}

async function loadConsentState(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("privacy_consent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.privacy_consent_at);
}

async function loadSyncStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SyncStatus | null> {
  try {
    return await loadSyncStatusForUser(supabase, userId);
  } catch {
    return null;
  }
}

function createLocalDevAgentActions(snapshot: FinancialSnapshot): PipAgentActions {
  return {
    async getConnectedAccounts() {
      return {
        ok: true,
        status: "account_connections_loaded",
        cards: [buildAccountConnectionsCard(createLocalDevConnectedAccounts(snapshot))],
      };
    },
    async createSavingsGoal(goalInput) {
      const validationError = validateSavingsGoalInput(goalInput);

      if (validationError) {
        return {
          ok: false,
          status: "invalid_savings_goal",
          message: validationError,
        };
      }

      const goal = createLocalDevSavingsGoal(goalInput);
      const existingIndex = localDevSavingsGoals.findIndex((item) => item.id === goal.id);

      if (existingIndex >= 0) {
        localDevSavingsGoals[existingIndex] = goal;
      } else {
        localDevSavingsGoals.push(goal);
      }

      return {
        ok: true,
        status: "savings_goal_created",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(goal))],
      };
    },
    async listSavingsGoals() {
      return {
        ok: true,
        status: "savings_goals_loaded",
        cards: [buildSavingsGoalsSummaryCard(localDevSavingsGoals.map(toSavingsGoalPlanResponse))],
      };
    },
    async updateSavingsGoal(goalInput) {
      const target = goalInput.goalId
        ? localDevSavingsGoals.find((goal) => goal.id === goalInput.goalId)
        : localDevSavingsGoals.find((goal) => goal.name.toLowerCase() === goalInput.name?.toLowerCase()) ??
          (localDevSavingsGoals.length === 1 ? localDevSavingsGoals[0] : undefined);

      if (!target) {
        return {
          ok: false,
          status: "savings_goal_not_found",
          message: "I do not see a saved savings goal yet.",
        };
      }

      const updated: SavingsGoal = {
        ...target,
        targetAmountCents: goalInput.targetAmountCents ?? target.targetAmountCents,
        targetDate: goalInput.targetDate === null ? undefined : goalInput.targetDate ?? target.targetDate,
        currentAmountCents: goalInput.currentAmountCents ?? target.currentAmountCents,
        monthlyContributionCents: goalInput.monthlyContributionCents ?? target.monthlyContributionCents,
        includeInSpendableCash: goalInput.includeInSpendableCash ?? target.includeInSpendableCash,
        status: goalInput.status ?? target.status,
        updatedAt: new Date().toISOString(),
      };
      const validationError = validateSavingsGoalInput(updated, target);

      if (validationError) {
        return {
          ok: false,
          status: "invalid_savings_goal",
          message: validationError,
        };
      }

      localDevSavingsGoals.splice(localDevSavingsGoals.indexOf(target), 1, updated);

      return {
        ok: true,
        status: "savings_goal_updated",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(updated))],
      };
    },
    async correctRecurringObligation({ merchantName, treatment }) {
      return {
        ok: true,
        status: treatment === "bill" ? "recurring_obligation_confirmed" : "recurring_obligation_ignored",
        message: treatment === "bill"
          ? `I’ll treat ${merchantName} as a monthly bill.`
          : `I’ll stop treating ${merchantName} as a monthly bill.`,
        clientAction: {
          type: "reload",
        },
      };
    },
    async setSavingsGoalProtection(goalInput) {
      const target = goalInput.goalId
        ? localDevSavingsGoals.find((goal) => goal.id === goalInput.goalId)
        : localDevSavingsGoals.find((goal) => goal.name.toLowerCase() === goalInput.name?.toLowerCase()) ??
          (localDevSavingsGoals.length === 1 ? localDevSavingsGoals[0] : undefined);

      if (!target) {
        return {
          ok: false,
          status: "savings_goal_not_found",
          message: "I do not see a saved savings goal yet.",
        };
      }

      const updated: SavingsGoal = {
        ...target,
        includeInSpendableCash: goalInput.includeInSpendableCash,
        monthlyContributionCents: goalInput.monthlyContributionCents ?? target.monthlyContributionCents,
        updatedAt: new Date().toISOString(),
      };

      localDevSavingsGoals.splice(localDevSavingsGoals.indexOf(target), 1, updated);

      return {
        ok: true,
        status: "savings_goal_updated",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(updated))],
      };
    },
  };
}

function createLocalDevSavingsGoal(input: SavingsGoalInput): SavingsGoal {
  const now = new Date().toISOString();
  const normalizedName = input.name.trim() || "Savings goal";
  const stableId = `local-dev-${normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "goal"}`;

  return {
    id: stableId,
    userId: "local-dev",
    name: normalizedName,
    targetAmountCents: input.targetAmountCents,
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    startingAmountCents: input.startingAmountCents ?? 0,
    currentAmountCents: input.currentAmountCents ?? input.startingAmountCents ?? 0,
    monthlyContributionCents: input.monthlyContributionCents ?? 0,
    includeInSpendableCash: input.includeInSpendableCash ?? true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function createAgentActions(input: {
  eventContext: EventContext;
  onboardingStatus: PipAgentOnboardingState["status"];
  syncStatus: SyncStatus | null;
}): PipAgentActions {
  return {
    async saveProtectedSavings({ amountCents }) {
      const { supabase, userId } = input.eventContext;

      if (input.onboardingStatus === "needs-consent") {
        const { error } = await supabase.from("user_settings").upsert({
          user_id: userId,
          protected_savings_monthly_cents: amountCents,
          manual_refresh_only: false,
          privacy_consent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (error) {
          throw error;
        }
      } else {
        await upsertUserSettings(supabase, userId, {
          protectedSavingsMonthlyCents: amountCents,
        });
        await markPipCashSnapshotsStaleForUser(supabase, userId);
      }

      await recordProductEventSafely(supabase, userId, "settings_updated", {
        protectedSavingsMonthlyCents: amountCents,
      });

      return {
        ok: true,
        status: "protected_savings_saved",
        protectedSavingsMonthlyCents: amountCents,
        clientAction: {
          type: "reload",
        },
      };
    },
    async getConnectedAccounts() {
      const { supabase, userId } = input.eventContext;
      const result = await loadConnectedAccountsForUser(supabase, userId);
      const card = buildAccountConnectionsCard(result);

      await recordProductEventSafely(supabase, userId, "account_connections_viewed", {
        institutionCount: result.institutions.length,
        accountCount: result.institutions.reduce(
          (total, institution) => total + institution.accounts.length,
          0,
        ),
        repairRequired: result.institutions.some((institution) => institution.needsRepair),
      });

      return {
        ok: true,
        status: "account_connections_loaded",
        cards: [card],
      };
    },
    async startPlaidLink(actionInput = {}) {
      const { supabase, userId } = input.eventContext;
      const providerName: FinancialProviderName = "plaid";
      const provider = getFinancialDataProvider(providerName);
      const connectRequest = await getPlaidConnectRequest(supabase, {
        userId,
        syncStatus: input.syncStatus,
        mode: actionInput.mode,
        institutionId: actionInput.institutionId,
        institutionName: actionInput.institutionName,
      });

      if (connectRequest.needsSelection) {
        return {
          ok: false,
          status: connectRequest.status,
          message: connectRequest.message,
          cards: [buildAccountConnectionsCard(connectRequest.accounts)],
        };
      }

      let session: ConnectSession;

      try {
        session = await provider.createConnectSession(userId, connectRequest);
      } catch (error) {
        const errorDetails = getProviderConnectErrorDetails(error);

        await recordProductEventSafely(supabase, userId, "connect_session_failed", {
          provider: providerName,
          status: "error",
          mode: connectRequest.mode,
          institutionId: connectRequest.institutionId ?? null,
          handledStatus: errorDetails.status,
          errorName: getThrownErrorName(error),
          errorCode: errorDetails.errorCode,
          errorType: errorDetails.errorType,
          errorRequestId: errorDetails.errorRequestId,
          errorKeys: errorDetails.errorKeys,
          errorMessage: errorDetails.message,
          userMessage: errorDetails.userMessage,
        });

        return {
          ok: false,
          status: errorDetails.status,
          message: errorDetails.userMessage,
        };
      }

      await recordProductEventSafely(
        supabase,
        userId,
        session.status === "ready" ? "connect_session_created" : "connect_session_failed",
        {
          provider: providerName,
          status: session.status,
          mode: connectRequest.mode,
          institutionId: connectRequest.institutionId ?? null,
        },
      );

      if (session.status !== "ready" || !isPlaidConnectSession(session.connect)) {
        return {
          ok: false,
          status: "plaid_unavailable",
          message: session.message,
        };
      }

      return {
        ok: true,
        status: "plaid_link_ready",
        message: session.message,
        clientAction: {
          type: "open_plaid",
          plaid: session.connect,
        },
      };
    },
    async setAccountInclusion({ accountId, accountName, includeInPipCash }) {
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveAccountTarget(supabase, {
        userId,
        accountId,
        accountName,
      });

      if (resolved.needsSelection) {
        return {
          ok: false,
          status: resolved.status,
          message: resolved.message,
          cards: [buildAccountConnectionsCard(resolved.accounts)],
        };
      }

      const account = await upsertAccountInclusionPreference(supabase, {
        userId,
        accountId: resolved.accountId,
        includeInPipCash,
      });
      await markPipCashSnapshotsStaleForUser(supabase, userId);
      await recordProductEventSafely(supabase, userId, "account_inclusion_updated", {
        accountId: resolved.accountId,
        accountKind: account.kind,
        institutionName: account.institutionName,
        includeInPipCash,
      });

      return {
        ok: true,
        status: includeInPipCash ? "account_included" : "account_excluded",
        clientAction: {
          type: "reload",
        },
      };
    },
    async setAccountProtectedSavings({ accountId, accountName, isProtectedSavings }) {
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveAccountTarget(supabase, {
        userId,
        accountId,
        accountName,
      });

      if (resolved.needsSelection) {
        return {
          ok: false,
          status: resolved.status,
          message: resolved.message,
          cards: [buildAccountConnectionsCard(resolved.accounts)],
        };
      }

      const account = await upsertAccountProtectedSavingsPreference(supabase, {
        userId,
        accountId: resolved.accountId,
        isProtectedSavings,
      });
      await markPipCashSnapshotsStaleForUser(supabase, userId);
      await recordProductEventSafely(supabase, userId, "account_protected_savings_updated", {
        accountId: resolved.accountId,
        accountKind: account.kind,
        institutionName: account.institutionName,
        isProtectedSavings,
      });

      return {
        ok: true,
        status: isProtectedSavings ? "account_marked_protected" : "account_unmarked_protected",
        clientAction: {
          type: "reload",
        },
      };
    },
    async createSavingsGoal(goalInput) {
      if (!isSavingsGoalsEnabled()) {
        return {
          ok: false,
          status: "savings_goals_disabled",
          message: "Savings goals are not available yet.",
        };
      }

      const { supabase, userId } = input.eventContext;
      const validationError = validateSavingsGoalInput(goalInput);

      if (validationError) {
        return {
          ok: false,
          status: "invalid_savings_goal",
          message: validationError,
        };
      }

      const goal = await createSavingsGoalForUser(supabase, userId, goalInput);
      const shouldStale = shouldStalePipCashForGoalChange(null, goal);

      if (shouldStale) {
        await markPipCashSnapshotsStaleForUser(supabase, userId);
      }

      await recordProductEventSafely(supabase, userId, "savings_goal_created", {
        goalId: goal.id,
        targetAmountCents: goal.targetAmountCents,
        monthlyContributionCents: goal.monthlyContributionCents,
        includeInSpendableCash: goal.includeInSpendableCash,
      });

      if (goal.includeInSpendableCash) {
        await recordProductEventSafely(
          supabase,
          userId,
          "savings_goal_spendable_protection_enabled",
          {
            goalId: goal.id,
            monthlyContributionCents: goal.monthlyContributionCents,
          },
        );
      }

      return {
        ok: true,
        status: "savings_goal_created",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(goal))],
        ...(shouldStale
          ? {
              clientAction: {
                type: "reload" as const,
              },
            }
          : {}),
      };
    },
    async listSavingsGoals() {
      if (!isSavingsGoalsEnabled()) {
        return {
          ok: false,
          status: "savings_goals_disabled",
          message: "Savings goals are not available yet.",
        };
      }

      const { supabase, userId } = input.eventContext;
      const goals = await listSavingsGoalsForUser(supabase, userId);
      const plans = goals.map(toSavingsGoalPlanResponse);

      return {
        ok: true,
        status: "savings_goals_loaded",
        cards: [buildSavingsGoalsSummaryCard(plans)],
      };
    },
    async updateSavingsGoal(goalInput) {
      if (!isSavingsGoalsEnabled()) {
        return {
          ok: false,
          status: "savings_goals_disabled",
          message: "Savings goals are not available yet.",
        };
      }

      const { goalId, name, ...update } = goalInput;
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveSavingsGoalTarget(supabase, {
        userId,
        goalId,
        name,
        allowSingleDefault: false,
      });

      if ("ok" in resolved) {
        return resolved;
      }

      const existing = await loadSavingsGoalForUser(supabase, userId, resolved.goalId);
      const validationError = validateSavingsGoalInput(update, existing ?? undefined);

      if (validationError) {
        return {
          ok: false,
          status: "invalid_savings_goal",
          message: validationError,
        };
      }

      const goal = await updateSavingsGoalForUser(supabase, userId, resolved.goalId, update);
      const shouldStale = shouldStalePipCashForGoalChange(existing, goal);

      if (shouldStale) {
        await markPipCashSnapshotsStaleForUser(supabase, userId);
      }

      await recordProductEventSafely(supabase, userId, "savings_goal_updated", {
        goalId: goal.id,
        targetAmountCents: goal.targetAmountCents,
        monthlyContributionCents: goal.monthlyContributionCents,
        includeInSpendableCash: goal.includeInSpendableCash,
        status: goal.status,
      });

      return {
        ok: true,
        status: "savings_goal_updated",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(goal))],
        ...(shouldStale
          ? {
              clientAction: {
                type: "reload" as const,
              },
            }
          : {}),
      };
    },
    async setSavingsGoalProtection(goalInput) {
      if (!isSavingsGoalsEnabled()) {
        return {
          ok: false,
          status: "savings_goals_disabled",
          message: "Savings goals are not available yet.",
        };
      }

      const { goalId, name, includeInSpendableCash, monthlyContributionCents } = goalInput;
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveSavingsGoalTarget(supabase, {
        userId,
        goalId,
        name,
        allowSingleDefault: true,
      });

      if ("ok" in resolved) {
        return resolved;
      }

      const existing = await loadSavingsGoalForUser(supabase, userId, resolved.goalId);
      const update: SavingsGoalUpdate = {
        includeInSpendableCash,
        ...(monthlyContributionCents === undefined ? {} : { monthlyContributionCents }),
      };
      const validationError = validateSavingsGoalInput(update, existing ?? undefined);

      if (validationError) {
        return {
          ok: false,
          status: "invalid_savings_goal",
          message: validationError,
        };
      }

      const goal = await updateSavingsGoalForUser(supabase, userId, resolved.goalId, update);
      const shouldStale = shouldStalePipCashForGoalChange(existing, goal);

      if (shouldStale) {
        await markPipCashSnapshotsStaleForUser(supabase, userId);
      }

      await recordProductEventSafely(
        supabase,
        userId,
        includeInSpendableCash
          ? "savings_goal_spendable_protection_enabled"
          : "savings_goal_spendable_protection_disabled",
        {
          goalId: goal.id,
          monthlyContributionCents: goal.monthlyContributionCents,
        },
      );

      return {
        ok: true,
        status: includeInSpendableCash
          ? "savings_goal_protection_enabled"
          : "savings_goal_protection_disabled",
        cards: [buildSavingsGoalPlanCard(toSavingsGoalPlanResponse(goal))],
        ...(shouldStale
          ? {
              clientAction: {
                type: "reload" as const,
              },
            }
          : {}),
      };
    },
    async correctRecurringObligation({ merchantName, treatment, expectedAmountCents, expectedDay }) {
      const { supabase, userId } = input.eventContext;

      if (treatment === "not_bill") {
        await ignoreRecurringObligationForUser(supabase, userId, merchantName);
        await markPipCashSnapshotsStaleForUser(supabase, userId);
        await recordProductEventSafely(supabase, userId, "recurring_obligation_corrected", {
          merchantName,
          treatment,
        });

        return {
          ok: true,
          status: "recurring_obligation_ignored",
          message: `I’ll stop treating ${merchantName} as a monthly bill.`,
          clientAction: {
            type: "reload",
          },
        };
      }

      const inferred = await inferRecurringObligationFromSnapshot(supabase, userId, {
        merchantName,
        expectedAmountCents,
        expectedDay,
      });

      if (!inferred.expectedAmountCents) {
        return {
          ok: false,
          status: "recurring_obligation_amount_required",
          message: `Tell me the usual monthly amount for ${merchantName}.`,
        };
      }

      await upsertRecurringObligationRuleForUser(supabase, userId, {
        merchantKey: normalizeMerchantKey(merchantName),
        label: merchantName,
        expectedAmountCents: inferred.expectedAmountCents,
        expectedDay: inferred.expectedDay,
      });
      await markPipCashSnapshotsStaleForUser(supabase, userId);
      await recordProductEventSafely(supabase, userId, "recurring_obligation_corrected", {
        merchantName,
        treatment,
        expectedAmountCents: inferred.expectedAmountCents,
        expectedDay: inferred.expectedDay,
      });

      return {
        ok: true,
        status: "recurring_obligation_confirmed",
        message: `I’ll treat ${merchantName} as a monthly bill.`,
        clientAction: {
          type: "reload",
        },
      };
    },
    async requestRemoveInstitutionConfirmation({ institutionId, institutionName }) {
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveInstitutionTarget(supabase, {
        userId,
        institutionId,
        institutionName,
      });

      if (resolved.needsSelection) {
        return {
          ok: false,
          status: resolved.status,
          message: resolved.message,
          cards: [buildAccountConnectionsCard(resolved.accounts)],
        };
      }

      const institution = await loadInstitutionForUser(supabase, {
        userId,
        institutionId: resolved.institutionId,
      });
      const exactConfirmation = getInstitutionRemovalConfirmation(institution.institution_name);

      await recordProductEventSafely(supabase, userId, "institution_removal_requested", {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        provider: institution.provider,
      });

      return {
        ok: true,
        status: "confirmation_required",
        exactConfirmation,
        message: `To remove ${institution.institution_name}, type ${exactConfirmation}.`,
      };
    },
    async removeInstitution({ institutionId, institutionName, confirmationText }) {
      const { supabase, userId } = input.eventContext;
      const resolved = await resolveInstitutionTarget(supabase, {
        userId,
        institutionId,
        institutionName,
      });

      if (resolved.needsSelection) {
        return {
          ok: false,
          status: resolved.status,
          message: resolved.message,
          cards: [buildAccountConnectionsCard(resolved.accounts)],
        };
      }

      const institution = await loadInstitutionForUser(supabase, {
        userId,
        institutionId: resolved.institutionId,
      });
      const exactConfirmation = getInstitutionRemovalConfirmation(institution.institution_name);

      if (confirmationText.trim() !== exactConfirmation) {
        return {
          ok: false,
          status: "confirmation_required",
          exactConfirmation,
          message: `Type ${exactConfirmation} to remove ${institution.institution_name}.`,
        };
      }

      const removed = await removeInstitutionForUser(supabase, {
        userId,
        institutionId: institution.id,
      });
      await markPipCashSnapshotsStaleForUser(supabase, userId);
      await recordProductEventSafely(supabase, userId, "institution_removed", {
        institutionId: removed.id,
        institutionName: removed.institution_name,
        provider: removed.provider,
      });

      return {
        ok: true,
        status: "institution_removed",
        clientAction: {
          type: "reload",
        },
      };
    },
    async refreshFinancialData() {
      const { supabase, userId } = input.eventContext;
      const provider = getRefreshProvider(input.syncStatus);

      if (!provider) {
        return {
          ok: false,
          status: "connect_data_first",
          message: "No connected provider can refresh yet.",
        };
      }

      try {
        const isManualRefreshOnly = await loadManualRefreshOnlyForUser(supabase, userId);

        if (isManualRefreshOnly) {
          return {
            ok: false,
            status: "skipped_manual_only",
            message: "Automatic refresh is disabled for this account.",
          };
        }

        const result = await runManualSync(supabase, {
          userId,
          provider,
        });

        return {
          ok: true,
          status: result.status,
          pipCashTodayCents: result.pipCashTodayCents,
          clientAction: {
            type: "reload",
          },
        };
      } catch (error) {
        return toToolFailureResult(error, "refresh_failed");
      }
    },
    async deleteUserData() {
      await deleteCurrentUserFinancialData(input.eventContext.supabase);

      return {
        ok: true,
        status: "deleted",
        clientAction: {
          type: "reload",
        },
      };
    },
  };
}

function toToolFailureResult(error: unknown, status: string): PipAgentActionResult {
  if (error instanceof ManualSyncRateLimitError) {
    return {
      ok: false,
      status: "rate_limited",
      message: `Try again in ${error.retryAfterSeconds}s.`,
    };
  }

  if (error instanceof ProviderUnavailableError || error instanceof ProviderSyncError) {
    return {
      ok: false,
      status,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      status,
      message: error.message,
    };
  }

  return {
    ok: false,
    status,
    message: "The action failed.",
  };
}

type PlaidConnectRequest =
  | {
      needsSelection?: false;
      mode: PlaidLinkMode;
      institutionId?: string;
    }
  | {
      needsSelection: true;
      status: string;
      message: string;
      accounts: ConnectedAccountsResult;
    };

async function getPlaidConnectRequest(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    syncStatus: SyncStatus | null;
    mode?: PlaidLinkMode;
    institutionId?: string;
    institutionName?: string;
  },
): Promise<PlaidConnectRequest> {
  if (!input.mode || input.mode === "connect") {
    if (input.mode === "connect") {
      return {
        mode: "connect",
      };
    }

    const repairableInstitutions = getRepairablePlaidInstitutions(input.syncStatus);

    if (repairableInstitutions.length === 1) {
      return {
        mode: "repair",
        institutionId: repairableInstitutions[0].id,
      };
    }

    if (repairableInstitutions.length > 1) {
      const accounts = await loadConnectedAccountsForUser(supabase, input.userId);

      return {
        needsSelection: true,
        status: "institution_choice_required",
        message: "Choose which institution to reconnect.",
        accounts,
      };
    }

    return {
      mode: "connect",
    };
  }

  const resolved = await resolveInstitutionTarget(supabase, {
    userId: input.userId,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    provider: "plaid",
    allowSingleDefault: true,
  });

  if (resolved.needsSelection) {
    return resolved;
  }

  if (requiresFreshPlaidConnection(input.syncStatus, resolved.institutionId)) {
    return {
      mode: "connect",
    };
  }

  return {
    mode: input.mode,
    institutionId: resolved.institutionId,
  };
}

type SavingsGoalResolution =
  | {
      needsSelection?: false;
      goalId: string;
    }
  | PipAgentActionResult;

async function resolveSavingsGoalTarget(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    goalId?: string;
    name?: string;
    allowSingleDefault?: boolean;
  },
): Promise<SavingsGoalResolution> {
  const goals = await listSavingsGoalsForUser(supabase, input.userId);
  const visibleGoals = goals.filter((goal) => goal.status !== "archived");

  if (input.goalId) {
    const match = visibleGoals.find((goal) => goal.id === input.goalId);

    if (match) {
      return {
        goalId: match.id,
      };
    }
  }

  const target = normalizeTarget(input.name);

  if (target) {
    const matches = visibleGoals.filter((goal) => normalizeTarget(goal.name).includes(target));

    if (matches.length === 1) {
      return {
        goalId: matches[0].id,
      };
    }

    return {
      ok: false,
      status: matches.length > 1 ? "ambiguous_savings_goal" : "savings_goal_not_found",
      message: matches.length > 1
        ? "More than one savings goal matched that name."
        : "I could not find that savings goal.",
      cards: [buildSavingsGoalsSummaryCard(goals.map(toSavingsGoalPlanResponse))],
    };
  }

  if (input.allowSingleDefault && visibleGoals.length === 1) {
    return {
      goalId: visibleGoals[0].id,
    };
  }

  return {
    ok: false,
    status: "savings_goal_choice_required",
    message: "Choose which savings goal to update.",
    cards: [buildSavingsGoalsSummaryCard(goals.map(toSavingsGoalPlanResponse))],
  };
}

function normalizeTarget(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getInstitutionRemovalConfirmation(institutionName: string): string {
  return `REMOVE ${institutionName.trim().toUpperCase()}`;
}

function getRefreshProvider(syncStatus: SyncStatus | null): FinancialProviderName | null {
  const connectedProvider = syncStatus?.institutions.find((institution) =>
    institution.provider === "plaid" || institution.provider === "teller",
  )?.provider;

  if (connectedProvider === "plaid" || connectedProvider === "teller") {
    return connectedProvider;
  }

  return null;
}

async function inferRecurringObligationFromSnapshot(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    merchantName: string;
    expectedAmountCents?: number;
    expectedDay?: number;
  },
): Promise<{
  expectedAmountCents?: number;
  expectedDay?: number;
}> {
  if (input.expectedAmountCents && input.expectedDay) {
    return {
      expectedAmountCents: input.expectedAmountCents,
      expectedDay: input.expectedDay,
    };
  }

  const snapshot = await loadFinancialSnapshotForUser(supabase, userId);
  const merchantKey = normalizeMerchantKey(input.merchantName);
  const match = snapshot?.transactions
    .filter((transaction) => transaction.amountCents < 0)
    .filter((transaction) =>
      normalizeMerchantKey(transaction.merchantName ?? transaction.description) === merchantKey,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .at(0);

  return {
    expectedAmountCents: input.expectedAmountCents ?? (match ? Math.abs(match.amountCents) : undefined),
    expectedDay: input.expectedDay ?? (match ? Number(match.date.slice(8, 10)) : undefined),
  };
}

function getProviderErrorCode(error: unknown): string | null {
  if (error instanceof ProviderUnavailableError || error instanceof ProviderSyncError) {
    return error.code;
  }

  return null;
}

function getProviderConnectErrorDetails(error: unknown): {
  status: "plaid_unavailable" | "plaid_redirect_uri_not_allowed";
  errorCode: string | null;
  errorType: string | null;
  errorRequestId: string | null;
  errorKeys: string | null;
  message: string;
  userMessage: string;
} {
  const responsePayload = getErrorResponsePayload(error);
  const directPayload = getDirectErrorPayload(error);
  const payload = responsePayload ?? directPayload;
  const errorCode =
    getStringField(payload, "error_code") ??
    getStringField(payload, "code") ??
    getProviderErrorCode(error);
  const errorType = getStringField(payload, "error_type");
  const errorRequestId = getStringField(payload, "request_id");
  const plaidMessage =
    getStringField(payload, "display_message") ?? getStringField(payload, "error_message");
  const directMessage = getStringField(directPayload, "message");
  const stringMessage = typeof error === "string" && error.trim() ? error : null;
  const errorKeys = payload ? Object.keys(payload).slice(0, 12).join(",") : null;

  if (errorCode && plaidMessage) {
    return withProviderConnectUserMessage({
      errorCode,
      errorType,
      errorRequestId,
      errorKeys,
      message: sanitizeSensitiveText(`Plaid ${errorCode}: ${plaidMessage}`).slice(0, 240),
    });
  }

  if (directMessage || stringMessage) {
    return withProviderConnectUserMessage({
      errorCode,
      errorType,
      errorRequestId,
      errorKeys,
      message: sanitizeSensitiveText(directMessage ?? stringMessage ?? "").slice(0, 240),
    });
  }

  return withProviderConnectUserMessage({
    errorCode,
    errorType,
    errorRequestId,
    errorKeys,
    message: getSafeErrorMessage(error, "Plaid connect session failed."),
  });
}

function withProviderConnectUserMessage(details: {
  errorCode: string | null;
  errorType: string | null;
  errorRequestId: string | null;
  errorKeys: string | null;
  message: string;
}): {
  status: "plaid_unavailable" | "plaid_redirect_uri_not_allowed";
  errorCode: string | null;
  errorType: string | null;
  errorRequestId: string | null;
  errorKeys: string | null;
  message: string;
  userMessage: string;
} {
  if (isPlaidRedirectUriError(details)) {
    return {
      ...details,
      status: "plaid_redirect_uri_not_allowed",
      userMessage:
        "Account linking is misconfigured right now. Plaid needs Pip's OAuth redirect URI allowlisted before new accounts can be added.",
    };
  }

  return {
    ...details,
    status: "plaid_unavailable",
    userMessage: details.message,
  };
}

function isPlaidRedirectUriError(details: {
  errorCode: string | null;
  errorType: string | null;
  message: string;
}): boolean {
  return (
    details.errorCode?.toUpperCase() === "INVALID_FIELD" &&
    details.errorType?.toUpperCase() === "INVALID_REQUEST" &&
    /\boauth redirect uri\b|\bredirect_uri\b|\bredirect uri\b/i.test(details.message)
  );
}

function getErrorResponsePayload(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return null;
  }

  const response = (error as { response?: unknown }).response;

  if (!response || typeof response !== "object" || !("data" in response)) {
    return null;
  }

  const data = (response as { data?: unknown }).data;

  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
}

function getDirectErrorPayload(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
}

function getStringField(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function getThrownErrorName(error: unknown): string | null {
  if (error instanceof Error) {
    return error.name;
  }

  return getStringField(getDirectErrorPayload(error), "name");
}

function getRepairablePlaidInstitutions(syncStatus: SyncStatus | null) {
  return (syncStatus?.institutions ?? []).filter((institution) => {
    if (institution.provider !== "plaid") {
      return false;
    }

    if (isFreshPlaidConnectionRequiredErrorCode(institution.errorCode)) {
      return false;
    }

    return (
      institution.isStale ||
      institution.status === "failed" ||
      institution.status === "stale" ||
      institution.status === "revoked" ||
      isRepairablePlaidErrorCode(institution.errorCode)
    );
  });
}

function requiresFreshPlaidConnection(
  syncStatus: SyncStatus | null,
  institutionId: string,
): boolean {
  const institution = syncStatus?.institutions.find((item) => item.id === institutionId);

  return isFreshPlaidConnectionRequiredErrorCode(institution?.errorCode);
}

function isFreshPlaidConnectionRequiredErrorCode(errorCode: string | null | undefined): boolean {
  return ["provider-token-decrypt-failed"].includes((errorCode ?? "").toLowerCase());
}

function isRepairablePlaidErrorCode(errorCode: string | null | undefined): boolean {
  return [
    "item-login-required",
    "invalid-credentials",
    "invalid-mfa",
    "item-locked",
    "mfa-not-supported",
    "user-setup-required",
    "invalid-access-token",
    "item-not-found",
    "user-permission-revoked",
    "user-account-revoked",
    "access-not-granted",
    "no-accounts",
  ].includes((errorCode ?? "").toLowerCase());
}

function isPlaidConnectSession(connect: unknown): connect is PlaidConnectSession {
  return Boolean(
    connect &&
      typeof connect === "object" &&
      "kind" in connect &&
      connect.kind === "plaid" &&
      "linkToken" in connect &&
      typeof connect.linkToken === "string",
  );
}
