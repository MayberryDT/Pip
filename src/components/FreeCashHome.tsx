"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AgentClientAction,
  AgentResponse,
  PlaidClientActionConfig,
  PromptChip,
} from "@/lib/agent/card-types";
import {
  getOnboardingPromptChips,
  getSuggestedPrompts,
} from "@/lib/agent/suggested-prompts";
import {
  type FinancialProvider,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";
import { type FakeDataScenario, getFakeSnapshot, isFakeDataScenario } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { formatMoney } from "@/lib/money";
import type { FreeCashResult } from "@/lib/types";
import { AgentInput } from "@/components/AgentInput";
import { AgentThread } from "@/components/AgentThread";
import { PromptChips } from "@/components/PromptChips";
import { openPlaidLink } from "@/lib/providers/plaid/link-browser";

type ThreadItem = {
  id: string;
  userText: string;
  response?: AgentResponse;
  errorText?: string;
  isPending?: boolean;
};

export type SpendableAuthState =
  | {
      status: "guest";
    }
  | {
      status: "needs-consent";
      email: string;
    }
  | {
      status: "ready";
      email?: string;
    };

export function FreeCashHome({
  authNotice,
  connectionNotice,
  authState,
  enableAccountControls = false,
}: {
  authNotice?: "auth-error";
  connectionNotice?: "plaid-connected";
  authState?: SpendableAuthState;
  enableAccountControls?: boolean;
}) {
  const [scenario, setScenario] = useState<FakeDataScenario>("default");
  const snapshot = useMemo(() => getFakeSnapshot(scenario), [scenario]);
  const localResult = useMemo(() => calculateFreeCash(snapshot), [snapshot]);
  const [serverResult, setServerResult] = useState<FreeCashResult | null>(null);
  const [serverErrorText, setServerErrorText] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [hasLoadedServerState, setHasLoadedServerState] = useState(false);
  const isOnboarding = authState?.status === "guest" || authState?.status === "needs-consent";
  const result = isOnboarding ? null : enableAccountControls ? serverResult : localResult;
  const hasLoadedServerResult = Boolean(result);
  const freeCashTodayCents = result?.freeCashTodayCents;
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [chips, setChips] = useState<PromptChip[]>(() =>
    getDefaultPromptChips(authState, enableAccountControls, null, localResult),
  );
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const hasConversation = thread.length > 0;
  const isReadyWithoutData =
    enableAccountControls && authState?.status === "ready" && hasLoadedServerState && !result;
  const isCheckingLiveData =
    enableAccountControls && authState?.status === "ready" && !hasLoadedServerState && !result;

  useEffect(() => {
    const urlScenario = new URLSearchParams(window.location.search).get("scenario");

    if (isFakeDataScenario(urlScenario)) {
      setScenario(urlScenario);
    }
  }, []);

  useEffect(() => {
    setConversationId(getOrCreateConversationId());
  }, []);

  useEffect(() => {
    if (!enableAccountControls) {
      setServerResult(null);
      setSyncStatus(null);
      setHasLoadedServerState(false);
      return;
    }

    let ignore = false;
    setHasLoadedServerState(false);

    async function loadBackendResult() {
      const response = await fetch(`/api/free-cash?scenario=${scenario}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => null);

        if (!ignore) {
          setServerResult(null);
          setServerErrorText(
            payload && typeof payload.error === "string"
              ? payload.error
              : "Connect financial data before using live Spendable Cash.",
          );
          setHasLoadedServerState(true);
        }
        return;
      }

      const payload = (await response.json()) as FreeCashResult;

      if (!ignore) {
        setServerResult(payload);
        setServerErrorText("");
        setHasLoadedServerState(true);
      }
    }

    async function loadSyncStatus() {
      const response = await fetch("/api/sync/status");

      if (!response.ok || ignore) {
        return;
      }

      setSyncStatus(await response.json());
    }

    void loadBackendResult();
    void loadSyncStatus();

    return () => {
      ignore = true;
    };
  }, [enableAccountControls, scenario]);

  useEffect(() => {
    setChips(getDefaultPromptChips(authState, enableAccountControls, result, localResult));

    if (!enableAccountControls) {
      setThread([]);
    }
  }, [authState, enableAccountControls, localResult, result]);

  async function submitPrompt(message: string, selectedPromptChipId?: string) {
    if (isSending) {
      return;
    }

    const itemId = createThreadItemId();
    const historyBeforeSend = thread;

    setThread((current) => [
      ...current,
      {
        id: itemId,
        userText: message,
        isPending: true,
      },
    ]);
    setIsSending(true);

    try {
      const response = await fetchAgentResponse(
        message,
        scenario,
        historyBeforeSend,
        conversationId ?? createConversationId(),
        selectedPromptChipId,
      );

      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response,
                isPending: false,
              }
            : item,
        ),
      );
      setChips(response.promptChips);
      await executeClientAction(response.clientAction);
    } catch (error) {
      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                errorText: getAgentErrorText(error),
                isPending: false,
              }
            : item,
        ),
      );
    } finally {
      setIsSending(false);
    }
  }

  function selectPromptChip(chip: PromptChip) {
    if (enableAccountControls) {
      void trackProductEvent("prompt_chip_selected", {
        chipId: chip.id,
        label: chip.label,
      });
    }

    void submitPrompt(chip.prompt, chip.id);
  }

  async function suppressMissingCardNudge(issuerName: string) {
    if (!enableAccountControls) {
      return;
    }

    const response = await fetch("/api/missing-card-preferences", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        issuerName,
      }),
    });

    if (!response.ok) {
      return;
    }

    setThread((current) =>
      current.map((item) =>
        item.response
          ? {
              ...item,
              response: {
                ...item.response,
                cards: item.response.cards.filter(
                  (card) => card.type !== "missing_card_nudge" || card.issuerName !== issuerName,
                ),
              },
            }
          : item,
      ),
    );
    setServerResult((current) =>
      current
        ? {
            ...current,
            warnings: current.warnings.filter((warning) => warning.issuerName !== issuerName),
          }
        : current,
    );
    setChips((current) => current.filter((chip) => chip.id !== "missing-card"));
  }

  useEffect(() => {
    if (!enableAccountControls || !hasLoadedServerResult || freeCashTodayCents === undefined) {
      return;
    }

    void trackProductEvent("free_cash_viewed", {
      scenario,
      freeCashTodayCents,
      negative: freeCashTodayCents < 0,
    });
  }, [enableAccountControls, freeCashTodayCents, hasLoadedServerResult, scenario]);

  return (
    <main className="free-cash-app-shell h-[100dvh] overflow-hidden px-5 py-5 text-ink sm:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col">
        <section className={hasConversation ? "spendable-hero is-chatting" : "spendable-hero"}>
          <p className="spendable-label">
            Spendable Cash
          </p>
          <h1
            className="spendable-number"
            data-testid="free-cash-number"
          >
            {result ? formatMoney(result.freeCashTodayCents) : "$--"}
          </h1>
        </section>

        <section className="mt-6 flex min-h-0 flex-1 flex-col max-[380px]:mt-5">
          {isOnboarding && thread.length === 0 ? (
            <OnboardingIntro authNotice={authNotice} authState={authState} />
          ) : isCheckingLiveData && thread.length === 0 ? (
            <ReadyIntro connectionNotice={connectionNotice} variant="checking" />
          ) : isReadyWithoutData && thread.length === 0 ? (
            <ReadyIntro connectionNotice={connectionNotice} variant="needs-data" />
          ) : thread.length === 0 ? (
            <DefaultInsightCards connectionNotice={connectionNotice} result={result} />
          ) : (
            <AgentThread
              thread={thread}
              onSuppressMissingCard={enableAccountControls ? suppressMissingCardNudge : undefined}
            />
          )}
          <PromptChips chips={chips} onSelect={selectPromptChip} />
          <AgentInput
            busy={isSending}
            onSubmit={submitPrompt}
            placeholder={getInputPlaceholder(authState)}
          />
        </section>
      </div>
    </main>
  );

  async function executeClientAction(action: AgentClientAction | undefined) {
    if (!action || action.type === "none") {
      return;
    }

    if (action.type === "oauth_redirect") {
      window.setTimeout(() => {
        window.location.assign(action.url);
      }, 250);
      return;
    }

    if (action.type === "reload") {
      window.setTimeout(() => window.location.reload(), 650);
      return;
    }

    if (action.type === "open_plaid") {
      await completePlaidClientAction(action.plaid);
      window.setTimeout(() => window.location.reload(), 650);
    }
  }

  async function completePlaidClientAction(plaid: PlaidClientActionConfig) {
    const connection = await openPlaidLink(plaid);

    if (plaid.mode === "repair") {
      await runRefreshFromChat("plaid", "repair");
      return;
    }

    if (!connection.publicToken) {
      throw new Error("Plaid did not return a public token.");
    }

    const exchangeResponse = await fetch("/api/providers/plaid/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publicToken: connection.publicToken,
        metadata: connection.metadata,
      }),
    });
    const exchangePayload = await exchangeResponse.json().catch(() => null);

    if (!exchangeResponse.ok) {
      throw new Error(getErrorMessage(exchangePayload, "Plaid exchange failed."));
    }

    await runRefreshFromChat("plaid");
  }

  async function runRefreshFromChat(provider: FinancialProvider, reason: "manual" | "repair" = "manual") {
    const response = await fetch("/api/sync/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider,
        reason,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const retry = payload?.retryAfterSeconds ? ` Try again in ${payload.retryAfterSeconds}s.` : "";
      throw new Error(`${getErrorMessage(payload, "Refresh failed.")}${retry}`);
    }
  }

}

function OnboardingIntro({
  authNotice,
  authState,
}: {
  authNotice?: "auth-error";
  authState: SpendableAuthState;
}) {
  if (authState.status === "needs-consent") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
        <section className="glass-panel px-6 py-4">
          <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
            Welcome back. Step 2 is choosing protected savings.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
            This is money I keep out of Spendable Cash before answering spending questions. Choose a
            monthly amount now, or tap Use $200 to keep going.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      <section className="glass-panel px-6 py-4">
        {authNotice ? <AuthNotice /> : null}
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          Welcome to Spendable. Your Spendable Cash number starts here.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
          I’ll walk you through setup right here: sign in, choose protected savings, connect your
          account data, then I’ll calculate Spendable Cash.
        </p>
      </section>
    </div>
  );
}

function AuthNotice() {
  return (
    <p className="mb-3 rounded-[8px] border border-ink/10 bg-white/60 px-4 py-3 text-sm leading-6 text-ink/[0.72]">
      Google sign-in could not finish. Try Continue with Google again from here.
    </p>
  );
}

function ReadyIntro({
  connectionNotice,
  variant,
}: {
  connectionNotice?: "plaid-connected";
  variant: "checking" | "needs-data";
}) {
  if (variant === "checking") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
        {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
        <section className="glass-panel px-6 py-4">
          <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
            Welcome back. I’m checking for connected data.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
            If nothing is connected yet, I’ll start the next step here in chat.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      <section className="glass-panel px-6 py-4">
        {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          You’re signed in. Step 3 is connecting your data.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
          Tap Connect data and I’ll open Plaid. After your accounts sync, Spendable turns the real
          balances and transactions into one Spendable Cash number.
        </p>
      </section>

      <section className="glass-panel px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-normal text-taupe">What happens next</p>
        <p className="font-display mt-3 text-[1.34rem] leading-[1.3] text-ink max-[380px]:text-[1.18rem]">
          You can ask why the number changed, whether a purchase fits, or what data is missing.
        </p>
      </section>
    </div>
  );
}

function DefaultInsightCards({
  connectionNotice,
  result,
}: {
  connectionNotice?: "plaid-connected";
  result: FreeCashResult | null;
}) {
  const amount = result ? formatMoney(result.freeCashTodayCents) : "Spendable Cash";

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
      <section className="glass-panel px-6 py-4">
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          {result
            ? `Good morning. You have ${amount} in spendable cash.`
            : "Connect data to calculate Spendable Cash."}
        </p>
        <p className="font-display mt-3 text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          {result ? "Here's what's behind that number." : "Then ask what's behind the number."}
        </p>
      </section>

      <section className="glass-panel px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-normal text-taupe">Temporary insight</p>
        <p className="font-display mt-3 text-[1.34rem] leading-[1.3] text-ink max-[380px]:text-[1.18rem]">
          It's based on what's real, what's due, and what you've told me matters.
        </p>
        <p className="mt-3 text-sm font-medium text-taupe">Updated throughout the day</p>
      </section>
    </div>
  );
}

function PlaidConnectedNotice() {
  return (
    <section className="glass-panel px-6 py-4">
      <p className="text-xs font-bold uppercase tracking-normal text-taupe">Plaid connected</p>
      <p className="font-display mt-3 text-[1.34rem] leading-[1.3] text-ink max-[380px]:text-[1.18rem]">
        Your account data connected successfully. I’m using it here to calculate Spendable Cash.
      </p>
    </section>
  );
}

function getInputPlaceholder(authState: SpendableAuthState | undefined): string {
  if (authState?.status === "guest") {
    return "Ask or continue with Google...";
  }

  if (authState?.status === "needs-consent") {
    return "Protected savings, e.g. 200...";
  }

  return "Ask anything...";
}

function getDefaultPromptChips(
  authState: SpendableAuthState | undefined,
  enableAccountControls: boolean,
  result: FreeCashResult | null,
  localResult: FreeCashResult,
): PromptChip[] {
  if (authState?.status === "guest" || authState?.status === "needs-consent") {
    return getOnboardingPromptChips({
      status: authState.status,
      hasFinancialData: false,
    });
  }

  if (enableAccountControls && !result) {
    return getOnboardingPromptChips({
      status: "ready",
      hasFinancialData: false,
    });
  }

  return getSuggestedPrompts(result ?? localResult);
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}

async function fetchAgentResponse(
  message: string,
  scenario: FakeDataScenario,
  thread: ThreadItem[],
  conversationId: string,
  selectedPromptChipId?: string,
): Promise<AgentResponse> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      conversationId,
      scenario,
      selectedPromptChipId,
      history: getThreadHistory(thread),
      conversationState: getConversationState(thread),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = payload && typeof payload.error === "string" ? payload.error : "Agent request failed.";
    const detail = payload && typeof payload.detail === "string" ? payload.detail : "";

    throw new Error([error, detail].filter(Boolean).join(" "));
  }

  return response.json();
}

function getThreadHistory(thread: ThreadItem[]) {
  return thread.flatMap((item) => {
    const history: Array<{ role: "user" | "assistant"; content: string }> = [
      {
        role: "user",
        content: item.userText,
      },
    ];

    if (item.response?.message) {
      history.push({
        role: "assistant",
        content: item.response.message,
      });
    }

    return history;
  }).slice(-8);
}

function getConversationState(thread: ThreadItem[]) {
  const shownCards = thread
    .flatMap((item) => item.response?.cards ?? [])
    .map((card) => ({
      type: card.type,
      title: card.title,
    }))
    .slice(-8);
  const lastToolNames = thread
    .flatMap((item) => item.response?.usedTools ?? item.response?.audit.toolNames ?? [])
    .slice(-8);

  return {
    shownCards,
    lastToolNames,
  };
}

function getAgentErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "AI request failed.";
}

function createThreadItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const spendableConversationStorageKey = "spendable-conversation-id";

function getOrCreateConversationId(): string {
  if (typeof window === "undefined") {
    return createConversationId();
  }

  try {
    const existing = window.localStorage.getItem(spendableConversationStorageKey);

    if (existing) {
      return existing;
    }

    const next = createConversationId();
    window.localStorage.setItem(spendableConversationStorageKey, next);

    return next;
  } catch {
    return createConversationId();
  }
}

function createConversationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `web-${crypto.randomUUID()}`;
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function trackProductEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  await fetch("/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventName,
      properties,
    }),
  }).catch(() => null);
}
