"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentCard,
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
  canRefreshData,
  getConnectLabel,
  getConnectionStatusMessage,
  getRefreshProvider,
  type FinancialProvider,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";
import { type FakeDataScenario, getFakeSnapshot, isFakeDataScenario } from "@/lib/fake-data";
import { calculatePipCash } from "@/lib/pip-cash/engine";
import {
  getDisplayedSpendableCashTodayCents,
  getSpendableCashTodayState,
} from "@/lib/pip-cash/spendable-cash-today";
import {
  planOpeningBubble,
  type OpeningBubbleInput,
  type OpeningBubblePlan,
} from "@/lib/pip/opening-bubble-planner";
import { formatMoney } from "@/lib/money";
import type { PipCashResult } from "@/lib/types";
import { AgentInput } from "@/components/AgentInput";
import { AgentThread, type AgentReportInput } from "@/components/AgentThread";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";
import { PromptChips } from "@/components/PromptChips";
import { getClientPipPlatform, type PipPlatform } from "@/lib/platform/android-shell";
import { openPlaidLink } from "@/lib/providers/plaid/link-browser";
import type { PlaidEventMetadata } from "@/lib/providers/plaid/link-browser";
import { isSavingsGoalsClientEnabled } from "@/lib/savings-goals/feature-flags";
import { pipTrustPolicy } from "@/lib/trust/pip-trust-policy";
import {
  AgentRequestError,
  fetchAgentResponse,
  getAgentErrorText,
  getConversationState,
  getNextVisiblePromptChips,
  getSafeAgentFailureMessage,
  mergePromptChipHistory,
  type AgentThreadItem,
} from "@/components/pip-home/agent-session";

type ThreadItem = AgentThreadItem;

type PipHomeServerResult = PipCashResult & {
  freshness?: {
    state: "fresh" | "stale" | "syncing" | "failed" | "needs_repair" | "partial";
    lastSuccessfulSyncAt?: string;
    latestSyncRunStatus?: string;
    hasPendingSyncJob?: boolean;
    hasStaleInstitution?: boolean;
  };
  reaction?: {
    id: string;
    reactionType:
      | "small_lift"
      | "big_lift"
      | "small_drop"
      | "big_drop"
      | "shortfall"
      | "recovered"
      | "data_issue"
      | "connection_repaired"
      | "cash_tight"
      | "low_confidence";
    intensity: 1 | 2 | 3;
  };
};

const settingsPromptChip: PromptChip = {
  id: "settings",
  label: "Settings",
  prompt: "Settings",
};
const settingsCancelPromptChip: PromptChip = {
  id: "settings-cancel",
  label: "Cancel",
  prompt: "Cancel",
};
const APP_OPEN_REFRESH_CLIENT_COOLDOWN_MS = 60_000;

type ChatOnlyPendingFlow = "feedback" | "delete-account" | null;
type SettingsDetailKind = "support" | "privacy" | "terms";
type ChatOnlyRequest =
  | "settings"
  | "support-detail"
  | "privacy-detail"
  | "terms-detail"
  | "feedback-start"
  | "feedback-send"
  | "delete-start"
  | "delete-confirm"
  | "delete-reject"
  | "cancel";

export type PipAuthState =
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

