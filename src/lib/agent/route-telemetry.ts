import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResponse, PromptChip } from "@/lib/agent/card-types";
import type {
  AgentHistoryItem,
  PipAgentOnboardingState,
} from "@/lib/agent/ai-agent";
import {
  getAgentProductEventNames,
  recordProductEventSafely,
  type ProductEventName,
} from "@/lib/data/product-events";
import type { SyncStatus } from "@/lib/data/sync-status";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FinancialSnapshot } from "@/lib/types";

export type AgentRouteEventContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type AgentRouteTelemetryRequest = {
  scenario?: string;
  requestKind?: "chat" | "prompt_chips";
  selectedPromptChipId?: string;
  history?: AgentHistoryItem[];
  conversationState?: {
    shownCards?: Array<{ type: string; title?: string }>;
    lastToolNames?: string[];
    promptChips?: PromptChip[];
  };
};

export type AgentRouteTelemetryState = {
  onboardingState: PipAgentOnboardingState;
  snapshot?: FinancialSnapshot;
  syncStatus: SyncStatus | null;
};

export function createChatTurnRequestMetadata(
  input: AgentRouteTelemetryRequest,
  routeContext: AgentRouteTelemetryState | undefined,
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

export async function recordAgentEvents(
  context: AgentRouteEventContext | null,
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

export function getRouteAgentEventNames(
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
