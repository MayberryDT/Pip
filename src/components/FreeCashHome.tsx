"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentResponse, PromptChip } from "@/lib/agent/card-types";
import { getSuggestedPrompts } from "@/lib/agent/suggested-prompts";
import {
  getPlaidConnectRequest,
  getRefreshProvider,
  type FinancialProvider,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";
import { type FakeDataScenario, getFakeSnapshot, isFakeDataScenario } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { formatMoney, parseDollarAmount } from "@/lib/money";
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

const GUEST_ONBOARDING_CHIPS: PromptChip[] = [
  {
    id: "how-spendable-works",
    label: "How it works",
    prompt: "Tell me how Spendable works",
  },
  {
    id: "get-signed-up",
    label: "Get signed up",
    prompt: "Get me signed up",
  },
  {
    id: "connect-data",
    label: "Connect data",
    prompt: "Let's connect my data",
  },
];

const CONSENT_ONBOARDING_CHIPS: PromptChip[] = [
  {
    id: "use-default-savings",
    label: "Use $200",
    prompt: "continue",
  },
  {
    id: "set-250-savings",
    label: "Use $250",
    prompt: "$250",
  },
  {
    id: "why-protected-savings",
    label: "Why this step?",
    prompt: "Why do you need protected savings?",
  },
];

const DATA_ONBOARDING_CHIPS: PromptChip[] = [
  {
    id: "how-spendable-works",
    label: "How it works",
    prompt: "Tell me how Spendable works",
  },
  {
    id: "connect-data",
    label: "Connect data",
    prompt: "Connect my data",
  },
  {
    id: "set-protected-savings",
    label: "Protected savings",
    prompt: "Set protected savings",
  },
];

type PlaidConnectConfig = {
  kind: "plaid";
  linkToken: string;
  environment: "sandbox" | "production";
  products: string[];
  mode: "connect" | "repair";
};

type ConnectSessionResponse = {
  provider: "mock" | "teller" | "plaid";
  status: "ready" | "unavailable";
  message: string;
  connect?: PlaidConnectConfig | {
    kind: string;
  };
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
  authState,
  enableAccountControls = false,
}: {
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
    enableAccountControls ? [] : getSuggestedPrompts(localResult),
  );
  const [isSending, setIsSending] = useState(false);
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
              : "Connect financial data before using live Free Cash.",
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
    setChips(result ? getSuggestedPrompts(result) : []);
    setThread([]);
  }, [result]);

  async function submitPrompt(message: string) {
    if (isSending) {
      return;
    }

    if (authState?.status === "guest") {
      await submitEmailOnboarding(message);
      return;
    }

    if (authState?.status === "needs-consent") {
      await submitConsentOnboarding(message);
      return;
    }

    if (enableAccountControls && isDataActionPrompt(message)) {
      await submitDataAction(message);
      return;
    }

    if (enableAccountControls && !result) {
      await submitDataAction(message);
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
      const response = await fetchAgentResponse(message, scenario, historyBeforeSend);

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

    void submitPrompt(chip.prompt);
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
          <p className="spendable-wordmark">
            Spendable
          </p>
          <p className="spendable-label">
            Free Cash Today
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
            <OnboardingIntro authState={authState} />
          ) : isCheckingLiveData && thread.length === 0 ? (
            <ReadyIntro variant="checking" />
          ) : isReadyWithoutData && thread.length === 0 ? (
            <ReadyIntro variant="needs-data" />
          ) : thread.length === 0 ? (
            <DefaultInsightCards result={result} />
          ) : (
            <AgentThread
              thread={thread}
              onSuppressMissingCard={enableAccountControls ? suppressMissingCardNudge : undefined}
            />
          )}
          <PromptChips chips={getActivePromptChips(authState, enableAccountControls, result, chips)} onSelect={selectPromptChip} />
          <AgentInput
            busy={isSending}
            onSubmit={submitPrompt}
            placeholder={getInputPlaceholder(authState)}
          />
        </section>
      </div>
    </main>
  );

  async function submitEmailOnboarding(message: string) {
    const itemId = createThreadItemId();
    const email = message.trim();

    setThread((current) => [
      ...current,
      {
        id: itemId,
        userText: message,
        isPending: true,
      },
    ]);

    if (!isLikelyEmail(email)) {
      const onboardingResponse = getGuestOnboardingResponse(message);

      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response: createLocalOnboardingResponse(onboardingResponse),
                isPending: false,
              }
            : item,
        ),
      );
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getFriendlyAuthError(payload && typeof payload.error === "string" ? payload.error : "Sign-in failed."),
        );
      }

      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response: createLocalOnboardingResponse(
                  `I sent the sign-in link to ${email}. Open it here, and I’ll keep going on this same Spendable screen.`,
                ),
                isPending: false,
              }
            : item,
        ),
      );
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

  async function submitConsentOnboarding(message: string) {
    const itemId = createThreadItemId();
    const amountCents = getProtectedSavingsCents(message);

    setThread((current) => [
      ...current,
      {
        id: itemId,
        userText: message,
        isPending: true,
      },
    ]);

    if (amountCents === null) {
      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response: createLocalOnboardingResponse(getConsentOnboardingResponse(message)),
                isPending: false,
              }
            : item,
        ),
      );
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch("/api/auth/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protectedSavingsMonthlyCents: amountCents,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string" ? payload.error : "Consent request failed.",
        );
      }

      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response: createLocalOnboardingResponse(
                  "You’re set. I’m loading your Free Cash number on this same screen now.",
                ),
                isPending: false,
              }
            : item,
        ),
      );
      window.setTimeout(() => window.location.reload(), 650);
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

  async function submitDataAction(message: string) {
    const itemId = createThreadItemId();
    const shouldConnectData = isConnectDataPrompt(message);

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
      if (shouldConnectData) {
        setThread((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  response: createLocalOnboardingResponse(
                    "I’m opening Plaid now. Finish the secure Plaid window, then I’ll sync your accounts and calculate Free Cash here.",
                    DATA_ONBOARDING_CHIPS,
                  ),
                  isPending: false,
                }
              : item,
          ),
        );
        await connectDataFromChat();
        setThread((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  response: createLocalOnboardingResponse(
                    "Connected. I’m syncing your account data and calculating Free Cash now.",
                    [],
                  ),
                  isPending: false,
                }
              : item,
          ),
        );
        window.setTimeout(() => window.location.reload(), 650);
        return;
      }

      const response = await runDataAction(message);

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
    } catch (error) {
      setThread((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                response: undefined,
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

  async function runDataAction(message: string): Promise<AgentResponse> {
    if (isHowItWorksPrompt(message)) {
      return createLocalOnboardingResponse(
        "Spendable turns your connected account activity into one plain number: what is safe to spend today. Setup is three steps: sign in, choose protected savings, then connect bank data. After that, ask me why the number changed, whether a purchase fits, or what transactions are affecting it.",
        isReadyWithoutData ? DATA_ONBOARDING_CHIPS : chips,
      );
    }

    if (isProtectedSavingsPrompt(message)) {
      const amountCents = parseDollarAmount(message);

      if (amountCents === null) {
        return createLocalOnboardingResponse(
          "Protected savings is money I hold out of Free Cash before I answer spending questions. Type something like “set protected savings to 300” and I’ll save it here.",
          DATA_ONBOARDING_CHIPS,
        );
      }

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          protectedSavingsMonthlyCents: amountCents,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "I couldn't update protected savings."));
      }

      return createLocalOnboardingResponse(
        `Done. I’ll hold ${formatMoney(amountCents)} out of Free Cash each month before calculating what is safe to spend.`,
        DATA_ONBOARDING_CHIPS,
      );
    }

    if (isDeleteDataConfirmation(message)) {
      const response = await fetch("/api/delete-data", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "I couldn't delete your stored data."));
      }

      window.setTimeout(() => window.location.reload(), 650);
      return createLocalOnboardingResponse("Deleted. I’m refreshing Spendable now.", DATA_ONBOARDING_CHIPS);
    }

    if (isDeleteDataPrompt(message)) {
      return createLocalOnboardingResponse(
        "I can delete stored financial data from here, but I need a clear confirmation first. Type DELETE DATA in all caps and I’ll remove it.",
        DATA_ONBOARDING_CHIPS,
      );
    }

    if (isRefreshDataPrompt(message)) {
      await refreshDataFromChat();
      window.setTimeout(() => window.location.reload(), 650);
      return createLocalOnboardingResponse("Refreshed. I’m loading the updated Free Cash number now.", chips);
    }

    return createLocalOnboardingResponse(
      "Welcome to Spendable. I’ll walk you through setup here in the chat. First we connect your data, then I calculate one Free Cash number, and after that you can ask what changed or whether a purchase fits.",
      DATA_ONBOARDING_CHIPS,
    );
  }

  async function connectDataFromChat() {
    const currentSyncStatus = syncStatus ?? (await loadSyncStatusFromApi());
    const connectResponse = await fetch("/api/providers/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "plaid",
        ...getPlaidConnectRequest(currentSyncStatus),
      }),
    });
    const connectPayload = await connectResponse.json().catch(() => null);

    if (!connectResponse.ok) {
      throw new Error(getErrorMessage(connectPayload, "I couldn't start Plaid."));
    }

    const connectSession = connectPayload as ConnectSessionResponse | null;

    if (connectSession?.status !== "ready" || !connectSession.connect) {
      throw new Error(connectSession?.message ?? "Plaid is not available right now.");
    }

    if (!isPlaidConnectConfig(connectSession.connect)) {
      throw new Error("Plaid connection is unavailable.");
    }

    const connection = await openPlaidLink(connectSession.connect);

    if (connectSession.connect.mode === "repair") {
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

  async function refreshDataFromChat() {
    const currentSyncStatus = syncStatus ?? (await loadSyncStatusFromApi());
    const provider = getRefreshProvider(currentSyncStatus);

    if (!provider) {
      throw new Error("Connect your data first, then I can refresh it from chat.");
    }

    await runRefreshFromChat(provider);
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

  async function loadSyncStatusFromApi(): Promise<SyncStatusResponse | null> {
    const response = await fetch("/api/sync/status");

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    setSyncStatus(payload);
    return payload;
  }
}

function OnboardingIntro({ authState }: { authState: SpendableAuthState }) {
  if (authState.status === "needs-consent") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
        <section className="glass-panel px-6 py-4">
          <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
            Welcome back. Step 2 is choosing protected savings.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
            This is money I keep out of Free Cash before answering spending questions. Choose a
            monthly amount now, or tap Use $200 to keep going.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      <section className="glass-panel px-6 py-4">
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          Welcome to Spendable. Your Free Cash number starts here.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
          I’ll walk you through setup right here: sign in, choose protected savings, connect your
          account data, then I’ll calculate what is safe to spend today.
        </p>
      </section>
    </div>
  );
}

