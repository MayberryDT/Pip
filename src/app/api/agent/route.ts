import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AgentCard, AgentResponse } from "@/lib/agent/card-types";
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
import { runManualSync, ManualSyncRateLimitError } from "@/lib/data/manual-sync";
import {
  getAgentProductEventNames,
  recordProductEventSafely,
  type ProductEventName,
} from "@/lib/data/product-events";
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
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FinancialSnapshot } from "@/lib/types";

const requestSchema = z.object({
  message: z.string().min(1).max(500),
  requestKind: z.enum(["chat", "prompt_chips"]).optional(),
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

  try {
    routeContext = await createRouteAgentContext({
      scenario: parsed.data.scenario,
    });
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

    if (parsed.data.requestKind !== "prompt_chips") {
      const routeResult = routeContext.snapshot ? calculatePipCash(routeContext.snapshot) : null;

      await Promise.all([
        recordAgentEvents(routeContext.eventContext, {
          message: parsed.data.message,
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

    return NextResponse.json(response);
  } catch (error) {
    const payload = toAgentErrorPayload(error);
    const { status, ...body } = payload;

    if (parsed.data.requestKind !== "prompt_chips") {
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

    return NextResponse.json(body, { status });
  }
}

function createChatTurnRequestMetadata(
  input: AgentRouteRequest,
  routeContext: RouteAgentContext | undefined,
  response?: AgentResponse,
): Record<string, Json> {
  return {
    scenario: input.scenario ?? null,
    requestKind: input.requestKind ?? "chat",
    selectedPromptChipId: input.selectedPromptChipId ?? null,
    historyLength: input.history?.length ?? 0,
    shownCardCount: input.conversationState?.shownCards?.length ?? 0,
    lastToolCount: input.conversationState?.lastToolNames?.length ?? 0,
    promptChipCount: input.conversationState?.promptChips?.length ?? 0,
    onboardingStatus: routeContext?.onboardingState.status ?? null,
    hasFinancialData: routeContext?.onboardingState.hasFinancialData ?? false,
    hasSnapshot: Boolean(routeContext?.snapshot),
    syncInstitutionCount: routeContext?.syncStatus?.institutions.length ?? 0,
    syncHasStaleInstitution: routeContext?.syncStatus?.hasStaleInstitution ?? false,
    latestSyncStatus: routeContext?.syncStatus?.latestSyncRun?.status ?? null,
    responseQuality: response?.audit.quality ? response.audit.quality as unknown as Json : null,
  };
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

function createLocalDevConnectedAccounts(snapshot: FinancialSnapshot): ConnectedAccountsResult {
  const accountsByInstitutionName = new Map<string, FinancialSnapshot["accounts"]>();

  for (const account of snapshot.accounts) {
    const accounts = accountsByInstitutionName.get(account.institutionName) ?? [];
    accounts.push(account);
    accountsByInstitutionName.set(account.institutionName, accounts);
  }

  return {
    institutions: [...accountsByInstitutionName.entries()].map(([institutionName, accounts], index) => ({
      institutionId: `local-dev-${index + 1}`,
      institutionName,
      provider: "mock",
      status: "mocked",
      lastSuccessfulSyncAt: null,
      needsRepair: false,
      accounts: accounts.map((account) => ({
        accountId: account.id,
        name: account.name,
        kind: account.kind,
        ...(account.lastFour ? { lastFour: account.lastFour } : {}),
        includedInPipCash: account.includedInPipCash ?? !account.isProtectedSavings,
        isProtectedSavings: Boolean(account.isProtectedSavings),
        active: account.active ?? true,
        roleLabel: getLocalDevAccountRoleLabel(account),
      })),
    })),
  };
}

function getLocalDevAccountRoleLabel(account: FinancialSnapshot["accounts"][number]): string {
  if (account.isProtectedSavings) {
    return "Monthly Savings";
  }

  if (account.kind === "credit_card") {
    return "Credit card";
  }

  return "Spendable Cash";
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
    includeInSpendableCash: input.includeInSpendableCash ?? false,
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

async function recordAgentEvents(
  context: EventContext | null,
  input: {
    message: string;
    historyLength: number;
    response: AgentResponse;
    pipCashTodayCents: number | null;
    isShortfall?: boolean;
  },
) {
  if (!context) {
    return;
  }

  const cardTypes = input.response.cards.map((card) => card.type);
  const eventNames = getRouteAgentEventNames(input.response, input.pipCashTodayCents, {
    isFollowUp: input.historyLength > 0,
    isShortfall: input.isShortfall,
  });

  await Promise.all(
    eventNames.map((eventName) =>
      recordProductEventSafely(context.supabase, context.userId, eventName, {
        cardTypes: cardTypes.join(","),
        usedTools: input.response.usedTools.join(","),
        responseMode: input.response.responseMode,
        clientAction: input.response.clientAction?.type ?? "none",
        messageLength: input.message.length,
        historyLength: input.historyLength,
        isFollowUp: input.historyLength > 0,
        pipCashTodayCents: input.pipCashTodayCents,
        guidance: input.response.audit.guidance
          ? input.response.audit.guidance as unknown as Json
          : null,
        guidanceState: input.response.audit.guidance?.state ?? null,
        guidanceStance: input.response.audit.guidance?.stance ?? null,
        guidanceSource: input.response.audit.guidance?.guidanceSource ?? null,
        guidanceValidationOutcome: input.response.audit.guidance?.validationOutcome ?? null,
        guidanceEvidenceIds: input.response.audit.guidance?.evidenceIds?.join(",") ?? null,
      }),
    ),
  );
}

function getRouteAgentEventNames(
  response: AgentResponse,
  pipCashTodayCents: number | null,
  context: { isFollowUp?: boolean; isShortfall?: boolean } = {},
): ProductEventName[] {
  if (typeof pipCashTodayCents === "number") {
    return getAgentProductEventNames(response, pipCashTodayCents, context);
  }

  return context.isFollowUp
    ? ["agent_question_asked", "agent_follow_up_asked"]
    : ["agent_question_asked"];
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

function buildAccountConnectionsCard(result: ConnectedAccountsResult): AgentCard {
  return {
    type: "account_connections",
    title: "Account connections",
    institutions: result.institutions.map((institution, index) => ({
      institutionId: institution.institutionId,
      institutionName: institution.institutionName,
      provider: institution.provider,
      status: institution.status,
      lastSuccessfulSyncAt: institution.lastSuccessfulSyncAt,
      accounts: institution.accounts,
      actions: buildAccountConnectionActions(institution, index),
    })),
  };
}

function buildAccountConnectionActions(
  institution: ConnectedAccountsResult["institutions"][number],
  index: number,
): Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["actions"] {
  const actions: Extract<AgentCard, { type: "account_connections" }>["institutions"][number]["actions"] = [];

  if (index === 0) {
    actions.push({
      id: "add-account",
      label: "Add account",
      prompt: "Add account",
      style: "primary",
    });
  }

  if (institution.needsRepair) {
    actions.push({
      id: `repair-${institution.institutionId}`,
      label: "Reconnect",
      prompt: `Reconnect ${institution.institutionName}`,
      style: "primary",
    });
  }

  if (institution.provider === "plaid") {
    actions.push({
      id: `change-${institution.institutionId}`,
      label: "Change accounts",
      prompt: `Change ${institution.institutionName} accounts`,
      style: "secondary",
    });
  }

  actions.push({
    id: `remove-${institution.institutionId}`,
    label: "Remove",
    prompt: `Remove ${institution.institutionName}`,
    style: "danger",
  });

  return actions;
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

type InstitutionResolution =
  | {
      needsSelection?: false;
      institutionId: string;
    }
  | {
      needsSelection: true;
      status: string;
      message: string;
      accounts: ConnectedAccountsResult;
    };

async function resolveInstitutionTarget(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    institutionId?: string;
    institutionName?: string;
    provider?: FinancialProviderName;
    allowSingleDefault?: boolean;
  },
): Promise<InstitutionResolution> {
  const accounts = await loadConnectedAccountsForUser(supabase, input.userId);
  const institutions = accounts.institutions.filter((institution) =>
    input.provider ? institution.provider === input.provider : true,
  );

  if (input.institutionId) {
    const institution = institutions.find((candidate) => candidate.institutionId === input.institutionId);

    if (institution) {
      return {
        institutionId: institution.institutionId,
      };
    }
  }

  const target = normalizeTarget(input.institutionName);

  if (target) {
    const matches = institutions.filter((institution) =>
      normalizeTarget(institution.institutionName).includes(target),
    );

    if (matches.length === 1) {
      return {
        institutionId: matches[0].institutionId,
      };
    }

    return {
      needsSelection: true,
      status: matches.length > 1 ? "ambiguous_institution" : "institution_not_found",
      message: matches.length > 1
        ? "More than one institution matched that name."
        : "I could not find that institution.",
      accounts,
    };
  }

  if (input.allowSingleDefault && institutions.length === 1) {
    return {
      institutionId: institutions[0].institutionId,
    };
  }

  return {
    needsSelection: true,
    status: "institution_choice_required",
    message: "Choose which institution to use.",
    accounts,
  };
}

type AccountResolution =
  | {
      needsSelection?: false;
      accountId: string;
    }
  | {
      needsSelection: true;
      status: string;
      message: string;
      accounts: ConnectedAccountsResult;
    };

async function resolveAccountTarget(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    accountId?: string;
    accountName?: string;
  },
): Promise<AccountResolution> {
  const accounts = await loadConnectedAccountsForUser(supabase, input.userId);
  const accountList = accounts.institutions.flatMap((institution) =>
    institution.accounts.map((account) => ({
      ...account,
      institutionName: institution.institutionName,
    })),
  );

  if (input.accountId) {
    const account = accountList.find((candidate) => candidate.accountId === input.accountId);

    if (account) {
      return {
        accountId: account.accountId,
      };
    }
  }

  const target = normalizeTarget(input.accountName);

  if (target) {
    const matches = accountList.filter((account) => {
      const accountName = normalizeTarget(account.name);
      const institutionName = normalizeTarget(account.institutionName);

      return accountName.includes(target) || `${institutionName} ${accountName}`.includes(target);
    });

    if (matches.length === 1) {
      return {
        accountId: matches[0].accountId,
      };
    }

    return {
      needsSelection: true,
      status: matches.length > 1 ? "ambiguous_account" : "account_not_found",
      message: matches.length > 1
        ? "More than one account matched that name."
        : "I could not find that account.",
      accounts,
    };
  }

  return {
    needsSelection: true,
    status: "account_choice_required",
    message: "Choose which account to use.",
    accounts,
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
