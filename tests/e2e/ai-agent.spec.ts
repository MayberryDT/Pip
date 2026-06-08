import { expect, test, type Page, type Route } from "@playwright/test";

test("AI agent loop keeps one number while cards persist in the thread", async ({
  page,
}) => {
  await routeAgentThroughMockModel(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");
  await expect(page.getByTestId("prompt-chips")).toHaveCount(0);

  const input = page.getByLabel("Ask Pip");
  await input.fill("Why this number?");
  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const whyJson = await whyResponse.json();

  expect(whyJson.audit.toolNames).toEqual(["get_free_cash_drivers"]);
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("Can I spend $50?");
  const [chipResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const chipJson = await chipResponse.json();

  expect(chipJson.audit.usedModel).toBe(true);

  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toBeVisible();
  await expect(page.getByText("You can, but it would put you $7 over today.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("What about $20 instead?");
  const [followUpResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const followUpJson = await followUpResponse.json();

  expect(followUpJson.audit.toolNames).toEqual(["simulate_purchase"]);
  expect(followUpJson.cards[0]).toMatchObject({
    type: "purchase_simulation",
    amountCents: 2000,
  });
  await expect(page.getByText("That would leave $23 for today.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toHaveCount(2);
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("Show true balances");
  const [balancesResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const balancesJson = await balancesResponse.json();

  expect(balancesJson.audit.toolNames).toEqual(["get_true_balances"]);
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByText("Everyday Checking")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toHaveCount(2);
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("Show recent transactions");
  const [transactionsResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const transactionsJson = await transactionsResponse.json();

  expect(transactionsJson.audit.toolNames).toEqual(["get_recent_transactions"]);
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toBeVisible();
  await expect(page.getByText("Basecamp Market")).toBeVisible();
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("Show the math");
  const [mathResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const mathJson = await mathResponse.json();

  expect(mathJson.audit.toolNames).toEqual(["get_free_cash_math"]);
  await expect(page.getByRole("heading", { name: "Math breakdown" })).toBeVisible();
  await expect(page.getByText("Rolling net")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");

  await input.fill("Is a card missing?");
  const [missingCardResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const missingCardJson = await missingCardResponse.json();

  expect(missingCardJson.audit.toolNames).toEqual(["get_data_quality"]);
  await expect(page.getByRole("heading", { name: "Possible missing card" })).toBeVisible();
  await expect(page.getByText("I see a payment to Capital One")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Math breakdown" })).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");
});

test("mobile viewport keeps the one-number layout from overlapping or overflowing", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 360,
    height: 740,
  });
  await routeAgentThroughMockModel(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("free-cash-number")).toHaveText("$43");
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("free-cash-number"));
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("agent-input"));

  await page.getByLabel("Ask Pip").fill("Why this number?");
  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);

  expect((await whyResponse.json()).audit.toolNames).toEqual(["get_free_cash_drivers"]);
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expectHeaderToBeCompact(page);
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectVisibleElementAboveInput(page, page.getByRole("heading", { name: "Why this number changed" }));

  await page.getByLabel("Ask Pip").fill("Show true balances");
  const [balancesResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);

  expect((await balancesResponse.json()).audit.toolNames).toEqual(["get_true_balances"]);
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectVisibleElementAboveInput(page, page.getByRole("heading", { name: "True balances" }));
});

test("chat send feels responsive while the agent is thinking", async ({ page }) => {
  await page.route("**/api/agent", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Hi. Ask me about Spendable Cash Today or setup.",
        cards: [],
        promptChips: [
          {
            id: "bills",
            label: "Upcoming bills",
            prompt: "What bills are coming up?",
          },
          {
            id: "balances",
            label: "True balances",
            prompt: "Show my true balances",
          },
          {
            id: "math",
            label: "Show math",
            prompt: "Show the math",
          },
        ],
        audit: {
          toolNames: [],
          usedModel: true,
          model: "test-model",
        },
        usedTools: [],
        responseMode: "chat_only",
      }),
    });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Ask Pip").fill("hi");
  const responsePromise = waitForAgentResponse(page);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("hi", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ask Pip")).not.toBeFocused();
  await expect(page.getByTestId("agent-thinking")).toBeVisible();
  await expectHeaderToBeCompact(page);
  await responsePromise;
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect(page.getByLabel("Ask Pip")).not.toBeFocused();
  await expect(page.getByText("Hi. Ask me about Spendable Cash Today or setup.")).toBeVisible();
});

test("guest onboarding starts Google OAuth from the Pip screen", async ({ page }) => {
  await page.route("**/api/auth/oauth/google", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>Google OAuth handoff reached.</body></html>",
    });
  });
  await page.goto("/?onboarding=guest");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Hi, I’m Pip. I’ll show what’s actually spendable today.")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");
  await expect(page.getByLabel("Ask Pip")).toHaveAttribute(
    "placeholder",
    "Ask Pip anything...",
  );

  await routeAgentThroughMockModel(page);

  const handoffPromise = page.waitForRequest((request) =>
    request.url().includes("/api/auth/oauth/google"),
  );
  await page.getByRole("button", { name: "Get signed up" }).click();

  await expect(page.getByText("Get me signed up", { exact: true })).toBeVisible();
  await expect(page.getByText("I’ll send you to Google to start.")).toBeVisible();
  await handoffPromise;
});

