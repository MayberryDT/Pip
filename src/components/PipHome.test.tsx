import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipHome, __pipHomeTestHooks } from "@/components/PipHome";
import type { SyncStatusResponse } from "@/components/data-controls-helpers";
import type { PromptChip } from "@/lib/agent/card-types";

describe("PipHome", () => {
  it("keeps the Pip home surface to one number, assistant intro, and the agent input", () => {
    const markup = renderToStaticMarkup(<PipHome />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");

    expect(countOccurrences(markup, 'data-testid="pip-cash-number"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-thread"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="prompt-chips"')).toBe(1);
    expect(countOccurrences(markup, 'data-testid="agent-input"')).toBe(1);
    expect(visibleText).toContain("Pip");
    expect(visibleText).toContain("Spendable Cash Today");
    expect(visibleText).toContain("$104");
    expect(visibleText).toContain("I’m missing a card, so I may adjust this after you connect it.");
    expect(markup).not.toContain("pip-metric-subtitle");
    expect(markup).not.toContain("This may change if you connect the missing card.");
    expect(markup).toContain("Ask Pip anything...");
    expect(markup).toContain("What pattern are you using?");
    expect(markup).toContain("Check if the data looks right");
    expect(markup).toContain("Show the biggest drivers");
    expect(markup).not.toContain("Missing card");
    expect(markup).not.toContain("Why today?");
    expect(markup).not.toContain("Test purchase");
    expect(markup).not.toContain("Why this number?");
    expect(markup).not.toContain("Can I spend $50?");
    expect(markup).not.toContain("What changed?");
    expect(markup).toContain('aria-label="Pip"');
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

  it("keeps settings out of app chrome and exposes settings actions as chips", () => {
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

    const settingsChips = __pipHomeTestHooks.getSettingsPromptChips({
      canUseAccountActions: true,
      hasConnectedData: true,
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
      "settings-support",
      "settings-privacy",
      "settings-terms",
      "settings-connected-accounts",
      "settings-feedback",
      "settings-delete-account",
    ]);
    expect(settingsChips.slice(0, 3).map((chip) => chip.prompt)).toEqual([
      "Show support",
      "Show privacy",
      "Show terms",
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
    expect(settingsCard.actions.map((action) => action.id)).toContain("settings-terms");
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

  it("pins account management as the first live ready-state prompt chip", () => {
    const chips = __pipHomeTestHooks.getDefaultPromptChips(
      { status: "ready", email: "tester@example.com" },
      true,
      __pipHomeTestHooks.getDemoPipCashResult(),
    );

    expect(chips.slice(0, 3).map((chip) => chip.id)).toEqual([
      "manage-accounts",
      "settings",
      "ai-pattern-assumptions",
    ]);
    expect(chips[0]).toMatchObject({
      label: "Manage accounts",
      prompt: "Show connected accounts",
    });
    expect(chips[1]).toMatchObject({
      label: "Settings",
      prompt: "Settings",
    });
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

    expect(visibleText).toContain("Set your savings cushion.");
    expect(visibleText).toContain("Use $200 cushion");
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
