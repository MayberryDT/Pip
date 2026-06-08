"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentClientAction,
  AgentResponse,
  PlaidClientActionConfig,
  PromptChip,
} from "@/lib/agent/card-types";
import {
  getOnboardingPromptChips,
} from "@/lib/agent/suggested-prompts";
import {
  canRefreshData,
  getRefreshProvider,
  shouldRefreshConnectedDataForToday,
  type FinancialProvider,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";
import { type FakeDataScenario, getFakeSnapshot, isFakeDataScenario } from "@/lib/fake-data";
import { calculateFreeCash } from "@/lib/free-cash/engine";
import { formatMoney } from "@/lib/money";
import type { FreeCashResult } from "@/lib/types";
import { AgentInput } from "@/components/AgentInput";
import { AgentThread } from "@/components/AgentThread";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";
import { ProtectedSavingsPicker } from "@/components/onboarding/ProtectedSavingsPicker";
import { PromptChips } from "@/components/PromptChips";
import { openPlaidLink } from "@/lib/providers/plaid/link-browser";
import type { PlaidEventMetadata } from "@/lib/providers/plaid/link-browser";

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
  devOnboardingFlow = false,
  enableAccountControls = false,
}: {
  authNotice?: "auth-error";
  connectionNotice?: "plaid-connected";
  authState?: SpendableAuthState;
  devOnboardingFlow?: boolean;
  enableAccountControls?: boolean;
}) {
  const [scenario, setScenario] = useState<FakeDataScenario>("default");
  const snapshot = useMemo(() => getFakeSnapshot(scenario), [scenario]);
  const localResult = useMemo(() => calculateFreeCash(snapshot), [snapshot]);
  const [devAuthState, setDevAuthState] = useState<SpendableAuthState>({
    status: "guest",
  });
  const [devHasConnectedData, setDevHasConnectedData] = useState(false);
  const activeAuthState = devOnboardingFlow ? devAuthState : authState;
  const liveAccountControlsEnabled = !devOnboardingFlow && enableAccountControls;
  const onboardingPromptControlsEnabled = liveAccountControlsEnabled || devOnboardingFlow;
  const [serverResult, setServerResult] = useState<FreeCashResult | null>(null);
  const [serverErrorText, setServerErrorText] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [hasLoadedServerState, setHasLoadedServerState] = useState(false);
  const [backendReloadKey, setBackendReloadKey] = useState(0);
  const [hasAttemptedDailyRefresh, setHasAttemptedDailyRefresh] = useState(false);
  const isOnboarding =
    activeAuthState?.status === "guest" || activeAuthState?.status === "needs-consent";
  const result = isOnboarding
    ? null
    : devOnboardingFlow
      ? devHasConnectedData
        ? localResult
        : null
      : liveAccountControlsEnabled
        ? serverResult
        : localResult;
  const hasLoadedServerResult = Boolean(result);
  const freeCashTodayCents = result?.freeCashTodayCents;
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [chips, setChips] = useState<PromptChip[]>(() =>
    getDefaultPromptChips(activeAuthState, onboardingPromptControlsEnabled, null),
  );
  const [chipHistory, setChipHistory] = useState<PromptChip[]>(() =>
    getDefaultPromptChips(activeAuthState, onboardingPromptControlsEnabled, null),
  );
  const promptChipRequestKeyRef = useRef<string | null>(null);
  const lastNonEmptyChipsRef = useRef<PromptChip[]>(chips);
  const [promptChipRefreshSequence, setPromptChipRefreshSequence] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const hasConversation = thread.length > 0;
  const isReadyWithoutData =
    devOnboardingFlow && activeAuthState?.status === "ready"
      ? !devHasConnectedData
      : liveAccountControlsEnabled && activeAuthState?.status === "ready" && hasLoadedServerState && !result;
  const isCheckingLiveData =
    !devOnboardingFlow &&
    liveAccountControlsEnabled &&
    activeAuthState?.status === "ready" &&
    !hasLoadedServerState &&
    !result;
  const showAgentInput = activeAuthState?.status !== "needs-consent" || thread.length > 0;
  const showPromptChips = activeAuthState?.status !== "needs-consent" || thread.length > 0;

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
    if (!liveAccountControlsEnabled) {
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
              : "Connect financial data before using live Spendable Cash Today.",
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
  }, [backendReloadKey, liveAccountControlsEnabled, scenario]);

  useEffect(() => {
    if (
      !liveAccountControlsEnabled ||
      activeAuthState?.status !== "ready" ||
      !syncStatus ||
      hasAttemptedDailyRefresh ||
      !shouldRefreshConnectedDataForToday(syncStatus)
    ) {
      return;
    }

    const provider = getRefreshProvider(syncStatus);

    if (!provider || !canRefreshData(syncStatus)) {
      return;
    }

    setHasAttemptedDailyRefresh(true);
    void runRefreshFromChat(provider, "manual")
      .then(() => {
        setBackendReloadKey((current) => current + 1);
      })
      .catch(() => {
        setBackendReloadKey((current) => current + 1);
      });
  }, [activeAuthState?.status, hasAttemptedDailyRefresh, liveAccountControlsEnabled, syncStatus]);

  useEffect(() => {
    if (hasConversation) {
      return;
    }

    const defaultChips = getDefaultPromptChips(
      activeAuthState,
      onboardingPromptControlsEnabled,
      result,
    );

    setChips(defaultChips);
    setChipHistory(defaultChips);

    if (!liveAccountControlsEnabled) {
      setThread([]);
    }
  }, [
    activeAuthState,
    hasConversation,
    liveAccountControlsEnabled,
    localResult,
    onboardingPromptControlsEnabled,
    result,
  ]);

  useEffect(() => {
    if (chips.length > 0) {
      lastNonEmptyChipsRef.current = chips;
    }
  }, [chips]);

  useEffect(() => {
    if (
      isOnboarding ||
      !result ||
      (chips.length >= 3 && promptChipRefreshSequence === 0) ||
      !conversationId ||
      isSending
    ) {
      return;
    }

    const latestThreadItem = thread.at(-1);
    const latestThreadFingerprint = latestThreadItem
      ? [
          thread.length,
          latestThreadItem.id,
          latestThreadItem.response?.message ?? latestThreadItem.errorText ?? latestThreadItem.userText,
        ].join(":")
      : "home";

    const requestKey = [
      activeAuthState?.status ?? "demo",
      liveAccountControlsEnabled ? "live" : devOnboardingFlow ? "dev-onboarding" : "demo",
      scenario,
      result.window.endDate,
      result.freeCashTodayCents,
      latestThreadFingerprint,
      promptChipRefreshSequence,
    ].join("|");

    if (promptChipRequestKeyRef.current === requestKey) {
      return;
    }

    let ignore = false;
    promptChipRequestKeyRef.current = requestKey;

    void fetchAgentResponse(
      "Create prompt chips for the current Pip screen.",
      scenario,
      thread,
      chips,
      chipHistory,
      conversationId,
      undefined,
      "prompt_chips",
    )
      .then((response) => {
        if (ignore || response.promptChips.length === 0) {
          return;
        }

        setChips(response.promptChips);
        setChipHistory((current) => mergePromptChipHistory(current, response.promptChips));
        setPromptChipRefreshSequence(0);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [
    activeAuthState?.status,
    chipHistory,
    chips,
    conversationId,
    devOnboardingFlow,
    isOnboarding,
    isSending,
    liveAccountControlsEnabled,
    promptChipRefreshSequence,
    result,
    scenario,
    thread,
  ]);

  async function submitPrompt(message: string, selectedPromptChipId?: string) {
    if (isSending) {
      return;
    }

    const itemId = createThreadItemId();
    const historyBeforeSend = thread;
    const chipHistoryBeforeSend = mergePromptChipHistory(chipHistory, chips);

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
        chips,
        chipHistoryBeforeSend,
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
      const nextVisibleChips = getNextVisiblePromptChips(
        response.promptChips,
        chips,
        lastNonEmptyChipsRef.current,
      );

      setChips(nextVisibleChips);
      setChipHistory((current) =>
        mergePromptChipHistory(current, chips, nextVisibleChips, response.promptChips),
      );

      if (response.promptChips.length < 3) {
        setPromptChipRefreshSequence((current) => current + 1);
      }

      await executeClientAction(response.clientAction);
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

  function selectPromptChip(chip: PromptChip) {
    if (liveAccountControlsEnabled) {
      void trackProductEvent("prompt_chip_selected", {
        chipId: chip.id,
        label: chip.label,
      });
    }

    void submitPrompt(chip.prompt, chip.id);
  }

  async function suppressMissingCardNudge(issuerName: string) {
    if (!liveAccountControlsEnabled) {
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
    if (!liveAccountControlsEnabled || !hasLoadedServerResult || freeCashTodayCents === undefined) {
      return;
    }

    void trackProductEvent("free_cash_viewed", {
      scenario,
      freeCashTodayCents,
      negative: freeCashTodayCents < 0,
    });
  }, [freeCashTodayCents, hasLoadedServerResult, liveAccountControlsEnabled, scenario]);

  return (
    <main className="free-cash-app-shell h-[100dvh] overflow-hidden px-5 py-5 text-ink sm:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col">
        <section className={hasConversation ? "spendable-hero is-chatting" : "spendable-hero"}>
          <h1 className="pip-brand-title">
            <span className="sr-only">Pip</span>
            <img
              className="pip-wordmark-image"
              src="/brand/pip-wordmark.png"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          </h1>
          <p className="spendable-label">Spendable Cash Today</p>
          <div
            className="spendable-number"
            data-testid="free-cash-number"
          >
            {result ? formatMoney(result.freeCashTodayCents) : "$--"}
          </div>
        </section>

        <section className={hasConversation ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-6 flex min-h-0 flex-1 flex-col max-[380px]:mt-5"}>
          {isOnboarding && thread.length === 0 ? (
            <OnboardingIntro
              authNotice={authNotice}
              authState={activeAuthState ?? { status: "guest" }}
              onStartDevSignIn={devOnboardingFlow ? startDevOnboardingSignIn : undefined}
              onSaveProtectedSavings={saveProtectedSavingsChoice}
            />
          ) : isCheckingLiveData && thread.length === 0 ? (
            <ReadyIntro connectionNotice={connectionNotice} variant="checking" />
          ) : isReadyWithoutData && thread.length === 0 ? (
            <ReadyIntro
              connectionNotice={connectionNotice}
              onConnectData={startConnectData}
              variant="needs-data"
            />
          ) : thread.length === 0 ? (
            <DefaultAssistantIntro connectionNotice={connectionNotice} result={result} />
          ) : (
            <AgentThread
              thread={thread}
              onSuppressMissingCard={liveAccountControlsEnabled ? suppressMissingCardNudge : undefined}
            />
          )}
          {showPromptChips ? <PromptChips chips={chips} onSelect={selectPromptChip} /> : null}
          {showAgentInput ? (
            <AgentInput
              busy={isSending}
              onSubmit={submitPrompt}
              placeholder={getInputPlaceholder(activeAuthState)}
            />
          ) : null}
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

  function startDevOnboardingSignIn() {
    setThread([]);
    setDevHasConnectedData(false);
    setDevAuthState({
      status: "needs-consent",
      email: "pip-test@example.com",
    });
  }

  function startConnectData() {
    if (devOnboardingFlow) {
      setThread([]);
      setDevHasConnectedData(true);
      return;
    }

    selectPromptChip({
      id: "connect-data",
      label: "Connect data",
      prompt: "Connect my data",
    });
  }

  async function saveProtectedSavingsChoice(amountCents: number) {
    if (devOnboardingFlow) {
      setThread([]);
      setDevAuthState({
        status: "ready",
        email: "pip-test@example.com",
      });
      setDevHasConnectedData(false);
      return;
    }

    if (liveAccountControlsEnabled) {
      void trackProductEvent("protected_savings_selected", {
        protectedSavingsMonthlyCents: amountCents,
      });
    }

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
      throw new Error(getErrorMessage(payload, "I couldn’t save that cushion yet. Please try again."));
    }

    window.setTimeout(() => window.location.reload(), 650);
  }

  async function completePlaidClientAction(plaid: PlaidClientActionConfig) {
    await trackPlaidClientEvent("plaid_link_started", {
      mode: plaid.mode ?? "connect",
      environment: plaid.environment,
      surface: "chat",
    });

    let connection;

    try {
      connection = await openPlaidLink(plaid, {
        onEvent: (eventName, metadata) => {
          void trackPlaidLinkEvent(eventName, metadata, plaid, "chat");
        },
      });
      await trackPlaidClientEvent("plaid_link_succeeded", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
      });
    } catch (error) {
      await trackPlaidClientEvent("plaid_link_failed", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }

    if (plaid.mode === "repair") {
      await runPlaidRefreshWithTelemetry("repair");
      return;
    }

    if (!connection.publicToken) {
      await trackPlaidClientEvent("plaid_exchange_failed", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        errorMessage: "Plaid did not return a public token.",
      });
      throw new Error("Plaid did not return a public token.");
    }

    try {
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

      await trackPlaidClientEvent("plaid_exchange_succeeded", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
      });
    } catch (error) {
      await trackPlaidClientEvent("plaid_exchange_failed", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }

    await runPlaidRefreshWithTelemetry("manual");
  }

  async function runPlaidRefreshWithTelemetry(reason: "manual" | "repair") {
    try {
      await runRefreshFromChat("plaid", reason);
      await trackPlaidClientEvent("plaid_sync_succeeded", {
        reason,
        surface: "chat",
      });
    } catch (error) {
      await trackPlaidClientEvent("plaid_sync_failed", {
        reason,
        surface: "chat",
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }
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
  onStartDevSignIn,
  onSaveProtectedSavings,
}: {
  authNotice?: "auth-error";
  authState: SpendableAuthState;
  onStartDevSignIn?: () => void;
  onSaveProtectedSavings: (amountCents: number) => Promise<void>;
}) {
  if (authState.status === "needs-consent") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
        <PipIntroScene
          priority
          title="Let’s set aside a little cushion first."
          className="onboarding-setup-scene"
          messageClassName="onboarding-intro-message"
        >
          <p>
            This is money I’ll keep protected before I answer spending questions.
          </p>
          <div className="mt-5">
            <ProtectedSavingsPicker onSave={onSaveProtectedSavings} />
          </div>
        </PipIntroScene>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      <PipIntroScene
        priority
        notice={authNotice ? <AuthNotice /> : null}
        title="Hi, I’m Pip. I’ll help you find the money that’s actually okay to use today."
        actions={
          onStartDevSignIn ? (
            <button
              type="button"
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
              onClick={onStartDevSignIn}
            >
              Continue with Google
            </button>
          ) : (
            <a
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
              href="/api/auth/oauth/google"
            >
              Continue with Google
            </a>
          )
        }
        messageClassName="onboarding-intro-message"
      >
        <p>
          First we’ll sign in, choose a gentle savings cushion, then connect the account data Pip needs.
        </p>
      </PipIntroScene>
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
  onConnectData,
  variant,
}: {
  connectionNotice?: "plaid-connected";
  onConnectData?: () => void;
  variant: "checking" | "needs-data";
}) {
  if (variant === "checking") {
    return (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
        {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
        <PipIntroScene
          priority
          title="I’m checking for connected data."
          messageClassName="onboarding-intro-message"
        >
          <p>If nothing is connected yet, I’ll start the next step here.</p>
        </PipIntroScene>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
      <PipIntroScene
        priority
        title="Almost there. Connect your account data and I’ll start showing your spendable cash."
        actions={
          <button
            type="button"
            className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
            onClick={onConnectData}
          >
            Connect data
          </button>
        }
        messageClassName="onboarding-intro-message"
      >
        <p>
          I’ll open Plaid, then you can ask what changed or whether a purchase fits.
        </p>
      </PipIntroScene>
    </div>
  );
}

function DefaultAssistantIntro({
  connectionNotice,
  result,
}: {
  connectionNotice?: "plaid-connected";
  result: FreeCashResult | null;
}) {
  const isNegative = Boolean(result && result.freeCashTodayCents < 0);
  const overAmount = result ? formatMoney(Math.abs(Math.min(result.freeCashTodayCents, 0))) : "";

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3" data-testid="agent-thread">
      {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
      <PipIntroScene
        priority
        title={
          isNegative
            ? `You’re ${overAmount} over today. Ask why to see what caused it.`
            : "Hi, I’m Pip. I’ll show what’s actually spendable today."
        }
      />
    </div>
  );
}

function PlaidConnectedNotice() {
  return (
    <section className="glass-panel px-6 py-4">
      <p className="text-xs font-bold uppercase tracking-normal text-taupe">Plaid connected</p>
      <p className="font-display mt-3 text-[1.34rem] leading-[1.3] text-ink max-[380px]:text-[1.18rem]">
        Your account data connected successfully. I’m using it here to calculate Spendable Cash Today.
      </p>
    </section>
  );
}

function getInputPlaceholder(authState: SpendableAuthState | undefined): string {
  if (authState?.status === "guest") {
    return "Ask Pip anything...";
  }

  if (authState?.status === "needs-consent") {
    return "Ask Pip anything...";
  }

  return "Ask Pip anything...";
}

function getDefaultPromptChips(
  authState: SpendableAuthState | undefined,
  enableAccountControls: boolean,
  result: FreeCashResult | null,
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

  return [];
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
  visibleChips: PromptChip[],
  chipHistory: PromptChip[],
  conversationId: string,
  selectedPromptChipId?: string,
  requestKind: "chat" | "prompt_chips" = "chat",
): Promise<AgentResponse> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      requestKind,
      conversationId,
      scenario,
      selectedPromptChipId,
      history: getThreadHistory(thread),
      conversationState: getConversationState(thread, visibleChips, chipHistory),
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

function getConversationState(
  thread: ThreadItem[],
  visibleChips: PromptChip[],
  chipHistory: PromptChip[],
) {
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
  const promptChips = [
    ...chipHistory,
    ...thread.flatMap((item) => item.response?.promptChips ?? []),
    ...visibleChips,
  ].slice(-24);

  return {
    shownCards,
    lastToolNames,
    promptChips,
  };
}

function mergePromptChipHistory(...chipSets: PromptChip[][]): PromptChip[] {
  const merged: PromptChip[] = [];
  const seen = new Set<string>();

  chipSets.flat().forEach((chip) => {
    const key = `${chip.label.toLowerCase()}|${chip.prompt.toLowerCase()}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(chip);
  });

  return merged.slice(-24);
}

function getNextVisiblePromptChips(
  responseChips: PromptChip[],
  currentChips: PromptChip[],
  lastNonEmptyChips: PromptChip[],
): PromptChip[] {
  if (responseChips.length > 0) {
    return responseChips;
  }

  if (currentChips.length > 0) {
    return currentChips;
  }

  return lastNonEmptyChips;
}

function getAgentErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "AI request failed.";
}

function getClientErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unknown client error.";
}

export const __freeCashHomeTestHooks = {
  getNextVisiblePromptChips,
};

function getPlaidEventProperties(
  eventName: string,
  metadata: PlaidEventMetadata | undefined,
  plaid: PlaidClientActionConfig,
  surface: "chat" | "oauth_resume",
): Record<string, string | number | boolean | null> {
  return {
    eventName: eventName.slice(0, 80),
    mode: plaid.mode ?? "connect",
    environment: plaid.environment,
    surface,
    errorCode: metadata?.error_code?.slice(0, 80) ?? null,
    errorMessage: metadata?.error_message?.slice(0, 180) ?? null,
    exitStatus: metadata?.exit_status?.slice(0, 80) ?? null,
    institutionName: metadata?.institution_name?.slice(0, 120) ?? null,
    institutionId: metadata?.institution_id?.slice(0, 120) ?? null,
    linkSessionId: metadata?.link_session_id?.slice(0, 120) ?? null,
    requestId: metadata?.request_id?.slice(0, 120) ?? null,
    status: metadata?.status?.slice(0, 80) ?? null,
    viewName: metadata?.view_name?.slice(0, 80) ?? null,
  };
}

async function trackPlaidLinkEvent(
  eventName: string,
  metadata: PlaidEventMetadata | undefined,
  plaid: PlaidClientActionConfig,
  surface: "chat" | "oauth_resume",
) {
  await trackProductEvent("plaid_link_event", getPlaidEventProperties(eventName, metadata, plaid, surface));
}

async function trackPlaidClientEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  await trackProductEvent(eventName, properties);
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
