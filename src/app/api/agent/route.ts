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
  deleteCurrentUserFinancialData,
  markFreeCashSnapshotsStaleForUser,
  upsertUserSettings,
} from "@/lib/data/financial-repository";
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
  type SpendableAgentActions,
  type SpendableAgentOnboardingState,
  type SpendableAgentActionResult,
} from "@/lib/agent/ai-agent";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import type { FinancialProviderName, PlaidConnectSession } from "@/lib/providers/FinancialDataProvider";
import { ProviderSyncError } from "@/lib/providers/provider-errors";
import {
  getFinancialDataProvider,
  ProviderUnavailableError,
} from "@/lib/providers/provider-registry";
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
  scenario: z.enum(["default", "negative"]).optional(),
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
            label: z.string().min(1).max(36),
            prompt: z.string().min(1).max(160),
          }),
        )
        .max(24)
        .optional(),
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
  onboardingState: SpendableAgentOnboardingState;
  snapshot?: FinancialSnapshot;
  syncStatus: SyncStatus | null;
  actions?: SpendableAgentActions;
};

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
        history: parsed.data.history,
        conversationState: parsed.data.conversationState,
        syncStatus: routeContext.syncStatus,
        onboardingState: routeContext.onboardingState,
        selectedPromptChipId: parsed.data.selectedPromptChipId,
        actions: routeContext.actions,
      },
    );

    if (parsed.data.requestKind !== "prompt_chips") {
      await Promise.all([
        recordAgentEvents(routeContext.eventContext, {
          message: parsed.data.message,
          historyLength: parsed.data.history?.length ?? 0,
          response,
          freeCashTodayCents: routeContext.snapshot
            ? calculateFreeCash(routeContext.snapshot).freeCashTodayCents
            : null,
        }),
        recordAgentChatTurnSafely(routeContext.eventContext?.supabase ?? null, {
          userId: routeContext.eventContext?.userId ?? null,
          conversationId,
          userMessage: parsed.data.message,
          response,
          requestMetadata: createChatTurnRequestMetadata(parsed.data, routeContext),
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
  };
}

function createServerConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `server-${crypto.randomUUID()}`;
  }

  return `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function createRouteAgentContext(input: {
  scenario?: "default" | "negative";
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

function createAgentActions(input: {
  eventContext: EventContext;
  onboardingStatus: SpendableAgentOnboardingState["status"];
  syncStatus: SyncStatus | null;
}): SpendableAgentActions {
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
        await markFreeCashSnapshotsStaleForUser(supabase, userId);
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
    async startPlaidLink() {
      const { supabase, userId } = input.eventContext;
      const providerName: FinancialProviderName = "plaid";
      const provider = getFinancialDataProvider(providerName);
      const connectRequest = getPlaidConnectRequest(input.syncStatus);
      const session = await provider.createConnectSession(userId, connectRequest);

      await recordProductEventSafely(
        supabase,
        userId,
        session.status === "ready" ? "connect_session_created" : "connect_session_failed",
        {
          provider: providerName,
          status: session.status,
          mode: connectRequest.mode,
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
          freeCashTodayCents: result.freeCashTodayCents,
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

function toToolFailureResult(error: unknown, status: string): SpendableAgentActionResult {
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
    freeCashTodayCents: number | null;
  },
) {
  if (!context) {
    return;
  }

  const cardTypes = input.response.cards.map((card) => card.type);
  const eventNames = getRouteAgentEventNames(input.response, input.freeCashTodayCents, {
    isFollowUp: input.historyLength > 0,
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
        freeCashTodayCents: input.freeCashTodayCents,
      }),
    ),
  );
}

function getRouteAgentEventNames(
  response: AgentResponse,
  freeCashTodayCents: number | null,
  context: { isFollowUp?: boolean } = {},
): ProductEventName[] {
  if (typeof freeCashTodayCents === "number") {
    return getAgentProductEventNames(response, freeCashTodayCents, context);
  }

  return context.isFollowUp
    ? ["agent_question_asked", "agent_follow_up_asked"]
    : ["agent_question_asked"];
}

function getPlaidConnectRequest(syncStatus: SyncStatus | null): {
  mode: "connect" | "repair";
  institutionId?: string;
} {
  const repairInstitution = getRepairablePlaidInstitution(syncStatus);

  if (repairInstitution) {
    return {
      mode: "repair",
      institutionId: repairInstitution.id,
    };
  }

  return {
    mode: "connect",
  };
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

function getRepairablePlaidInstitution(syncStatus: SyncStatus | null) {
  return syncStatus?.institutions.find((institution) => {
    if (institution.provider !== "plaid") {
      return false;
    }

    return isRepairablePlaidErrorCode(institution.errorCode) || institution.status === "revoked";
  });
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