function ReadyIntro({ variant }: { variant: "checking" | "needs-data" }) {
  if (variant === "checking") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
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
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          You’re signed in. Step 3 is connecting your data.
        </p>
        <p className="mt-3 text-sm leading-6 text-ink/[0.66]">
          Tap Connect data and I’ll open Plaid. After your accounts sync, Spendable turns the real
          balances and transactions into one Free Cash number.
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

function DefaultInsightCards({ result }: { result: FreeCashResult | null }) {
  const amount = result ? formatMoney(result.freeCashTodayCents) : "Free Cash";

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      <section className="glass-panel px-6 py-4">
        <p className="font-display text-[1.42rem] leading-[1.28] text-ink max-[380px]:text-[1.28rem]">
          {result
            ? `Good morning. You have ${amount} in free cash today.`
            : "Connect data to calculate free cash today."}
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

function getInputPlaceholder(authState: SpendableAuthState | undefined): string {
  if (authState?.status === "guest") {
    return "Enter your email...";
  }

  if (authState?.status === "needs-consent") {
    return "Protected savings, e.g. 200...";
  }

  return "Ask anything...";
}

function getActivePromptChips(
  authState: SpendableAuthState | undefined,
  enableAccountControls: boolean,
  result: FreeCashResult | null,
  chips: PromptChip[],
): PromptChip[] {
  if (authState?.status === "guest") {
    return GUEST_ONBOARDING_CHIPS;
  }

  if (authState?.status === "needs-consent") {
    return CONSENT_ONBOARDING_CHIPS;
  }

  if (enableAccountControls && !result) {
    return DATA_ONBOARDING_CHIPS;
  }

  return chips;
}

function createLocalOnboardingResponse(message: string, promptChips: PromptChip[] = []): AgentResponse {
  return {
    message,
    cards: [],
    promptChips,
    audit: {
      toolNames: [],
      usedModel: false,
    },
  };
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getGuestOnboardingResponse(message: string): string {
  if (isHowItWorksPrompt(message)) {
    return "Spendable looks at account data you connect, subtracts money you want protected, and gives you one Free Cash number for today. Setup stays here in chat: sign in first, choose protected savings, then connect data.";
  }

  if (isConnectDataPrompt(message)) {
    return "We’ll connect data right after sign-in. First type the email attached to your private beta invite, and I’ll send the link.";
  }

  if (/sign|start|signup|signed|get me/i.test(message)) {
    return "Great. Type the email attached to your private beta invite, and I’ll send the sign-in link. After that, I’ll keep setup moving here on this screen.";
  }

  return "Type the email attached to your private beta invite. I’ll send the sign-in link, then walk you through the rest here.";
}

function getConsentOnboardingResponse(message: string): string {
  if (isHowItWorksPrompt(message) || /why/i.test(message)) {
    return "Protected savings is money you do not want treated as spendable. Spendable subtracts it before calculating Free Cash, so the number stays honest. Choose a monthly amount like 200, or tap Use $200.";
  }

  if (isConnectDataPrompt(message)) {
    return "Almost. First choose protected savings, then I’ll move you to the data connection step.";
  }

  return "Type a monthly protected-savings amount, like 200, or tap Use $200 to keep going.";
}

function getProtectedSavingsCents(message: string): number | null {
  if (/^(continue|default|yes|ok|okay)$/i.test(message.trim())) {
    return 20000;
  }

  return parseDollarAmount(message);
}

function getFriendlyAuthError(error: string): string {
  if (/rate limit/i.test(error)) {
    return "I hit the email send limit. Wait a minute, then ask me to send the sign-in link again.";
  }

  return error;
}

function isDataActionPrompt(message: string): boolean {
  return (
    isHowItWorksPrompt(message) ||
    isConnectDataPrompt(message) ||
    isProtectedSavingsPrompt(message) ||
    isDeleteDataPrompt(message) ||
    isDeleteDataConfirmation(message) ||
    isRefreshDataPrompt(message)
  );
}

function isHowItWorksPrompt(message: string): boolean {
  return /how.*works|what.*spendable|tell me more|explain/i.test(message);
}

function isConnectDataPrompt(message: string): boolean {
  return /connect|plaid|link.*account|bank data|account data/i.test(message);
}

function isProtectedSavingsPrompt(message: string): boolean {
  return /protected savings|savings/i.test(message);
}

function isDeleteDataPrompt(message: string): boolean {
  return /delete.*data|erase.*data|remove.*data/i.test(message);
}

function isDeleteDataConfirmation(message: string): boolean {
  return message.trim() === "DELETE DATA";
}

function isRefreshDataPrompt(message: string): boolean {
  return /refresh|sync/i.test(message);
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}

function isPlaidConnectConfig(connect: ConnectSessionResponse["connect"]): connect is PlaidConnectConfig {
  return Boolean(
    connect &&
      connect.kind === "plaid" &&
      "linkToken" in connect &&
      typeof connect.linkToken === "string" &&
      "mode" in connect &&
      (connect.mode === "connect" || connect.mode === "repair"),
  );
}

async function fetchAgentResponse(
  message: string,
  scenario: FakeDataScenario,
  thread: ThreadItem[],
): Promise<AgentResponse> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      scenario,
      history: getThreadHistory(thread),
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