export function PipHome({
  authNotice,
  connectionNotice,
  authState,
  devOnboardingFlow = false,
  enableAccountControls = false,
  initialResult,
}: {
  authNotice?: "auth-error";
  connectionNotice?: "plaid-connected";
  authState?: PipAuthState;
  devOnboardingFlow?: boolean;
  enableAccountControls?: boolean;
  initialResult?: PipHomeServerResult | null;
}) {
  const [scenario, setScenario] = useState<FakeDataScenario>("default");
  const snapshot = useMemo(() => getFakeSnapshot(scenario), [scenario]);
  const localResult = useMemo(() => calculatePipCash(snapshot), [snapshot]);
  const [devAuthState, setDevAuthState] = useState<PipAuthState>({
    status: "guest",
  });
  const [devHasConnectedData, setDevHasConnectedData] = useState(false);
  const activeAuthState = devOnboardingFlow ? devAuthState : authState;
  const liveAccountControlsEnabled = !devOnboardingFlow && enableAccountControls;
  const canUseInAppAccountActions =
    liveAccountControlsEnabled && activeAuthState?.status === "ready";
  const onboardingPromptControlsEnabled = liveAccountControlsEnabled || devOnboardingFlow;
  const [serverResult, setServerResult] = useState<PipHomeServerResult | null>(
    () => initialResult ?? null,
  );
  const [serverErrorText, setServerErrorText] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [appOpenSyncMessage, setAppOpenSyncMessage] = useState("");
  const [hasLoadedServerState, setHasLoadedServerState] = useState(Boolean(initialResult));
  const [backendReloadKey, setBackendReloadKey] = useState(0);
  const appOpenRefreshInFlightRef = useRef(false);
  const lastAppOpenRefreshRequestAtRef = useRef(0);
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
  const pipCashTodayCents = result ? getDisplayedSpendableCashTodayCents(result) : undefined;
  const protectedSavingsGoalMonthlyCents =
    result?.savingsGoalMonthlyCents ??
    result?.spendableCashToday?.savingsGoalMonthlyCents ??
    0;
  const showSavingsGoalMetricNote =
    isSavingsGoalsClientEnabled() && protectedSavingsGoalMonthlyCents > 0;
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [chips, setChips] = useState<PromptChip[]>(() =>
    getReadyPromptChips({
      authState: activeAuthState,
      enableAccountControls: onboardingPromptControlsEnabled,
      result,
      appOpenSyncMessage,
    }),
  );
  const [chipHistory, setChipHistory] = useState<PromptChip[]>(() =>
    getReadyPromptChips({
      authState: activeAuthState,
      enableAccountControls: onboardingPromptControlsEnabled,
      result,
      appOpenSyncMessage,
    }),
  );
  const promptChipRequestKeyRef = useRef<string | null>(null);
  const openingBubbleRequestKeyRef = useRef<string | null>(null);
  const lastNonEmptyChipsRef = useRef<PromptChip[]>(chips);
  const [promptChipRefreshSequence, setPromptChipRefreshSequence] = useState(0);
  const [openingBubbleMessage, setOpeningBubbleMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatOnlyPendingFlow, setChatOnlyPendingFlow] = useState<ChatOnlyPendingFlow>(null);
  const [clientPlatform, setClientPlatform] = useState<PipPlatform>("web");
  const seenReactionIdsRef = useRef<Set<string>>(new Set());
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
  const isSetupStep =
    (isOnboarding || isReadyWithoutData || isCheckingLiveData) && !hasConversation;
  const showAgentInput =
    !isSetupStep && (activeAuthState?.status !== "needs-consent" || thread.length > 0);
  const showPromptChips =
    !isSetupStep && (activeAuthState?.status !== "needs-consent" || thread.length > 0);
  const showMetric = Boolean(result);
  const showMetricHero = showMetric || hasConversation;
  const showMetricNumber = showMetric || hasConversation;
  const showSetupBrand = isSetupStep;
  const readyDataAction = getReadyDataAction(syncStatus);
  const metricHeroClassName = [
    "pip-metric-hero",
    hasConversation ? "is-chatting" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const assistantSectionClassName = hasConversation
    ? "mt-1 flex min-h-0 flex-1 flex-col overflow-hidden"
    : isSetupStep
      ? "onboarding-stage flex min-h-0 flex-1 flex-col overflow-hidden"
      : "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden max-[380px]:mt-4";

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
    setClientPlatform(getClientPipPlatform(window.navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!liveAccountControlsEnabled) {
      setServerResult(null);
      setSyncStatus(null);
      setHasLoadedServerState(false);
      return;
    }

    let ignore = false;
    const loadPlan = getInitialBackendLoadPlan({
      liveAccountControlsEnabled,
      hasInitialResult: Boolean(initialResult),
      backendReloadKey,
    });

    if (loadPlan.useInitialResult) {
      setServerResult(initialResult ?? null);
      setServerErrorText("");
      setHasLoadedServerState(true);
    } else {
      setHasLoadedServerState(false);
    }

    async function loadBackendResult() {
      const response = await fetch(`/api/pip-cash?scenario=${scenario}`);

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

      const payload = (await response.json()) as PipHomeServerResult;

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

    if (loadPlan.fetchPipCash) {
      void loadBackendResult();
    }

    if (loadPlan.fetchSyncStatus) {
      void loadSyncStatus();
    }

    return () => {
      ignore = true;
    };
  }, [backendReloadKey, initialResult, liveAccountControlsEnabled, scenario]);

  useEffect(() => {
    if (
      !liveAccountControlsEnabled ||
      activeAuthState?.status !== "ready" ||
      !hasLoadedServerState
    ) {
      return;
    }

    void requestAppOpenRefresh();
  }, [
    activeAuthState?.status,
    hasLoadedServerState,
    liveAccountControlsEnabled,
  ]);

  useEffect(() => {
    if (!liveAccountControlsEnabled || activeAuthState?.status !== "ready") {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestAppOpenRefresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeAuthState?.status, liveAccountControlsEnabled]);

  useEffect(() => {
    const reaction = serverResult?.reaction;

    if (!liveAccountControlsEnabled || !reaction || seenReactionIdsRef.current.has(reaction.id)) {
      return;
    }

    seenReactionIdsRef.current.add(reaction.id);
    const timeoutId = window.setTimeout(() => {
      void fetch("/api/pip/reactions/seen", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reactionId: reaction.id,
        }),
      }).finally(() => {
        setServerResult((current) =>
          current?.reaction?.id === reaction.id
            ? {
                ...current,
                reaction: undefined,
              }
            : current,
        );
      });
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [liveAccountControlsEnabled, serverResult?.reaction]);

  useEffect(() => {
    if (hasConversation) {
      return;
    }

    const nextChips = getReadyPromptChips({
      authState: activeAuthState,
      enableAccountControls: onboardingPromptControlsEnabled,
      result,
      appOpenSyncMessage,
    });

    setChips(nextChips);
    setChipHistory(nextChips);

    if (!liveAccountControlsEnabled) {
      setThread([]);
    }
  }, [
    activeAuthState,
    appOpenSyncMessage,
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
      result.pipCashTodayCents,
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

        const nextPromptChips = liveAccountControlsEnabled
          ? withSettingsPromptChip(response.promptChips)
          : response.promptChips;

        setChips(nextPromptChips);
        setChipHistory((current) => mergePromptChipHistory(current, nextPromptChips));
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

  useEffect(() => {
    if (isOnboarding || hasConversation || !result || !conversationId || isSending) {
      return;
    }

    const openingBubblePlan = getReadyOpeningBubblePlan({ result, appOpenSyncMessage });
    const requestKey = [
      activeAuthState?.status ?? "demo",
      scenario,
      result.window.endDate,
      getDisplayedSpendableCashTodayCents(result),
      openingBubblePlan.priority,
      openingBubblePlan.message,
    ].join("|");

    if (openingBubbleRequestKeyRef.current === requestKey) {
      return;
    }

    let ignore = false;
    openingBubbleRequestKeyRef.current = requestKey;
    setOpeningBubbleMessage(null);

    void fetchAgentResponse(
      [
        "Write the opening speech bubble for the current Pip screen.",
        `Planner priority: ${openingBubblePlan.priority}.`,
        `Fallback bubble: ${openingBubblePlan.message}`,
        "Keep it warm, specific, and concise.",
      ].join(" "),
      scenario,
      [],
      chips,
      chipHistory,
      conversationId,
      undefined,
      "opening_bubble",
    )
      .then((response) => {
        if (!ignore && response.message.trim()) {
          setOpeningBubbleMessage(response.message.trim());
        }
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [
    activeAuthState?.status,
    appOpenSyncMessage,
    chipHistory,
    chips,
    conversationId,
    hasConversation,
    isOnboarding,
    isSending,
    result,
    scenario,
  ]);

  async function submitPrompt(message: string, selectedPromptChipId?: string) {
    if (isSending) {
      return;
    }

    const chatOnlyRequest = getChatOnlyRequest({
      message,
      selectedPromptChipId,
      pendingFlow: chatOnlyPendingFlow,
    });

    if (chatOnlyRequest) {
      await handleChatOnlyRequest(chatOnlyRequest, message);
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
      const responsePromptChips = liveAccountControlsEnabled
        ? withSettingsPromptChip(response.promptChips)
        : response.promptChips;
      const nextVisibleChips = getNextVisiblePromptChips(
        responsePromptChips,
        chips,
        lastNonEmptyChipsRef.current,
      );

      setChips(nextVisibleChips);
      setChipHistory((current) =>
        mergePromptChipHistory(current, chips, nextVisibleChips, responsePromptChips),
      );

      if (responsePromptChips.length < 3) {
        setPromptChipRefreshSequence((current) => current + 1);
      }

      try {
        await executeClientAction(response.clientAction);
      } catch (actionError) {
        setThread((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  errorText: getClientActionErrorText(actionError),
                  isPending: false,
                }
              : item,
          ),
        );
      }
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

  async function handleChatOnlyRequest(request: ChatOnlyRequest, message: string) {
    if (request === "settings") {
      setChatOnlyPendingFlow(null);
      appendChatOnlyTurn({
        userText: message,
        responseMessage: "Settings are here.",
        cards: [
          createSettingsPanelCard({
            email: activeAuthState?.status === "ready" ? activeAuthState.email : undefined,
            canUseAccountActions: canUseInAppAccountActions,
            hasConnectedData: Boolean(result),
            platform: clientPlatform,
          }),
        ],
        nextChips: getSettingsConversationPromptChips({
          authState: activeAuthState,
          enableAccountControls: onboardingPromptControlsEnabled,
          result,
        }),
      });
      return;
    }

    if (
      request === "support-detail" ||
      request === "privacy-detail" ||
      request === "terms-detail"
    ) {
      setChatOnlyPendingFlow(null);
      appendChatOnlyTurn({
        userText: message,
        responseMessage: getSettingsDetailResponseMessage(request),
        cards: [
          createSettingsDetailCard(getSettingsDetailKind(request), {
            canUseAccountActions: canUseInAppAccountActions,
            hasConnectedData: Boolean(result),
          }),
        ],
        nextChips: getSettingsConversationPromptChips({
          authState: activeAuthState,
          enableAccountControls: onboardingPromptControlsEnabled,
          result,
        }),
      });
      return;
    }

    if (request === "cancel") {
      setChatOnlyPendingFlow(null);
      appendChatOnlyTurn({
        userText: message,
        responseMessage: "Okay. I did not change anything.",
        nextChips: getDefaultPromptChips(activeAuthState, onboardingPromptControlsEnabled, result),
      });
      return;
    }

    if (request === "feedback-start") {
      if (!canUseInAppAccountActions) {
        appendChatOnlyTurn({
          userText: message,
          responseMessage: "Sign in before sending feedback.",
          nextChips: getSettingsConversationPromptChips({
            authState: activeAuthState,
            enableAccountControls: onboardingPromptControlsEnabled,
            result,
          }),
        });
        return;
      }

      setChatOnlyPendingFlow("feedback");
      appendChatOnlyTurn({
        userText: message,
        responseMessage: "Tell me what to send as feedback.",
        nextChips: [settingsCancelPromptChip],
      });
      return;
    }

    if (request === "feedback-send") {
      if (message.trim().length < 2) {
        appendChatOnlyTurn({
          userText: message,
          responseMessage: "Send at least a couple of words, or tap Cancel.",
          nextChips: [settingsCancelPromptChip],
        });
        return;
      }

      setIsSending(true);

      try {
        await submitTesterFeedback(message);
        setChatOnlyPendingFlow(null);
        appendChatOnlyTurn({
          userText: message,
          responseMessage: "Feedback sent.",
          nextChips: getSettingsConversationPromptChips({
            authState: activeAuthState,
            enableAccountControls: onboardingPromptControlsEnabled,
            result,
          }),
        });
      } catch (error) {
        appendChatOnlyTurn({
          userText: message,
          responseMessage: getClientErrorMessage(error),
          nextChips: [settingsCancelPromptChip],
        });
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (request === "delete-start") {
      if (!canUseInAppAccountActions) {
        appendChatOnlyTurn({
          userText: message,
          responseMessage: "Sign in before deleting an account.",
          nextChips: getSettingsConversationPromptChips({
            authState: activeAuthState,
            enableAccountControls: onboardingPromptControlsEnabled,
            result,
          }),
        });
        return;
      }

      setChatOnlyPendingFlow("delete-account");
      appendChatOnlyTurn({
        userText: message,
        responseMessage:
          "This deletes the app account, connected financial data, provider token records, settings, product events, AI response reports, and tester feedback tied to the account. Type DELETE to confirm.",
        nextChips: [settingsCancelPromptChip],
      });
      return;
    }

    if (request === "delete-reject") {
      appendChatOnlyTurn({
        userText: message,
        responseMessage: "I did not delete anything. Type DELETE to confirm, or tap Cancel.",
        nextChips: [settingsCancelPromptChip],
      });
      return;
    }

    setIsSending(true);

    try {
      await deleteAccount("DELETE");
      setChatOnlyPendingFlow(null);
      appendChatOnlyTurn({
        userText: message,
        responseMessage: "Account deletion started.",
        nextChips: [],
      });
    } catch (error) {
      appendChatOnlyTurn({
        userText: message,
        responseMessage: getClientErrorMessage(error),
        nextChips: [settingsCancelPromptChip],
      });
    } finally {
      setIsSending(false);
    }
  }

  function appendChatOnlyTurn(input: {
    userText: string;
    responseMessage: string;
    cards?: AgentCard[];
    nextChips: PromptChip[];
  }) {
    setThread((current) => [
      ...current,
      {
        id: createThreadItemId(),
        userText: input.userText,
        response: createChatOnlyResponse(input.responseMessage, input.nextChips, input.cards),
      },
    ]);
    setChips(input.nextChips);
    setChipHistory((current) => mergePromptChipHistory(current, input.nextChips));
    setPromptChipRefreshSequence(0);
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

  async function reportAssistantResponse(input: AgentReportInput) {
    if (!conversationId) {
      throw new Error("Report context is still loading.");
    }

    const response = await fetch("/api/ai-reports", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        ...input,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, "Report failed."));
    }
  }

  async function submitTesterFeedback(message: string) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, "Feedback failed."));
    }
  }

  async function deleteAccount(confirmation: string) {
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        confirmation,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(getErrorMessage(payload, "Account deletion failed."));
    }

    window.setTimeout(() => {
      window.location.assign("/app?deleted=account");
    }, 650);
  }

  useEffect(() => {
    if (!liveAccountControlsEnabled || !hasLoadedServerResult || !result || pipCashTodayCents === undefined) {
      return;
    }

    void trackProductEvent("pip_cash_viewed", {
      scenario,
      pipCashTodayCents,
      negative: getSpendableCashTodayState(result) === "shortfall",
      metricVersion: result.spendableCashToday?.metricVersion ?? "legacy",
      state: result.spendableCashToday?.state ?? null,
      confidence: result.spendableCashToday?.confidence ?? null,
      baselineDailyAllowanceCents: result.spendableCashToday?.baselineDailyAllowanceCents ?? null,
      behaviorAdjustmentCents: result.spendableCashToday?.behaviorAdjustmentCents ?? null,
      cashRealityAdjustmentCents: result.spendableCashToday?.cashRealityAdjustmentCents ?? null,
      shortfallCents: result.spendableCashToday?.shortfallCents ?? null,
      currentMonthVarianceCents: result.spendableCashToday?.currentMonthVarianceCents ?? null,
    });
  }, [pipCashTodayCents, hasLoadedServerResult, liveAccountControlsEnabled, result, scenario]);

  return (
    <main className="pip-app-shell pip-chat-shell px-5 py-5 text-ink sm:px-6">
      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col">
        {showSetupBrand ? (
          <section className="pip-onboarding-brand">
            <h1 className="pip-brand-title">
              <span className="sr-only">Pip</span>
              <img
                className="pip-wordmark-image"
                src="/brand/pip-logo.png"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            </h1>
          </section>
        ) : showMetricHero ? (
          <section className={metricHeroClassName}>
            <h1 className="pip-brand-title">
              <span className="sr-only">Pip</span>
              <img
                className="pip-wordmark-image"
                src="/brand/pip-logo.png"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            </h1>
            {showMetricNumber ? (
              <>
                <p className="pip-metric-label">Spendable Cash Today</p>
                <div
                  className="pip-metric-number"
                  data-testid="pip-cash-number"
                >
                  {result ? formatMoney(getDisplayedSpendableCashTodayCents(result)) : "$--"}
                </div>
                {showSavingsGoalMetricNote ? (
                  <p className="pip-metric-receipt" data-testid="pip-savings-goal-note">
                    Savings Goals: {formatMoney(protectedSavingsGoalMonthlyCents)}/month included before today’s number. Pip does not move money.
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        <section className={assistantSectionClassName}>
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
              dataAction={readyDataAction}
              onConnectData={startConnectData}
              variant="needs-data"
            />
          ) : thread.length === 0 ? (
            <DefaultAssistantIntro
              appOpenSyncMessage={appOpenSyncMessage}
              connectionNotice={connectionNotice}
              modelOpeningBubbleMessage={openingBubbleMessage}
              result={result}
            />
          ) : (
            <AgentThread
              thread={thread}
              onSubmitPrompt={submitPrompt}
              onSuppressMissingCard={liveAccountControlsEnabled ? suppressMissingCardNudge : undefined}
              onReportResponse={canUseInAppAccountActions ? reportAssistantResponse : undefined}
            />
          )}
          {showPromptChips ? <PromptChips chips={chips} compact={hasConversation} onSelect={selectPromptChip} /> : null}
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

  async function startConnectData() {
    if (devOnboardingFlow) {
      setThread([]);
      setDevHasConnectedData(true);
      return;
    }

    if (readyDataAction.kind === "refresh") {
      const provider = getRefreshProvider(syncStatus);

      if (provider) {
        try {
          await runRefreshFromChat(provider, "manual");
          setBackendReloadKey((current) => current + 1);
        } catch (error) {
          const itemId = createThreadItemId();
          setThread((current) => [
            ...current,
            {
              id: itemId,
              userText: readyDataAction.prompt,
              errorText: getClientActionErrorText(error),
            },
          ]);
        }
        return;
      }
    }

    selectPromptChip({
      id: "connect-data",
      label: readyDataAction.buttonLabel,
      prompt: readyDataAction.prompt,
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
      void trackProductEvent("monthly_savings_selected", {
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
      throw new Error(getErrorMessage(payload, "I couldn’t save that amount yet. Please try again."));
    }

    window.setTimeout(() => window.location.reload(), 650);
  }

  async function completePlaidClientAction(plaid: PlaidClientActionConfig) {
    await trackPlaidClientEvent("plaid_link_started", {
      mode: plaid.mode ?? "connect",
      environment: plaid.environment,
      surface: "chat",
    });
    await trackPlaidAccountManagementEvent(plaid, "started", {
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
      await trackPlaidAccountManagementEvent(plaid, "failed", {
        surface: "chat",
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }

    if (plaid.mode === "repair" || plaid.mode === "account_selection") {
      try {
        await runPlaidRefreshWithTelemetry(plaid.mode);
        await trackPlaidAccountManagementEvent(plaid, "succeeded", {
          surface: "chat",
        });
      } catch (error) {
        await trackPlaidAccountManagementEvent(plaid, "failed", {
          surface: "chat",
          errorMessage: getClientErrorMessage(error),
        });
        throw error;
      }
      return;
    }

    if (!connection.publicToken) {
      await trackPlaidClientEvent("plaid_exchange_failed", {
        mode: plaid.mode ?? "connect",
        environment: plaid.environment,
        surface: "chat",
        errorMessage: "Plaid did not return a public token.",
      });
      await trackPlaidAccountManagementEvent(plaid, "failed", {
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
      await trackPlaidAccountManagementEvent(plaid, "failed", {
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }

    try {
      await runPlaidRefreshWithTelemetry("manual");
      await trackPlaidAccountManagementEvent(plaid, "succeeded", {
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
      });
    } catch (error) {
      await trackPlaidAccountManagementEvent(plaid, "failed", {
        surface: "chat",
        institutionName: connection.metadata.institution?.name ?? null,
        institutionId: connection.metadata.institution?.institution_id ?? null,
        errorMessage: getClientErrorMessage(error),
      });
      throw error;
    }
  }

  async function runPlaidRefreshWithTelemetry(reason: "manual" | "repair" | "account_selection") {
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

  async function runRefreshFromChat(
    provider: FinancialProvider,
    reason: "manual" | "repair" | "account_selection" | "app_open" = "manual",
  ) {
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

  async function requestAppOpenRefresh() {
    const now = Date.now();

    if (
      appOpenRefreshInFlightRef.current ||
      now - lastAppOpenRefreshRequestAtRef.current < APP_OPEN_REFRESH_CLIENT_COOLDOWN_MS
    ) {
      return;
    }

    appOpenRefreshInFlightRef.current = true;
    lastAppOpenRefreshRequestAtRef.current = now;
    setAppOpenSyncMessage(getAppOpenSyncMessage({ ok: true, status: "checking" }) ?? "");

    try {
      const response = await fetch("/api/sync/app-open", {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      const status = payload && typeof payload === "object" && "status" in payload
        ? payload.status
        : undefined;
      const resultStatus =
        payload &&
        typeof payload === "object" &&
        "result" in payload &&
        payload.result &&
        typeof payload.result === "object" &&
        "status" in payload.result
          ? payload.result.status
          : undefined;
      const syncMessage = getAppOpenSyncMessage({
        ok: response.ok,
        status,
        resultStatus,
      });

      if (
        response.ok &&
        (status === "ran" ||
          status === "needs_repair" ||
          status === "failed")
      ) {
        setBackendReloadKey((current) => current + 1);
      }
      setAppOpenSyncMessage(syncMessage ?? "");
    } catch {
      setAppOpenSyncMessage(getAppOpenSyncMessage({ ok: false }) ?? "");
    } finally {
      appOpenRefreshInFlightRef.current = false;
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
  authState: PipAuthState;
  onStartDevSignIn?: () => void;
  onSaveProtectedSavings: (amountCents: number) => Promise<void>;
}) {
  const [isSavingMonthlySavings, setIsSavingMonthlySavings] = useState(false);
  const [monthlySavingsError, setMonthlySavingsError] = useState("");

  async function saveDefaultMonthlySavings() {
    if (isSavingMonthlySavings) {
      return;
    }

    setIsSavingMonthlySavings(true);
    setMonthlySavingsError("");

    try {
      await onSaveProtectedSavings(20000);
    } catch (error) {
      setMonthlySavingsError(getSaveMonthlySavingsErrorText(error));
    } finally {
      setIsSavingMonthlySavings(false);
    }
  }

  if (authState.status === "needs-consent") {
    return (
      <div className="onboarding-step-panel" data-testid="agent-thread">
        <PipIntroScene
          priority
          title="Choose monthly savings."
          className="onboarding-step-scene"
          actions={
            <button
              type="button"
              className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)] disabled:bg-ink/30"
              disabled={isSavingMonthlySavings}
              onClick={saveDefaultMonthlySavings}
            >
              {isSavingMonthlySavings ? "Saving amount..." : "Save $200/month"}
            </button>
          }
          messageClassName="onboarding-intro-message"
        >
          <p>I’ll keep this out of your daily spending number. Pip does not move money.</p>
          {monthlySavingsError ? (
            <p className="mt-3 rounded-[10px] border border-red-200 bg-red-50/80 px-3 py-2 text-sm leading-6 text-red-800">
              {monthlySavingsError}
            </p>
          ) : null}
        </PipIntroScene>
      </div>
    );
  }

  return (
    <div className="onboarding-step-panel" data-testid="agent-thread">
      <PipIntroScene
        priority
        notice={authNotice ? <AuthNotice /> : null}
        title="Hi, I’m Pip. I’ll help you find what’s okay to spend today."
        className="onboarding-step-scene"
        actions={
          onStartDevSignIn ? (
            <button
              type="button"
              className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
              onClick={onStartDevSignIn}
            >
              Continue with Google
            </button>
          ) : (
            <a
              className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
              href="/api/auth/oauth/google"
            >
              Continue with Google
            </a>
          )
        }
        messageClassName="onboarding-intro-message"
      >
        <p>First we’ll sign in. Then we’ll choose monthly savings and connect data.</p>
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
  dataAction,
  onConnectData,
  variant,
}: {
  connectionNotice?: "plaid-connected";
  dataAction?: ReadyDataAction;
  onConnectData?: () => void;
  variant: "checking" | "needs-data";
}) {
  if (variant === "checking") {
    return (
      <div className="onboarding-step-panel" data-testid="agent-thread">
        {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
        <PipIntroScene
          priority
          title="I’m checking your connected data."
          className="onboarding-step-scene"
          messageClassName="onboarding-intro-message"
        >
          <p>If I do not find data, connect data is next.</p>
        </PipIntroScene>
      </div>
    );
  }

  return (
    <div className="onboarding-step-panel" data-testid="agent-thread">
      {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
      <PipIntroScene
        priority
        title={dataAction?.title ?? "Connect your account data."}
        className="onboarding-step-scene"
        actions={
          <button
            type="button"
            className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
            onClick={onConnectData}
          >
            {dataAction?.buttonLabel ?? "Connect data"}
          </button>
        }
        messageClassName="onboarding-intro-message"
      >
        <p>{dataAction?.body ?? "I’ll open Plaid, then we’ll move into chat."}</p>
      </PipIntroScene>
    </div>
  );
}

function DefaultAssistantIntro({
  appOpenSyncMessage,
  connectionNotice,
  modelOpeningBubbleMessage,
  result,
}: {
  appOpenSyncMessage?: string;
  connectionNotice?: "plaid-connected";
  modelOpeningBubbleMessage?: string | null;
  result: PipCashResult | null;
}) {
  if (result) {
    const openingBubblePlan = getReadyOpeningBubblePlan({ result, appOpenSyncMessage });
    const showAppOpenSyncMessage =
      appOpenSyncMessage &&
      appOpenSyncMessage !== openingBubblePlan.message &&
      openingBubblePlan.priority !== "normal";

    return (
      <div
        className="assistant-ready-intro-panel min-h-0 flex-1 overflow-y-auto pb-1"
        data-testid="agent-thread"
        aria-label="Pip chat"
      >
        {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
        <PipIntroScene
          priority
          title={modelOpeningBubbleMessage ?? openingBubblePlan.message}
        >
          {showAppOpenSyncMessage ? <p>{appOpenSyncMessage}</p> : null}
        </PipIntroScene>
      </div>
    );
  }

  return (
    <div
      className="assistant-ready-intro-panel min-h-0 flex-1 space-y-4 overflow-y-auto pb-3"
      data-testid="agent-thread"
    >
      {connectionNotice === "plaid-connected" ? <PlaidConnectedNotice /> : null}
      <PipIntroScene
        priority
        title="Hi, I’m Pip. I’ll show what’s actually spendable today."
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

function getPlatformLabel(platform: PipPlatform): string {
  return platform === "android_webview" ? "Android WebView" : "Web";
}

type SettingsPanelCard = Extract<AgentCard, { type: "settings_panel" }>;
type SettingsDetailCard = Extract<AgentCard, { type: "settings_detail" }>;
type SettingsAction = SettingsPanelCard["actions"][number];

function createSettingsPanelCard(input: {
  email?: string;
  canUseAccountActions: boolean;
  hasConnectedData: boolean;
  platform: PipPlatform;
}): SettingsPanelCard {
  return {
    type: "settings_panel",
    title: "Settings",
    accountRows: [
      {
        label: "Account",
        value: input.email ?? "Not signed in",
      },
      {
        label: "App",
        value: getPlatformLabel(input.platform),
      },
      {
        label: "Data",
        value: input.hasConnectedData ? "Connected data loaded" : "No connected data loaded",
      },
    ],
    sections: [
      {
        title: "Support",
        body: "Get help, report answer quality, or send tester feedback from this chat.",
      },
      {
        title: "Privacy and terms",
        body: "Read the short in-app version here without leaving Pip.",
      },
      {
        title: "Trust receipt",
        body: "Ask for the receipt behind the number to see freshness, counted accounts, confidence, and known limits.",
      },
    ],
    actions: getSettingsActions(input),
  };
}

function createSettingsDetailCard(
  kind: SettingsDetailKind,
  input: {
    canUseAccountActions: boolean;
    hasConnectedData: boolean;
  },
): SettingsDetailCard {
  const sharedActions: SettingsAction[] = [
    {
      id: "settings-overview",
      label: "Settings",
      prompt: "Settings",
      style: "secondary",
    },
    ...getSettingsActions(input).filter((action) => action.id !== `settings-${kind}`),
  ];

  if (kind === "support") {
    return {
      type: "settings_detail",
      title: "Support",
      summary: "Support stays in the chat. Ask for help, report an answer, or send tester feedback here.",
      rows: [
        {
          label: "Get help",
          detail: "Ask Pip what went wrong or describe the issue you are seeing.",
        },
        {
          label: "Report an answer",
          detail: "Use the small Report control under a response when the answer itself is the problem.",
        },
        {
          label: "Tester feedback",
          detail: input.canUseAccountActions
            ? "Send product feedback from this card and it will attach to your signed-in account."
            : "Sign in before sending tester feedback.",
        },
      ],
      actions: sharedActions,
    };
  }

  if (kind === "privacy") {
    return {
      type: "settings_detail",
      title: "Privacy",
      summary: "Pip uses connected financial data to calculate Spendable Cash Today and answer your questions.",
      rows: [
        {
          label: "Financial data",
          detail: `${pipTrustPolicy.bankDataProvider.name} provides read-only connected account data for calculations, explanations, and chat answers.`,
        },
        {
          label: "AI role",
          detail: "AI explains and answers; it does not own the Spendable Cash Today calculation.",
        },
        {
          label: "Reports and feedback",
          detail: "Reports may include answer context so we can debug product quality.",
        },
        {
          label: "Deletion",
          detail: pipTrustPolicy.deletionSummary,
        },
      ],
      actions: sharedActions,
    };
  }

  return {
    type: "settings_detail",
    title: "Terms",
    summary: "Pip is a spending signal and assistant. It is not a bank, broker, lender, or financial advisor.",
    rows: [
      {
        label: "Use",
        detail: "Answers are informational and based on available connected data.",
      },
      {
        label: "Accuracy",
        detail: "Pending, missing, stale, or disconnected data can change Spendable Cash Today.",
      },
      {
        label: "Money movement",
        detail: "Pip connections are read-only. Pip cannot move, withdraw, transfer, invest, borrow, or pay money from a connected account.",
      },
      {
        label: "Account",
        detail: "You are responsible for your account, connected data choices, and spending decisions.",
      },
    ],
    actions: sharedActions,
  };
}

function getSettingsActions(input: {
  canUseAccountActions: boolean;
  hasConnectedData: boolean;
}): SettingsAction[] {
  const actions: SettingsAction[] = [
    {
      id: "settings-support",
      label: "Support",
      prompt: "Show support",
      style: "secondary",
    },
    {
      id: "settings-privacy",
      label: "Privacy",
      prompt: "Show privacy",
      style: "secondary",
    },
    {
      id: "settings-terms",
      label: "Terms",
      prompt: "Show terms",
      style: "secondary",
    },
  ];

  if (input.hasConnectedData) {
    actions.push({
      id: "settings-connected-accounts",
      label: "Manage accounts",
      prompt: "Show connected accounts",
      style: "primary",
    });
  }

  if (input.canUseAccountActions) {
    actions.push(
      {
        id: "settings-feedback",
        label: "Send feedback",
        prompt: "Send feedback",
        style: "secondary",
      },
      {
        id: "settings-delete-account",
        label: "Delete account",
        prompt: "Delete my account",
        style: "danger",
      },
    );
  }

  return actions;
}

const settingsConversationPromptChipExcludedIds = new Set([
  "manage-accounts",
  "settings",
  "settings-overview",
  "settings-support",
  "settings-privacy",
  "settings-terms",
  "settings-feedback",
  "settings-delete-account",
  "settings-connected-accounts",
]);

const settingsConversationFallbackPromptChips: PromptChip[] = [
  {
    id: "what-data-used",
    label: "What data do you use?",
    prompt: "What data do you use?",
  },
  {
    id: "why-connect-accounts",
    label: "Why connect accounts?",
    prompt: "Why connect accounts?",
  },
  {
    id: "what-is-spendable-cash-today",
    label: "What is Spendable Cash Today?",
    prompt: "What is Spendable Cash Today?",
  },
];

function getSettingsConversationPromptChips(input: {
  authState: PipAuthState | undefined;
  enableAccountControls: boolean;
  result: PipCashResult | null;
}): PromptChip[] {
  const chips = input.result
    ? getSuggestedPrompts(input.result)
    : getDefaultPromptChips(input.authState, input.enableAccountControls, null);
  const filtered = chips
    .filter((chip) => !settingsConversationPromptChipExcludedIds.has(chip.id))
    .slice(0, 3);

  return filtered.length > 0 ? filtered : settingsConversationFallbackPromptChips;
}

function getReadyOpeningBubblePlan(input: {
  appOpenSyncMessage?: string;
  result: PipCashResult;
}): OpeningBubblePlan {
  return planOpeningBubble({
    refresh: getOpeningBubbleRefresh(input.appOpenSyncMessage),
    sameDaySpend: getOpeningBubbleSameDaySpend(input.result),
    missingData: getOpeningBubbleMissingData(input.result),
    tight: getOpeningBubbleTightNotice(input.result),
    savingsOpportunity: getOpeningBubbleSavingsOpportunity(input.result),
    spendableCashTodayCents: getDisplayedSpendableCashTodayCents(input.result),
  });
}

function getOpeningBubbleRefresh(
  message: string | undefined,
): OpeningBubbleInput["refresh"] | undefined {
  if (!message) {
    return undefined;
  }

  if (/checking|searching/i.test(message)) {
    return {
      status: "checking",
      message,
    };
  }

  if (/could not|connection|repair/i.test(message)) {
    return {
      status: "failed",
      message,
    };
  }

  if (/recently|already|automatic refresh|last spendable|manual/i.test(message)) {
    return {
      status: "skipped",
      message,
    };
  }

  return {
    status: "ran",
    message,
  };
}

function getOpeningBubbleSameDaySpend(result: PipCashResult): OpeningBubbleInput["sameDaySpend"] {
  const ledger = result.spendableCashToday?.sameDayLedger;
  const dailySpendItems =
    ledger?.items.filter((item) => item.treatment === "daily_spend") ?? [];
  const largestItem = dailySpendItems.reduce<(typeof dailySpendItems)[number] | undefined>(
    (largest, item) =>
      !largest || Math.abs(item.amountCents) > Math.abs(largest.amountCents) ? item : largest,
    undefined,
  );

  if (largestItem) {
    return {
      amountCents: Math.abs(largestItem.amountCents),
      merchantName: largestItem.label,
      pending: largestItem.pending,
    };
  }

  const sameDaySpendCents = result.spendableCashToday?.sameDayDiscretionarySpendCents ?? 0;

  return sameDaySpendCents > 0
    ? {
        amountCents: sameDaySpendCents,
      }
    : undefined;
}

function getOpeningBubbleMissingData(result: PipCashResult): OpeningBubbleInput["missingData"] {
  const missingCardWarning = result.spendableCashToday?.warnings.find(
    (warning) => warning.id === "missing-card",
  );

  if (!missingCardWarning) {
    return undefined;
  }

  return {
    message: missingCardWarning.detail || "I may be missing a card, so this number could still move.",
  };
}

function getOpeningBubbleTightNotice(result: PipCashResult): OpeningBubbleInput["tight"] {
  const state = getSpendableCashTodayState(result);

  if (state === "shortfall") {
    const shortfallCents =
      result.spendableCashToday?.shortfallCents ?? Math.max(0, -result.pipCashTodayCents);

    return {
      message: `Today is already over by ${formatMoney(shortfallCents)}. I would keep spending paused where you can.`,
    };
  }

  if (state === "tight") {
    return {
      message: `Today is tight. You have ${formatMoney(getDisplayedSpendableCashTodayCents(result))} left.`,
    };
  }

  if (state === "overspending") {
    return {
      message: "Today is running tight because spending is ahead of the plan.",
    };
  }

  return undefined;
}

function getOpeningBubbleSavingsOpportunity(result: PipCashResult): boolean {
  const plannedMonthlySavingsCents =
    (result.monthlySavingsCents ?? 0) +
    (result.savingsGoalMonthlyCents ?? 0) +
    result.protectedSavingsMonthlyCents;

  return plannedMonthlySavingsCents <= 0;
}

function getOpeningBubblePromptChips(input: {
  openingBubblePlan: OpeningBubblePlan;
  defaultChips: PromptChip[];
}): PromptChip[] {
  if (input.openingBubblePlan.chips.length === 0) {
    return input.defaultChips;
  }

  const nextChips = [...input.openingBubblePlan.chips];

  for (const chip of input.defaultChips) {
    if (nextChips.some((existing) => existing.id === chip.id)) {
      continue;
    }

    nextChips.push(chip);

    if (nextChips.length >= 3) {
      break;
    }
  }

  return nextChips;
}

function getChatOnlyRequest(input: {
  message: string;
  selectedPromptChipId?: string;
  pendingFlow: ChatOnlyPendingFlow;
}): ChatOnlyRequest | null {
  const normalized = normalizeChatOnlyMessage(input.message);

  if (input.selectedPromptChipId === "settings-cancel" || normalized === "cancel") {
    return "cancel";
  }

  if (input.pendingFlow === "feedback") {
    return "feedback-send";
  }

  if (input.pendingFlow === "delete-account") {
    return normalized === "delete" ? "delete-confirm" : "delete-reject";
  }

  if (input.selectedPromptChipId === "settings") {
    return "settings";
  }

  if (input.selectedPromptChipId === "settings-support") {
    return "support-detail";
  }

  if (input.selectedPromptChipId === "settings-privacy") {
    return "privacy-detail";
  }

  if (input.selectedPromptChipId === "settings-terms") {
    return "terms-detail";
  }

  if (input.selectedPromptChipId === "settings-feedback") {
    return "feedback-start";
  }

  if (input.selectedPromptChipId === "settings-delete-account") {
    return "delete-start";
  }

  const settingsDetailRequest = getSettingsDetailRequest(normalized);

  if (settingsDetailRequest) {
    return settingsDetailRequest;
  }

  if (isSettingsMessage(normalized)) {
    return "settings";
  }

  if (isFeedbackMessage(normalized)) {
    return "feedback-start";
  }

  if (isDeleteAccountMessage(normalized)) {
    return "delete-start";
  }

  return null;
}

function getSettingsDetailRequest(message: string): Extract<
  ChatOnlyRequest,
  "support-detail" | "privacy-detail" | "terms-detail"
> | null {
  if (["support", "show support", "open support", "help", "get help"].includes(message)) {
    return "support-detail";
  }

  if (["privacy", "show privacy", "open privacy", "privacy policy"].includes(message)) {
    return "privacy-detail";
  }

  if (["terms", "show terms", "open terms", "terms of service"].includes(message)) {
    return "terms-detail";
  }

  return null;
}

function getSettingsDetailKind(
  request: Extract<ChatOnlyRequest, "support-detail" | "privacy-detail" | "terms-detail">,
): SettingsDetailKind {
  if (request === "support-detail") {
    return "support";
  }

  if (request === "privacy-detail") {
    return "privacy";
  }

  return "terms";
}

function getSettingsDetailResponseMessage(
  request: Extract<ChatOnlyRequest, "support-detail" | "privacy-detail" | "terms-detail">,
): string {
  if (request === "support-detail") {
    return "Support is here.";
  }

  if (request === "privacy-detail") {
    return "Privacy is here.";
  }

  return "Terms are here.";
}

function normalizeChatOnlyMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function isSettingsMessage(message: string): boolean {
  return [
    "settings",
    "account settings",
    "open settings",
    "show settings",
  ].includes(message);
}

function isFeedbackMessage(message: string): boolean {
  return [
    "feedback",
    "send feedback",
    "give feedback",
    "tester feedback",
  ].includes(message);
}

function isDeleteAccountMessage(message: string): boolean {
  return [
    "delete account",
    "delete my account",
    "remove account",
    "close account",
  ].includes(message);
}

function createChatOnlyResponse(
  message: string,
  promptChips: PromptChip[],
  cards: AgentCard[] = [],
): AgentResponse {
  return {
    message,
    cards,
    promptChips,
    usedTools: [],
    responseMode: "chat_only",
    audit: {
      toolNames: [],
      usedModel: false,
    },
  };
}

function getInputPlaceholder(authState: PipAuthState | undefined): string {
  if (authState?.status === "guest") {
    return "Ask Pip anything...";
  }

  if (authState?.status === "needs-consent") {
    return "Ask Pip anything...";
  }

  return "Ask Pip anything...";
}

function getDefaultPromptChips(
  authState: PipAuthState | undefined,
  enableAccountControls: boolean,
  result: PipCashResult | null,
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

  if (enableAccountControls && result) {
    return withSettingsPromptChip(getSuggestedPrompts(result));
  }

  return result ? getSuggestedPrompts(result) : [];
}

function getReadyPromptChips(input: {
  authState: PipAuthState | undefined;
  enableAccountControls: boolean;
  result: PipCashResult | null;
  appOpenSyncMessage?: string;
}): PromptChip[] {
  const defaultChips = getDefaultPromptChips(
    input.authState,
    input.enableAccountControls,
    input.result,
  );

  if (!input.result) {
    return defaultChips;
  }

  return getOpeningBubblePromptChips({
    openingBubblePlan: getReadyOpeningBubblePlan({
      result: input.result,
      appOpenSyncMessage: input.appOpenSyncMessage,
    }),
    defaultChips,
  });
}

type ReadyDataAction = {
  kind: "connect" | "refresh" | "repair";
  title: string;
  body: string;
  buttonLabel: string;
  prompt: string;
};

function getReadyDataAction(syncStatus: SyncStatusResponse | null): ReadyDataAction {
  const connectLabel = getConnectLabel(syncStatus);
  const connectionMessage = getConnectionStatusMessage(syncStatus);

  if (connectLabel === "Repair connection") {
    return {
      kind: "repair",
      title: "Repair your account connection.",
      body:
        connectionMessage ??
        "I see a connected account that needs repair. I’ll open Plaid in repair mode.",
      buttonLabel: "Repair connection",
      prompt: "Repair my account connection",
    };
  }

  if (canRefreshData(syncStatus)) {
    return {
      kind: "refresh",
      title: "Refresh your connected data.",
      body: "I see an account connection already. I’ll refresh it before we reconnect anything.",
      buttonLabel: "Refresh data",
      prompt: "Refresh my data",
    };
  }

  return {
    kind: "connect",
    title: "Connect your account data.",
    body: "I’ll open Plaid, then we’ll move into chat.",
    buttonLabel: "Connect data",
    prompt: "Connect my data",
  };
}

function withSettingsPromptChip(chips: PromptChip[]): PromptChip[] {
  return [
    settingsPromptChip,
    ...chips.filter((chip) => chip.id !== "manage-accounts" && chip.id !== settingsPromptChip.id),
  ].slice(0, 3);
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}

function getSaveMonthlySavingsErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "I couldn’t save that amount yet. Please try again.";
}

function getAppOpenRefreshProvider(input: {
  liveAccountControlsEnabled: boolean;
  authStatus?: PipAuthState["status"];
  syncStatus: SyncStatusResponse | null;
  hasAttemptedDailyRefresh: boolean;
  hasPendingSyncJob?: boolean;
}): FinancialProvider | null {
  if (
    !input.liveAccountControlsEnabled ||
    input.authStatus !== "ready" ||
    !input.syncStatus ||
    input.hasPendingSyncJob ||
    !canRefreshData(input.syncStatus)
  ) {
    return null;
  }

  const provider = getRefreshProvider(input.syncStatus);

  if (!provider) {
    return null;
  }

  return provider;
}

function getInitialBackendLoadPlan(input: {
  liveAccountControlsEnabled: boolean;
  hasInitialResult: boolean;
  backendReloadKey: number;
  hasServerSyncStatus?: boolean;
}): {
  fetchPipCash: boolean;
  fetchSyncStatus: boolean;
  useInitialResult: boolean;
} {
  if (!input.liveAccountControlsEnabled) {
    return {
      fetchPipCash: false,
      fetchSyncStatus: false,
      useInitialResult: false,
    };
  }

  const useInitialResult = input.hasInitialResult && input.backendReloadKey === 0;

  return {
    fetchPipCash: !useInitialResult,
    fetchSyncStatus: !input.hasServerSyncStatus,
    useInitialResult,
  };
}

function getAppOpenSyncMessage(input: {
  ok: boolean;
  resultStatus?: unknown;
  status?: unknown;
  fallbackMessage?: string;
}): string | null {
  if (!input.ok) {
    return input.fallbackMessage ?? "I could not refresh your bank data. Your connection may need attention.";
  }

  if (input.status === "checking") {
    return "I’m checking your connected transactions now.";
  }

  if (
    input.status === "failed" ||
    input.status === "needs_repair" ||
    input.status === "partial" ||
    input.resultStatus === "failed" ||
    input.resultStatus === "needs_repair" ||
    input.resultStatus === "partial"
  ) {
    return "I could not fully refresh your bank data. Your connection may need attention.";
  }

  if (input.status === "ran") {
    return "I checked your transactions. Your spendable number is up to date.";
  }

  if (input.status === "skipped_recent" || input.status === "skipped_fresh") {
    return "I checked recently, so I’m using your latest spendable number.";
  }

  if (input.status === "skipped_pending") {
    return "I’m already checking transactions. I’ll keep using the last number while that finishes.";
  }

  if (input.status === "skipped_manual_only") {
    return "Automatic refresh is off, so I’m using your last spendable number.";
  }

  if (input.status === "no_provider") {
    return "Connect an account and I can check transactions automatically.";
  }

  return null;
}

function getClientErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unknown client error.";
}

function getClientActionErrorText(error: unknown): string {
  const message = getClientErrorMessage(error);

  if (/\bplaid\b/i.test(message)) {
    return message;
  }

  return "I couldn’t finish that action. Try again.";
}

export const __pipHomeTestHooks = {
  AgentRequestError,
  createSettingsDetailCard,
  createSettingsPanelCard,
  getChatOnlyRequest,
  getDefaultPromptChips,
  getDemoPipCashResult: () => calculatePipCash(getFakeSnapshot("default")),
  getAgentErrorText,
  getAppOpenSyncMessage,
  getAppOpenRefreshProvider,
  getClientActionErrorText,
  getConversationState,
  getInitialBackendLoadPlan,
  getOpeningBubblePromptChips,
  getReadyOpeningBubblePlan,
  getReadyPromptChips,
  getNextVisiblePromptChips,
  getReadyDataAction,
  getSafeAgentFailureMessage,
  getSettingsActions,
  getSettingsConversationPromptChips,
  withSettingsPromptChip,
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

async function trackPlaidAccountManagementEvent(
  plaid: PlaidClientActionConfig,
  outcome: "started" | "succeeded" | "failed",
  properties: Record<string, string | number | boolean | null>,
) {
  const eventName = getPlaidAccountManagementEventName(plaid.mode ?? "connect", outcome);

  if (!eventName) {
    return;
  }

  await trackProductEvent(eventName, {
    ...properties,
    mode: plaid.mode ?? "connect",
    environment: plaid.environment,
    institutionId: properties.institutionId ?? plaid.institutionId ?? null,
  });
}

function getPlaidAccountManagementEventName(
  mode: PlaidClientActionConfig["mode"],
  outcome: "started" | "succeeded" | "failed",
): string | null {
  if (mode === "connect") {
    return `account_connection_${outcome}`;
  }

  if (mode === "repair") {
    return `account_repair_${outcome}`;
  }

  if (mode === "account_selection") {
    return `account_selection_${outcome}`;
  }

  return null;
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

const pipConversationStorageKey = "pip-conversation-id";

function getOrCreateConversationId(): string {
  if (typeof window === "undefined") {
    return createConversationId();
  }

  try {
    const existing = window.localStorage.getItem(pipConversationStorageKey);

    if (existing) {
      return existing;
    }

    const next = createConversationId();
    window.localStorage.setItem(pipConversationStorageKey, next);

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
