import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipHome, __pipHomeTestHooks } from "@/components/PipHome";
import type { SyncStatusResponse } from "@/components/data-controls-helpers";
import type { PromptChip } from "@/lib/agent/card-types";

describe("PipHome", () => {
  it("keeps the Pip home surface to one number, compact context, and the agent input", () => {
    const markup = renderToStaticMarkup(<PipHome />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-thread"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(1);
    expect(visibleText).toContain("Pip");
    expect(visibleText).toContain("Spendable Cash Today");
    expect(visibleText).toContain("$104");
    expect(visibleText).not.toContain("Current money window ends");
    expect(visibleText).not.toContain("known limits");
    expect(markup).not.toContain('data-testid="pip-trust-receipt"');
    expect(visibleText).toMatch(/checked|ready|today|spend/i);
    expect(markup).toContain("pip-character-medium");
    expect(markup).toContain("/brand/pip-character/v001/medium/onboarding-wave.png");
    expect(visibleText).toContain("I see a payment to Capital One, but that card is not connected.");
    expect(markup).not.toContain("pip-metric-subtitle");
    expect(markup).not.toContain("This may change if you connect the missing card.");
    expect(markup).toContain("Ask Pip anything...");
    expect(markup).toContain("Accounts");
    expect(markup).toContain("What pattern are you using?");
    expect(markup).toContain("Check if the data looks right");
    expect(markup).not.toContain("Show the biggest drivers");
    expect(markup).not.toContain("Missing card");
    expect(markup).not.toContain("Test purchase");
    expect(markup).not.toContain("Why this number?");
    expect(markup).not.toContain("Can I spend $50?");
    expect(markup).not.toContain("What changed?");
    expect(markup).toContain('class="sr-only">Pip</span>');
    expect(markup).toContain('aria-label="Pip chat"');
    expect(visibleText).not.toMatch(/\b(balance|dashboard|budget)\b/i);
    expect(markup).not.toMatch(/<nav\b|<table\b|<canvas\b|\brole="(menu|tab|tablist)"/i);
  });

  it("keeps fake prototype data out of the authenticated real-data shell before backend data loads", () => {
    const markup = renderToStaticMarkup(<PipHome enableAccountControls />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(markup).not.toContain("$--");
    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(0);
    expect(markup).not.toContain("$43");
    expect(markup).not.toContain("Can I spend $50?");
    expect(markup).toContain("What data do you use?");
    expect(visibleText).not.toContain("Data controls");
    expect(markup).not.toContain("Data controls");
  });

  it("shows the last live spendable number immediately when the server provides it", () => {
    const result = __pipHomeTestHooks.getDemoPipCashResult();
    const markup = renderToStaticMarkup(
      <PipHome
        authState={{ status: "ready", email: "tester@example.com" }}
        enableAccountControls
        initialResult={result}
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(1);
    expect(visibleText).toContain("$104");
    expect(visibleText).toContain("I see a payment to Capital One, but that card is not connected.");
    expect(visibleText).not.toContain("I’m checking your connected data.");
  });

  it("keeps settings out of app chrome while bottom chips stay conversational", () => {
    const markup = renderToStaticMarkup(
      <PipHome
        authState={{ status: "ready", email: "play-review@animasai.co" }}
        enableAccountControls
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(markup).not.toContain('data-testid="pip-settings-button"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain('href="/settings"');
    expect(markup).not.toMatch(/<nav\b|\brole="(menu|tab|tablist)"/i);
    expect(visibleText).not.toContain("Account and support");
    expect(visibleText).not.toContain("Pricing");

    const settingsChips = __pipHomeTestHooks.getSettingsConversationPromptChips({
      authState: { status: "ready", email: "play-review@animasai.co" },
      enableAccountControls: true,
      result: __pipHomeTestHooks.getDemoPipCashResult(),
    });
    const noDataSettingsChips = __pipHomeTestHooks.getSettingsConversationPromptChips({
      authState: { status: "ready", email: "play-review@animasai.co" },
      enableAccountControls: true,
      result: null,
    });
    const settingsCard = __pipHomeTestHooks.createSettingsPanelCard({
      email: "play-review@animasai.co",
      canUseAccountActions: true,
      hasConnectedData: true,
      platform: "web",
    });
    const termsCard = __pipHomeTestHooks.createSettingsDetailCard("terms", {
      canUseAccountActions: true,
      hasConnectedData: true,
    });

    expect(settingsChips.map((chip) => chip.id)).toEqual([
      "ai-pattern-assumptions",
      "ai-data-quality",
      "ai-biggest-drivers",
    ]);
    expect(settingsChips.slice(0, 3).map((chip) => chip.id)).not.toEqual([
      "settings-support",
      "settings-privacy",
      "settings-terms",
    ]);
    for (const actionChipId of [
      "settings-support",
      "settings-privacy",
      "settings-terms",
      "settings-connected-accounts",
      "settings-feedback",
      "settings-delete-account",
      "settings",
      "manage-accounts",
    ]) {
      expect(settingsChips.map((chip) => chip.id)).not.toContain(actionChipId);
    }
    expect(noDataSettingsChips.map((chip) => chip.id)).toEqual([
      "what-data-used",
      "why-connect-accounts",
    ]);
    expect(settingsCard).toMatchObject({
      type: "settings_panel",
      title: "Settings",
      accountRows: expect.arrayContaining([
        {
          label: "Account",
          value: "play-review@animasai.co",
        },
      ]),
    });
    expect(settingsCard.actions.map((action) => action.id)).toEqual([
      "settings-support",
      "settings-privacy",
      "settings-terms",
      "settings-connected-accounts",
      "settings-feedback",
      "settings-delete-account",
    ]);
    expect(settingsCard.actions.find((action) => action.id === "settings-connected-accounts")).toMatchObject({
      label: "Manage accounts",
      prompt: "Show connected accounts",
      style: "primary",
    });
    expect(termsCard).toMatchObject({
      type: "settings_detail",
      title: "Terms",
    });
    expect(termsCard.rows.map((row) => row.label)).toContain("Accuracy");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "settings",
      pendingFlow: null,
    })).toBe("settings");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "terms",
      pendingFlow: null,
    })).toBe("terms-detail");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "show privacy",
      pendingFlow: null,
    })).toBe("privacy-detail");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "help",
      pendingFlow: null,
    })).toBe("support-detail");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "Show terms",
      selectedPromptChipId: "settings-terms",
      pendingFlow: null,
    })).toBe("terms-detail");
    expect(__pipHomeTestHooks.getChatOnlyRequest({
      message: "Delete my account",
      pendingFlow: null,
    })).toBe("delete-start");
  });

  it("pins settings as the live ready-state prompt chip while account management lives in settings", () => {
    const chips = __pipHomeTestHooks.getDefaultPromptChips(
      { status: "ready", email: "tester@example.com" },
      true,
      __pipHomeTestHooks.getDemoPipCashResult(),
    );

    expect(chips.slice(0, 3).map((chip) => chip.id)).toEqual([
      "settings",
      "ai-pattern-assumptions",
      "ai-data-quality",
    ]);
    expect(chips[0]).toMatchObject({
      label: "Settings",
      prompt: "Settings",
    });
    expect(chips.map((chip) => chip.id)).not.toContain("manage-accounts");
  });

  it("shows Plaid OAuth completion as a same-screen Pip message", () => {
    const markup = renderToStaticMarkup(
      <PipHome
        authState={{ status: "ready", email: "tester@example.com" }}
        connectionNotice="plaid-connected"
        enableAccountControls
      />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Plaid connected");
    expect(visibleText).toContain("Your account data connected successfully.");
    expect(markup).not.toContain("$--");
    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(0);
  });

  it("keeps guest onboarding inside the Pip screen without showing fake Spendable Cash", () => {
    const markup = renderToStaticMarkup(<PipHome authState={{ status: "guest" }} />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Pip");
    expect(visibleText).not.toContain("Spendable Cash Today");
    expect(visibleText).not.toContain("Connect data to see today’s number.");
    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(0);
    expect(visibleText).toContain("Hi, I’m Pip. I’ll help you find what’s okay to spend today.");
    expect(markup).toContain("Continue with Google");
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(0);
    expect(markup).toContain("pip-character-medium");
    expect(markup).not.toContain("$43");
  });

  it("keeps failed Google auth on the same Pip screen", () => {
    const markup = renderToStaticMarkup(
      <PipHome authNotice="auth-error" authState={{ status: "guest" }} />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Google sign-in could not finish.");
    expect(visibleText).toContain("Hi, I’m Pip.");
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(0);
  });

  it("keeps consent onboarding inside the Pip screen", () => {
    const markup = renderToStaticMarkup(
      <PipHome authState={{ status: "needs-consent", email: "tester@example.com" }} />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("Choose monthly savings.");
    expect(visibleText).toContain("Save $200/month");
    expect(visibleText).toContain("Pip does not move money.");
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(0);
    expect(markup).toContain("pip-character-medium");
    expect(visibleText).not.toContain("Step 2");
    expect(markup).not.toContain("Protected savings, e.g. 200...");
    expect(markup).not.toContain("$43");
  });

  it("keeps ready checking setup free of chat controls until data connection starts", () => {
    const markup = renderToStaticMarkup(
      <PipHome authState={{ status: "ready", email: "tester@example.com" }} enableAccountControls />,
    );
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(visibleText).toContain("I’m checking your connected data.");
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(0);
  });

  it("uses refresh copy when a ready user already has connected data but no current number", () => {
    expect(__pipHomeTestHooks.getReadyDataAction(stalePlaidSyncStatus())).toMatchObject({
      title: "Refresh your connected data.",
      body: "I see an account connection already. I’ll refresh it before we reconnect anything.",
      buttonLabel: "Refresh data",
    });
  });

  it("uses repair copy when a ready user's Plaid connection needs repair", () => {
    expect(__pipHomeTestHooks.getReadyDataAction(repairablePlaidSyncStatus())).toMatchObject({
      title: "Repair your account connection.",
      buttonLabel: "Repair connection",
    });
  });

  it("keeps visible chips when a chat response has no usable prompt chips", () => {
    const currentChips: PromptChip[] = [
      {
        id: "upcoming-bills",
        label: "Upcoming bills",
        prompt: "What bills are coming up?",
      },
    ];
    const lastNonEmptyChips: PromptChip[] = [
      {
        id: "payday-impact",
        label: "Payday impact",
        prompt: "How did payday affect today?",
      },
    ];

    expect(
      __pipHomeTestHooks.getNextVisiblePromptChips([], currentChips, lastNonEmptyChips),
    ).toEqual(currentChips);
    expect(
      __pipHomeTestHooks.getNextVisiblePromptChips([], [], lastNonEmptyChips),
    ).toEqual(lastNonEmptyChips);
  });

  it("selects an app-open refresh provider for stale connected data", () => {
    expect(
      __pipHomeTestHooks.getAppOpenRefreshProvider({
        liveAccountControlsEnabled: true,
        authStatus: "ready",
        syncStatus: stalePlaidSyncStatus(),
        hasAttemptedDailyRefresh: false,
      }),
    ).toBe("plaid");
  });

  it("does not skip app-open refresh only because a daily attempt already happened", () => {
    expect(
      __pipHomeTestHooks.getAppOpenRefreshProvider({
        liveAccountControlsEnabled: true,
        authStatus: "ready",
        syncStatus: stalePlaidSyncStatus(),
        hasAttemptedDailyRefresh: true,
      }),
    ).toBe("plaid");
  });

  it("skips app-open refresh while a sync job is already pending", () => {
    expect(
      __pipHomeTestHooks.getAppOpenRefreshProvider({
        liveAccountControlsEnabled: true,
        authStatus: "ready",
        syncStatus: stalePlaidSyncStatus(),
        hasAttemptedDailyRefresh: false,
        hasPendingSyncJob: true,
      }),
    ).toBeNull();
  });

  it("shows warm app-open checking, success, and skip copy", () => {
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "checking" })).toMatch(
      /checking|searching/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "ran" })).toMatch(
      /checked|transactions/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "skipped_recent" })).toMatch(
      /checked|recently|already/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "skipped_pending" })).toMatch(
      /checking|already/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "skipped_manual_only" })).toMatch(
      /automatic refresh|manual/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "no_provider" })).toMatch(
      /connect|account/i,
    );
  });

  it("maps app-open refresh failures to short Pip status copy", () => {
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "failed" })).toMatch(
      /refresh|connection/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "needs_repair" })).toMatch(
      /refresh|connection/i,
    );
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: true, status: "partial" })).toMatch(
      /refresh|connection/i,
    );
    expect(
      __pipHomeTestHooks.getAppOpenSyncMessage({
        ok: true,
        status: "ran",
        resultStatus: "partial",
      }),
    ).toMatch(/refresh|connection/i);
    expect(__pipHomeTestHooks.getAppOpenSyncMessage({ ok: false })).toMatch(/refresh|connection/i);
  });

  it("uses the opening bubble planner for same-day spend and prompt chips", () => {
    const result = __pipHomeTestHooks.getDemoPipCashResult();
    const metric = result.spendableCashToday;

    expect(metric).toBeDefined();

    const plan = __pipHomeTestHooks.getReadyOpeningBubblePlan({
      result: {
        ...result,
        spendableCashToday: {
          ...metric!,
          sameDayDiscretionarySpendCents: 1800,
          sameDayPendingSpendCents: 1800,
          sameDayLedger: {
            ...metric!.sameDayLedger,
            discretionarySpendCents: 1800,
            pendingSpendCents: 1800,
            items: [
              {
                transactionId: "target-pending",
                accountId: "checking",
                date: metric!.sameDayLedger.asOfDate,
                label: "Target",
                amountCents: -1800,
                treatment: "daily_spend",
                pending: true,
                reason: "same-day card purchase",
              },
            ],
          },
        },
      },
      appOpenSyncMessage: __pipHomeTestHooks.getAppOpenSyncMessage({
        ok: true,
        status: "ran",
      }) ?? undefined,
    });
    const chips = __pipHomeTestHooks.getOpeningBubblePromptChips({
      openingBubblePlan: plan,
      defaultChips: [
        {
          id: "settings",
          label: "Settings",
          prompt: "Settings",
        },
      ],
    });

    expect(plan).toMatchObject({
      priority: "same_day_spend",
      message: "I found pending $18 at Target and took it off today for now.",
    });
    expect(chips.map((chip) => chip.id)).toEqual(["why-today", "settings"]);
  });

  it("carries the latest pending savings goal action in conversation state", () => {
    const conversationState = __pipHomeTestHooks.getConversationState(
      [
        {
          id: "turn-1",
          userText: "I need to save for Japan",
          response: {
            message: "How much do you want to save for Japan?",
            cards: [],
            promptChips: [],
            usedTools: [],
            responseMode: "clarify",
            pendingAction: {
              type: "create_savings_goal",
              name: "Japan trip",
              missing: ["target_amount"],
            },
            audit: {
              toolNames: [],
              usedModel: false,
            },
          },
        },
      ],
      [],
      [],
    );

    expect(conversationState).toMatchObject({
      pendingAction: {
        type: "create_savings_goal",
        name: "Japan trip",
        missing: ["target_amount"],
      },
    });
  });

  it("clears an old pending savings goal action after a later response has none", () => {
    const conversationState = __pipHomeTestHooks.getConversationState(
      [
        {
          id: "turn-1",
          userText: "I need to save for Japan",
          response: {
            message: "How much do you want to save for Japan?",
            cards: [],
            promptChips: [],
            usedTools: [],
            responseMode: "clarify",
            pendingAction: {
              type: "create_savings_goal",
              name: "Japan trip",
              missing: ["target_amount"],
            },
            audit: {
              toolNames: [],
              usedModel: false,
            },
          },
        },
        {
          id: "turn-2",
          userText: "$3000 by December 1st",
          response: {
            message: "I saved the Japan trip savings goal.",
            cards: [
              {
                type: "savings_goal_plan",
                title: "Savings Goals",
                goalId: "goal-1",
                name: "Japan trip",
                targetAmountCents: 300000,
                currentAmountCents: 0,
                remainingCents: 300000,
                monthlyContributionCents: 50000,
                includeInSpendableCash: false,
                summary: "$3,000 left. Tracked in Pip only. Pip does not move money.",
              },
            ],
            promptChips: [],
            usedTools: ["create_savings_goal"],
            responseMode: "show_card",
            audit: {
              toolNames: ["create_savings_goal"],
              usedModel: false,
            },
          },
        },
      ],
      [],
      [],
    );

    expect(conversationState).not.toHaveProperty("pendingAction");
  });

  it("maps agent failures to short PIP-safe visible messages", () => {
    expect(
      __pipHomeTestHooks.getSafeAgentFailureMessage({
        code: "missing-openai-config",
        status: 503,
      }),
    ).toBe("I can’t reach the answer service right now. Try again in a moment.");
    expect(
      __pipHomeTestHooks.getSafeAgentFailureMessage({
        code: "invalid-agent-output",
        status: 502,
      }),
    ).toBe("I couldn’t answer that cleanly. Try again, or ask for the math.");
    expect(
      __pipHomeTestHooks.getSafeAgentFailureMessage({
        code: "authentication-required",
        status: 401,
      }),
    ).toBe("I need your setup finished before I can answer that.");
  });

  it("does not expose provider diagnostics in visible agent error text", () => {
    const error = new __pipHomeTestHooks.AgentRequestError({
      code: "missing-openai-config",
      status: 503,
      message: __pipHomeTestHooks.getSafeAgentFailureMessage({
        code: "missing-openai-config",
        status: 503,
      }),
    });
    const visibleMessage = __pipHomeTestHooks.getAgentErrorText(error);

    expect(visibleMessage).toBe("I can’t reach the answer service right now. Try again in a moment.");
    expect(visibleMessage).not.toMatch(/OPENAI_API_KEY|Netlify AI Gateway|sk-/);
    expect(__pipHomeTestHooks.getAgentErrorText(new Error("sk-secret OPENAI_API_KEY missing"))).toBe(
      "I couldn’t answer that cleanly. Try again.",
    );
  });

  it("keeps Plaid client action errors specific without exposing unrelated details", () => {
    expect(__pipHomeTestHooks.getClientActionErrorText(new Error("Plaid failed to load."))).toBe(
      "Plaid failed to load.",
    );
    expect(__pipHomeTestHooks.getClientActionErrorText(new Error("provider_token=secret failed"))).toBe(
      "I couldn’t finish that action. Try again.",
    );
  });
});

function countOccurrences(source: string, pattern: string): number {
  return source.split(pattern).length - 1;
}

function stalePlaidSyncStatus(): SyncStatusResponse {
  return {
    institutions: [
      {
        id: "institution-1",
        institutionName: "Northstar Bank",
        provider: "plaid",
        status: "connected",
        lastSuccessfulSyncAt: "2026-06-04T12:00:00.000Z",
        staleAfter: "2026-06-05T12:00:00.000Z",
        isStale: true,
        errorMessage: null,
      },
    ],
    latestSyncRun: null,
    hasStaleInstitution: true,
  };
}

function repairablePlaidSyncStatus(): SyncStatusResponse {
  return {
    institutions: [
      {
        id: "institution-1",
        institutionName: "Northstar Bank",
        provider: "plaid",
        status: "connected",
        lastSuccessfulSyncAt: null,
        staleAfter: null,
        isStale: true,
        errorCode: "item-login-required",
        errorMessage: "Login required.",
      },
    ],
    latestSyncRun: null,
    hasStaleInstitution: true,
  };
}