test("consent onboarding stays on the Pip screen before loading the number", async ({ page }) => {
  let agentPayload: { selectedPromptChipId?: string } | null = null;
  await page.route("**/api/agent", async (route) => {
    agentPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createMockAgentResponse(agentPayload ?? {})),
    });
  });

  await page.goto("/?onboarding=consent");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Welcome back.")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");
  await expect(page.getByLabel("Ask Pip")).toHaveAttribute(
    "placeholder",
    "Protected savings, e.g. 200...",
  );

  const responsePromise = waitForAgentResponse(page);
  await page.getByRole("button", { name: "Use $250" }).click();

  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect(agentPayload).toMatchObject({
    selectedPromptChipId: "set-250-savings",
  });
  await expect(page.getByText("I saved that amount and will reload setup.")).toBeVisible();
});

test("connect data does not leave the chat stuck while Plaid is loading", async ({ page }) => {
  const plaidScript: { route: Route | null } = {
    route: null,
  };
  await routeAgentThroughMockModel(page);
  await page.route("**/api/free-cash?scenario=default", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "no-financial-data",
        error: "Connect financial data before using live Spendable Cash Today.",
      }),
    });
  });
  await page.route("**/api/sync/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        institutions: [],
        latestSyncRun: null,
        hasStaleInstitution: false,
      }),
    });
  });
  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "recorded",
      }),
    });
  });
  await page.route("https://cdn.plaid.com/link/v2/stable/link-initialize.js", (route) => {
    plaidScript.route = route;
  });

  await page.goto("/?onboarding=ready");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Connect your data and I’ll calculate Spendable Cash Today.")).toBeVisible();
  await page.getByRole("button", { name: "Connect data" }).click();

  await expect(page.getByText("I’ll open Plaid now.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect
    .poll(() => Boolean(plaidScript.route), {
      message: "Expected the Plaid script request to be intercepted.",
    })
    .toBe(true);

  if (!plaidScript.route) {
    throw new Error("Expected the Plaid script request to be intercepted.");
  }

  await plaidScript.route.abort();
  await expect(page.getByText("Plaid failed to load.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
});

test("connect data completes Plaid exchange and syncs back to the same Pip screen", async ({ page }) => {
  let freeCashRequestCount = 0;
  let exchangePayload: unknown = null;
  let syncPayload: unknown = null;

  await routeAgentThroughMockModel(page);
  await page.route("**/api/free-cash?scenario=default", async (route) => {
    freeCashRequestCount += 1;

    if (freeCashRequestCount === 1) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          code: "no-financial-data",
          error: "Connect financial data before using live Spendable Cash Today.",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createFreeCashResult(9100)),
    });
  });
  await page.route("**/api/sync/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        institutions: [],
        latestSyncRun: null,
        hasStaleInstitution: false,
      }),
    });
  });
  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "recorded",
      }),
    });
  });
  await page.route("**/api/providers/plaid/exchange", async (route) => {
    exchangePayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "connected",
        institutionId: "institution-1",
        institutionName: "Northstar Bank",
      }),
    });
  });
  await page.route("**/api/sync/manual", async (route) => {
    syncPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        syncRunId: "sync-1",
        provider: "plaid",
        institutionId: "institution-1",
        accountCount: 3,
        transactionCount: 22,
        balanceCount: 3,
        freeCashTodayCents: 9100,
      }),
    });
  });
  await page.route("https://cdn.plaid.com/link/v2/stable/link-initialize.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.Plaid = {
          create: function(config) {
            window.__spendablePlaidConfig = config;
            return {
              open: function() {
                window.setTimeout(function() {
                  config.onSuccess("public-sandbox-token-success", {
                    institution: {
                      name: "Northstar Bank",
                      institution_id: "ins_success"
                    }
                  });
                }, 10);
              }
            };
          }
        };
      `,
    });
  });

  await page.goto("/?onboarding=ready");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Connect your data and I’ll calculate Spendable Cash Today.")).toBeVisible();
  await page.getByRole("button", { name: "Connect data" }).click();

  await expect(page.getByText("I’ll open Plaid now.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();

  await expect
    .poll(() => freeCashRequestCount, {
      message: "Expected Pip to reload the live Spendable Cash Today result after Plaid sync.",
    })
    .toBeGreaterThanOrEqual(2);

  await expect(page.getByTestId("free-cash-number")).toHaveText("$91");
  expect(exchangePayload).toMatchObject({
    publicToken: "public-sandbox-token-success",
    metadata: {
      institution: {
        name: "Northstar Bank",
        institution_id: "ins_success",
      },
    },
  });
  expect(syncPayload).toMatchObject({
    provider: "plaid",
    reason: "manual",
  });
});

test("live data loading does not wipe same-screen onboarding chat cards", async ({ page }) => {
  let releaseFreeCash: (() => Promise<void>) | undefined;

  await page.route("**/api/agent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(baseAgentResponse({
        message: "I turn your connected account activity into Spendable Cash Today.",
        usedTools: [],
        responseMode: "chat_only",
        cards: [],
      })),
    });
  });
  await page.route("**/api/free-cash?scenario=default", async (route) => {
    await new Promise<void>((resolve) => {
      releaseFreeCash = async () => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createFreeCashResult(7800)),
        });
        resolve();
      };
    });
  });
  await page.route("**/api/sync/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        institutions: [],
        latestSyncRun: null,
        hasStaleInstitution: false,
      }),
    });
  });
  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "recorded",
      }),
    });
  });

  await page.goto("/?onboarding=ready");
  await page.waitForLoadState("domcontentloaded");

  await page.getByLabel("Ask Pip").fill("Tell me how Pip works");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I turn your connected account activity")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");

  await expect
    .poll(() => Boolean(releaseFreeCash), {
      message: "Expected the app to request the live Spendable Cash Today result.",
    })
    .toBe(true);

  await releaseFreeCash?.();

  await expect(page.getByTestId("free-cash-number")).toHaveText("$78");
  await expect(page.getByText("Tell me how Pip works", { exact: true })).toBeVisible();
  await expect(page.getByText("I turn your connected account activity")).toBeVisible();
});

function waitForAgentResponse(page: Page) {
  return page.waitForResponse((response) => {
    if (!response.url().includes("/api/agent") || response.request().method() !== "POST") {
      return false;
    }

    try {
      const body = response.request().postDataJSON() as { requestKind?: string } | null;

      return body?.requestKind !== "prompt_chips";
    } catch {
      return true;
    }
  });
}

async function routeAgentThroughMockModel(page: Page) {
  await page.route("**/api/agent", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createMockAgentResponse(route.request().postDataJSON())),
    });
  });
}

function createMockAgentResponse(
  body: { message?: string; selectedPromptChipId?: string; requestKind?: string } = {},
) {
  const userMessage = body.message ?? "";
  const normalized = userMessage.toLowerCase();

  if (body.requestKind === "prompt_chips") {
    return baseAgentResponse({
      message: "Ready.",
      usedTools: [],
      responseMode: "chat_only",
      cards: [],
      promptChips: [
        {
          id: "ai-upcoming-bills",
          label: "Upcoming bills",
          prompt: "What bills are coming up?",
        },
        {
          id: "ai-payday-impact",
          label: "Payday impact",
          prompt: "How did payday affect today?",
        },
        {
          id: "ai-show-trend",
          label: "Show my trend",
          prompt: "Show my Spendable Cash Today trend",
        },
      ],
    });
  }

  if (body.selectedPromptChipId === "get-signed-up") {
    return baseAgentResponse({
      message: "I’ll send you to Google to start.",
      usedTools: ["start_google_oauth"],
      responseMode: "update_context",
      cards: [],
      clientAction: {
        type: "oauth_redirect",
        url: "/api/auth/oauth/google",
      },
    });
  }

  if (body.selectedPromptChipId === "set-250-savings") {
    return baseAgentResponse({
      message: "I saved that amount and will reload setup.",
      usedTools: ["save_protected_savings"],
      responseMode: "update_context",
      cards: [],
      clientAction: {
        type: "reload",
      },
    });
  }

  if (body.selectedPromptChipId === "connect-data") {
    return baseAgentResponse({
      message: "I’ll open Plaid now.",
      usedTools: ["start_plaid_link"],
      responseMode: "update_context",
      cards: [],
      clientAction: {
        type: "open_plaid",
        plaid: {
          kind: "plaid",
          linkToken: "link-sandbox-test",
          environment: "sandbox",
          products: ["transactions"],
          mode: "connect",
        },
      },
    });
  }

  if (normalized.includes("why") || normalized.includes("changed")) {
    return baseAgentResponse({
      message: "I found the main drivers.",
      usedTools: ["get_free_cash_drivers"],
      responseMode: "show_card",
      cards: [
        {
          type: "free_cash_explanation",
          title: "Why this number changed",
          summary: "$43 reflects income, spending, and protected savings in the rolling window.",
          drivers: [
            {
              id: "income",
              label: "Income in window",
              detail: "Paychecks and deposits that count as income.",
              amountCents: 500000,
              tone: "positive",
            },
          ],
          warnings: [
            {
              id: "missing-card",
              label: "Possible missing card",
              detail: "I see a payment to Capital One, but that card is not connected.",
              tone: "warning",
              issuerName: "Capital One",
            },
          ],
          dataStates: [],
        },
      ],
    });
  }

  if (normalized.includes("true balance")) {
    return baseAgentResponse({
      message: "I found your actual balances.",
      usedTools: ["get_true_balances"],
      responseMode: "show_card",
      cards: [
        {
          type: "true_balances",
          title: "True balances",
          balances: [
            {
              accountId: "checking-1",
              name: "Everyday Checking",
              institutionName: "Northstar Bank",
              kind: "checking",
              balanceCents: 124300,
              availableBalanceCents: 124300,
              lastFour: "1111",
            },
          ],
        },
      ],
    });
  }

  if (normalized.includes("recent transaction")) {
    return baseAgentResponse({
      message: "I found these recent items.",
      usedTools: ["get_recent_transactions"],
      responseMode: "show_card",
      cards: [
        {
          type: "recent_transactions",
          title: "Recent transactions",
          transactions: [
            {
              id: "transaction-1",
              accountId: "checking-1",
              date: "2026-06-05",
              description: "Basecamp Market",
              merchantName: "Basecamp Market",
              amountCents: -1832,
              kind: "purchase",
              pending: false,
            },
          ],
        },
      ],
    });
  }

  if (normalized.includes("math")) {
    return baseAgentResponse({
      message: "I pulled the math.",
      usedTools: ["get_free_cash_math"],
      responseMode: "show_card",
      cards: [
        {
          type: "math_breakdown",
          title: "Math breakdown",
          incomeTotalCents: 500000,
          spendingTotalCents: 350000,
          protectedSavingsMonthlyCents: 20000,
          rollingNetCents: 130000,
          dayCount: 30,
        },
      ],
    });
  }

  if (normalized.includes("missing") || normalized.includes("card")) {
    return baseAgentResponse({
      message: "I found a possible missing card.",
      usedTools: ["get_data_quality"],
      responseMode: "show_card",
      cards: [
        {
          type: "missing_card_nudge",
          title: "Possible missing card",
          detail: "I see a payment to Capital One, but that card is not connected.",
          issuerName: "Capital One",
        },
      ],
    });
  }

  const amountMatch = userMessage.match(/\$(\d+)/);
  if (amountMatch) {
    const amountCents = Number(amountMatch[1]) * 100;
    const afterTodayCents = 4300 - amountCents;

    return baseAgentResponse({
      message: afterTodayCents < 0
        ? `You can, but it would put you ${formatTestMoney(Math.abs(afterTodayCents))} over today.`
        : `That would leave ${formatTestMoney(afterTodayCents)} for today.`,
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents,
          beforeCents: 4300,
          afterTodayCents,
          monthlyAverageAfterCents: Math.round(afterTodayCents / 31),
        },
      ],
    });
  }

  return baseAgentResponse({
    message: "I can help with that.",
    usedTools: [],
    responseMode: "chat_only",
    cards: [],
  });
}

function baseAgentResponse(input: {
  message: string;
  usedTools: string[];
  responseMode: "chat_only" | "show_card" | "update_context" | "clarify";
  cards: unknown[];
  clientAction?: unknown;
  promptChips?: unknown[];
}) {
  return {
    message: input.message,
    cards: input.cards,
    promptChips: input.promptChips ?? [],
    usedTools: input.usedTools,
    responseMode: input.responseMode,
    clientAction: input.clientAction,
    audit: {
      toolNames: input.usedTools,
      usedModel: true,
      model: "test-model",
    },
  };
}

function formatTestMoney(amountCents: number) {
  const sign = amountCents < 0 ? "-" : "";
  const absoluteDollars = Math.abs(Math.round(amountCents / 100));

  return `${sign}$${absoluteDollars}`;
}

async function expectNoDocumentHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectMobileRegionsToStack(page: Page) {
  const number = await requiredBox(page.getByTestId("free-cash-number"));
  const thread = await requiredBox(page.getByTestId("agent-thread"));
  const chips = await requiredBox(page.getByTestId("prompt-chips"));
  const input = await requiredBox(page.getByTestId("agent-input"));
  const viewport = page.viewportSize();

  if (!viewport) {
    throw new Error("Expected Playwright viewport to be configured.");
  }

  expect(number.bottom).toBeLessThanOrEqual(thread.top + 4);
  expect(thread.bottom).toBeLessThanOrEqual(chips.top + 4);
  expect(chips.bottom).toBeLessThanOrEqual(input.top + 4);
  expect(input.bottom).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectElementHorizontallyInsideViewport(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await requiredBox(locator);
  const viewport = page.viewportSize();

  if (!viewport) {
    throw new Error("Expected Playwright viewport to be configured.");
  }

  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(viewport.width + 1);
}

async function expectVisibleElementAboveInput(page: Page, locator: ReturnType<Page["locator"]>) {
  await expect
    .poll(async () => {
      const element = await requiredBox(locator);
      const chips = await requiredBox(page.getByTestId("prompt-chips"));

      return element.bottom - chips.top;
    })
    .toBeLessThanOrEqual(1);
}

async function expectHeaderToBeCompact(page: Page) {
  await expect
    .poll(async () => {
      const number = await requiredBox(page.getByTestId("free-cash-number"));

      return number.height;
    })
    .toBeLessThan(62);
}

async function requiredBox(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Expected locator to have a bounding box.");
  }

  return {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    height: box.height,
  };
}

function createFreeCashResult(freeCashTodayCents: number) {
  return {
    freeCashTodayCents,
    rollingNetCents: 11800,
    incomeTotalCents: 250000,
    spendingTotalCents: 238200,
    refundTotalCents: 0,
    protectedSavingsMonthlyCents: 20000,
    window: {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      dayCount: 30,
      daysElapsed: 7,
      daysRemaining: 23,
    },
    drivers: [
      {
        id: "rolling-net",
        label: "Rolling net",
        detail: "Income minus spending so far this month.",
        amountCents: 11800,
        tone: "positive",
      },
    ],
    warnings: [],
    dataStates: [],
    trueBalances: [
      {
        accountId: "checking-1",
        name: "Everyday Checking",
        institutionName: "Test Bank",
        kind: "checking",
        balanceCents: 30000,
        availableBalanceCents: 30000,
        lastFour: "1111",
      },
    ],
  };
}
