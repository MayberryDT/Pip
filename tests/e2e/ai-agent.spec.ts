import { expect, test, type Page } from "@playwright/test";

test("AI agent loop keeps one number while cards persist in the thread", async ({
  page,
}) => {
  await routeAgentThroughMockModel(page);
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");
  await expect(page.getByRole("button", { name: "What pattern are you using?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check if the data looks right" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the biggest drivers" })).toBeVisible();
  await expect(page.getByText("Why this number?")).toHaveCount(0);
  await expect(page.getByText("Can I spend $50?")).toHaveCount(0);
  await expect(page.getByText("What changed?")).toHaveCount(0);

  const input = page.getByLabel("Ask Pip");
  await input.fill("Why this number?");
  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const whyJson = await whyResponse.json();

  expect(whyJson.audit.toolNames).toEqual(["get_pip_cash_drivers"]);
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show recent charges" })).toBeVisible();
  await expect(page.getByRole("button", { name: "What bills are coming up?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show how the math works" })).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

  const [recentChargeChipResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Show recent charges" }).click(),
  ]);
  const recentChargeChipJson = await recentChargeChipResponse.json();

  expect(recentChargeChipJson.audit.toolNames).toEqual(["get_recent_transactions"]);
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toBeVisible();
  await expect(page.getByText("Basecamp Market")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the biggest drivers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show my spending breakdown" })).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

  await input.fill("Can I spend $50?");
  const [chipResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const chipJson = await chipResponse.json();

  expect(chipJson.audit.usedModel).toBe(true);

  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toBeVisible();
  await expect(page.getByText("That would leave $54 in Spendable Cash Today.")).toBeVisible();
  await expect(page.getByText("Today room left")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

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
  await expect(page.getByText("That would leave $84 in Spendable Cash Today.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toHaveCount(2);
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

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
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

  await input.fill("Show recent transactions");
  const [transactionsResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const transactionsJson = await transactionsResponse.json();

  expect(transactionsJson.audit.toolNames).toEqual(["get_recent_transactions"]);
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toHaveCount(2);
  await expect(page.getByText("Basecamp Market")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

  await input.fill("Show the math");
  const [mathResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const mathJson = await mathResponse.json();

  expect(mathJson.audit.toolNames).toEqual(["get_pip_cash_math"]);
  await expect(page.getByRole("heading", { name: "Math breakdown" })).toBeVisible();
  await expect(page.getByText("Rolling net")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toHaveCount(2);
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

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
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");

  await input.fill("I want to save for a trip that costs $5,000");
  const [goalResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const goalJson = await goalResponse.json();

  expect(goalJson.audit.toolNames).toEqual(["create_savings_goal"]);
  await expect(page.getByRole("heading", { name: "Savings goal" })).toBeVisible();
  await expect(page.getByText("$5,000 left for Trip.")).toBeVisible();
  await expect(page.getByText("Tracked only. Not held out of today's number.")).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");
});

test("mobile viewport keeps the one-number layout from overlapping or overflowing", async ({
  page,
}) => {
  await page.setViewportSize({
    width: 360,
    height: 740,
  });
  await routeAgentThroughMockModel(page);
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("pip-cash-number"));
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("agent-input"));
  await expectChatChromePinned(page);

  await page.getByLabel("Ask Pip").fill("Why this number?");
  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);

  expect((await whyResponse.json()).audit.toolNames).toEqual(["get_pip_cash_drivers"]);
  await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  await expectHeaderToBeCompact(page);
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectVisibleElementAboveInput(page, page.getByRole("heading", { name: "Why this number changed" }));
  await expectChatChromePinned(page);

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
  await page.evaluate(() => window.scrollTo(0, 1000));
  await expectChatChromePinned(page);
  await page.getByTestId("agent-thread").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectChatChromePinned(page);
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
  await page.goto("/app");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Ask Pip").fill("hi");
  const responsePromise = waitForAgentResponse(page);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("hi", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ask Pip")).toHaveValue("");
  await expect(page.getByLabel("Ask Pip")).toBeEnabled();
  await expect(page.getByTestId("agent-thinking")).toBeVisible();
  await expectHeaderToBeCompact(page);
  await responsePromise;
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect(page.getByLabel("Ask Pip")).toBeEnabled();
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
  await page.goto("/app?onboarding=guest");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Hi, I’m Pip. I’ll help you find what’s okay to spend today.")).toBeVisible();
  await expect(page.getByText("First we’ll sign in. Then we’ll choose monthly savings and connect data.")).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveCount(0);
  await expect(page.getByTestId("agent-input")).toHaveCount(0);

  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
    "href",
    "/api/auth/oauth/google",
  );
});

test("consent onboarding stays on the Pip screen before loading the number", async ({ page }) => {
  let consentPayload: { protectedSavingsMonthlyCents?: number } | null = null;
  await page.route("**/api/auth/consent", async (route) => {
    consentPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "accepted" }),
    });
  });

  await page.goto("/app?onboarding=consent");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Choose monthly savings.")).toBeVisible();
  await expect(page.getByText("Pip does not move money.")).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveCount(0);
  await expect(page.getByTestId("agent-input")).toHaveCount(0);

  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/consent") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save $200/month" }).click();

  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  expect(consentPayload).toMatchObject({
    protectedSavingsMonthlyCents: 20000,
  });
});

test("dev test onboarding walks a fresh local user through setup", async ({ page }) => {
  await routeAgentThroughMockModel(page);
  await page.goto("/app?onboarding=test");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Hi, I’m Pip. I’ll help you find what’s okay to spend today.")).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Choose monthly savings.")).toBeVisible();
  await expect(page.getByTestId("agent-input")).toHaveCount(0);

  await page.getByRole("button", { name: "Save $200/month" }).click();
  await expect(page.getByText("Connect your account data.")).toBeVisible();
  await expect(page.getByText("I’ll open Plaid, then we’ll move into chat.")).toBeVisible();
  await expect(page.getByTestId("pip-cash-number")).toHaveCount(0);

  await page.getByRole("button", { name: "Connect data" }).click();
  await expect(page.getByTestId("pip-cash-number")).toHaveText("$104");
  await expect(page.getByRole("button", { name: "Manage accounts" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "What pattern are you using?" })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Settings are here.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage accounts" })).toBeVisible();
});

test("connect data does not leave the chat stuck while Plaid is loading", async ({ page }) => {
  await routeAgentThroughMockModel(page);
  await page.route("**/api/pip-cash?scenario=default", async (route) => {
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
  await page.route("**/api/sync/app-open", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "no_provider",
        message: "No connected financial provider can refresh yet.",
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
  await page.addInitScript(() => {
    (window as unknown as {
      Plaid: {
        create(input: {
          onExit(error: { error_message?: string } | null): void;
        }): {
          open(): void;
        };
      };
    }).Plaid = {
      create(config) {
        return {
          open() {
            window.setTimeout(() => {
              config.onExit({
                error_message: "Plaid failed to load.",
              });
            }, 10);
          },
        };
      },
    };
  });

  await page.goto("/app?onboarding=ready");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Connect your account data.")).toBeVisible();
  await expect(page.getByText("I’ll open Plaid, then we’ll move into chat.")).toBeVisible();
  await page.getByRole("button", { name: "Connect data" }).click();

  await expect(page.getByText("I’ll open Plaid now.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect(page.getByText("Plaid failed to load.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
});

test("connect data completes Plaid exchange and syncs back to the same Pip screen", async ({ page }) => {
  let pipCashRequestCount = 0;
  let exchangePayload: unknown = null;
  let syncPayload: unknown = null;

  await routeAgentThroughMockModel(page);
  await page.route("**/api/pip-cash?scenario=default", async (route) => {
    pipCashRequestCount += 1;

    if (pipCashRequestCount === 1) {
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
      body: JSON.stringify(createPipCashResult(9100)),
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
  await page.route("**/api/sync/app-open", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "no_provider",
        message: "No connected financial provider can refresh yet.",
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
        pipCashTodayCents: 9100,
      }),
    });
  });
  await page.addInitScript(() => {
    (window as unknown as {
      Plaid: {
        create(input: {
          onSuccess(publicToken: string, metadata: {
            institution: {
              name: string;
              institution_id: string;
            };
          }): void;
        }): {
          open(): void;
        };
      };
    }).Plaid = {
      create(config) {
        return {
          open() {
            window.setTimeout(() => {
              config.onSuccess("public-sandbox-token-success", {
                institution: {
                  name: "Northstar Bank",
                  institution_id: "ins_success",
                },
              });
            }, 10);
          },
        };
      },
    };
  });

  await page.goto("/app?onboarding=ready");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Connect your account data.")).toBeVisible();
  await expect(page.getByText("I’ll open Plaid, then we’ll move into chat.")).toBeVisible();
  await page.getByRole("button", { name: "Connect data" }).click();

  await expect(page.getByText("I’ll open Plaid now.")).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeHidden();

  await expect
    .poll(() => Boolean(exchangePayload), {
      message: "Expected Pip to exchange the Plaid public token.",
    })
    .toBe(true);
  await expect
    .poll(() => Boolean(syncPayload), {
      message: "Expected Pip to run a manual sync after Plaid exchange.",
    })
    .toBe(true);

  expect(pipCashRequestCount).toBeGreaterThanOrEqual(1);
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

test("live data loading keeps onboarding focused until the number is ready", async ({ page }) => {
  let releasePipCash: (() => Promise<void>) | undefined;

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
  await page.route("**/api/pip-cash?scenario=default", async (route) => {
    await new Promise<void>((resolve) => {
      releasePipCash = async () => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createPipCashResult(7800)),
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
  await page.route("**/api/sync/app-open", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "no_provider",
        message: "No connected financial provider can refresh yet.",
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

  await page.goto("/app?onboarding=ready");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByText("I’m checking your connected data.")).toBeVisible();
  await expect(page.getByText("If I do not find data, connect data is next.")).toBeVisible();
  await expect(page.getByTestId("agent-input")).toHaveCount(0);

  await expect
    .poll(() => Boolean(releasePipCash), {
      message: "Expected the app to request the live Spendable Cash Today result.",
    })
    .toBe(true);

  await releasePipCash?.();

  await expect(page.getByTestId("pip-cash-number")).toHaveText("$78");
  await expect(page.getByLabel("Ask Pip")).toBeVisible();
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
  body: {
    message?: string;
    selectedPromptChipId?: string;
    requestKind?: string;
    conversationState?: {
      lastToolNames?: string[];
    };
  } = {},
) {
  const userMessage = body.message ?? "";
  const normalized = userMessage.toLowerCase();

  if (body.requestKind === "prompt_chips") {
    if (body.conversationState?.lastToolNames?.at(-1) === "get_pip_cash_drivers") {
      return baseAgentResponse({
        message: "Ready.",
        usedTools: [],
        responseMode: "chat_only",
        cards: [],
        promptChips: [
          {
            id: "ai-recent-charges",
            label: "Show recent charges",
            prompt: "Show my recent charges",
          },
          {
            id: "ai-upcoming-bills",
            label: "What bills are coming up?",
            prompt: "What bills are coming up?",
          },
          {
            id: "ai-show-math",
            label: "Show how the math works",
            prompt: "Show the math",
          },
        ],
      });
    }

    if (body.conversationState?.lastToolNames?.at(-1) === "get_recent_transactions") {
      return baseAgentResponse({
        message: "Ready.",
        usedTools: [],
        responseMode: "chat_only",
        cards: [],
        promptChips: [
          {
            id: "ai-biggest-drivers",
            label: "Show the biggest drivers",
            prompt: "Show the biggest drivers behind today's number",
          },
          {
            id: "ai-spending-breakdown",
            label: "Show my spending breakdown",
            prompt: "Show my spending breakdown",
          },
          {
            id: "ai-next-few-days",
            label: "What happens in the next few days?",
            prompt: "Show my Spendable Cash forecast",
          },
        ],
      });
    }

    return baseAgentResponse({
      message: "Ready.",
      usedTools: [],
      responseMode: "chat_only",
      cards: [],
      promptChips: [
        {
          id: "ai-what-number-means",
          label: "What does my $104 mean?",
          prompt: "What does my Spendable Cash Today number mean?",
        },
        {
          id: "ai-why-today",
          label: "Why is it $104 today?",
          prompt: "Show the biggest drivers behind today's number",
        },
        {
          id: "ai-teach-money-basic",
          label: "Teach me a money basic",
          prompt: "Teach me one useful money basic",
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
      usedTools: ["get_pip_cash_drivers"],
      responseMode: "show_card",
      cards: [
        {
          type: "pip_cash_explanation",
          title: "Why this number changed",
          summary: "$104 reflects income, spending, and protected savings in the rolling window.",
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

  if (normalized.includes("recent transaction") || normalized.includes("recent charges")) {
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
      usedTools: ["get_pip_cash_math"],
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

  if (/\bsave\b.{0,32}\b(for|toward|towards)\b|\bsavings? goals?\b|\btrip\b.{0,40}\b(cost|costs|goal|save|saving|target)\b/.test(normalized)) {
    const targetAmountCents = extractTestMoneyCents(userMessage) ?? 500000;

    return baseAgentResponse({
      message: "I set up the savings goal plan.",
      usedTools: ["create_savings_goal"],
      responseMode: "show_card",
      cards: [
        {
          type: "savings_goal_plan",
          title: "Savings goal",
          goalId: "goal-trip",
          name: "Trip",
          targetAmountCents,
          currentAmountCents: 0,
          remainingCents: targetAmountCents,
          monthlyContributionCents: 0,
          includeInSpendableCash: false,
          summary: `${formatTestMoney(targetAmountCents)} left for Trip. Tracked only for now.`,
        },
      ],
    });
  }

  const amountMatch = userMessage.match(/\$(\d+)/);
  if (amountMatch) {
    const amountCents = Number(amountMatch[1]) * 100;
    const afterTodayCents = 10400;
    const todayRemainingCents = 10400 - amountCents;
    const todayOverageCents = Math.max(0, amountCents - 10400);

    return baseAgentResponse({
      message: todayOverageCents > 0
        ? `That would put Spendable Cash Today at ${formatTestMoney(todayRemainingCents)}.`
        : `That would leave ${formatTestMoney(todayRemainingCents)} in Spendable Cash Today.`,
      usedTools: ["simulate_purchase"],
      responseMode: "show_card",
      cards: [
        {
          type: "purchase_simulation",
          title: "Purchase simulation",
          amountCents,
          beforeCents: 10400,
          todayRemainingCents,
          todayOverageCents,
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
  responseMode: "chat_only" | "show_card" | "update_context" | "clarify" | "guidance";
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

  return `${sign}$${absoluteDollars.toLocaleString("en-US")}`;
}

function extractTestMoneyCents(message: string): number | null {
  const match = message.match(/\$\s*(\d{1,6}(?:,\d{3})*)/);

  if (!match) {
    return null;
  }

  return Number(match[1].replaceAll(",", "")) * 100;
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
  const number = await requiredBox(page.getByTestId("pip-cash-number"));
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

async function expectChatChromePinned(page: Page) {
  const viewport = page.viewportSize();

  if (!viewport) {
    throw new Error("Expected Playwright viewport to be configured.");
  }

  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId("pip-cash-number")).toBeInViewport();
  await expect(page.getByTestId("agent-input")).toBeInViewport();

  const number = await requiredBox(page.getByTestId("pip-cash-number"));
  const input = await requiredBox(page.getByTestId("agent-input"));

  expect(number.top).toBeGreaterThanOrEqual(-1);
  expect(input.bottom).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectHeaderToBeCompact(page: Page) {
  await expect
    .poll(async () => {
      const number = await requiredBox(page.getByTestId("pip-cash-number"));

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

function createPipCashResult(pipCashTodayCents: number) {
  return {
    pipCashTodayCents,
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
