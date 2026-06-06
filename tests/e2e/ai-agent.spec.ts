import { expect, test, type Page, type Route } from "@playwright/test";

test("AI agent loop keeps one number while cards persist in the thread", async ({
  page,
  request,
}) => {
  await routeAgentThroughMockModel(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Why this number?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Can I spend $50?" })).toBeVisible();

  const apiResponse = await request.post("/api/agent", {
    headers: {
      "x-free-cash-ai-mode": "mock-model",
    },
    data: {
      message: "Can I spend $50?",
    },
  });
  const apiJson = await apiResponse.json();

  expect(apiResponse.ok()).toBe(true);
  expect(apiJson.audit.usedModel).toBe(true);
  expect(apiJson.audit.model).toBe("gpt-5-nano");
  expect(apiJson.audit.toolNames).toEqual(["simulate_purchase"]);

  const whyChip = page.getByRole("button", { name: "Why this number?" });
  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    whyChip.click(),
  ]);
  const whyJson = await whyResponse.json();

  expect(whyJson.audit.toolNames).toEqual(["explain_free_cash"]);
  await expect(page.getByRole("heading", { name: "Why Free Cash changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  const chip = page.getByRole("button", { name: "Can I spend $50?" });
  const [chipResponse] = await Promise.all([
    waitForAgentResponse(page),
    chip.click(),
  ]);
  const chipJson = await chipResponse.json();

  expect(chipJson.audit.usedModel).toBe(true);

  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toBeVisible();
  await expect(page.getByText("That $50 test spend would put today's Free Cash at -$7.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why Free Cash changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  const input = page.getByLabel("Ask Spendable");
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
  await expect(page.getByText("That $20 test spend would put today's Free Cash at $23.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  await input.fill("Show true balances");
  const [balancesResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const balancesJson = await balancesResponse.json();

  expect(balancesJson.audit.toolNames).toEqual(["show_true_balances"]);
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByText("Everyday Checking")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase simulation" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  await input.fill("Show recent transactions");
  const [transactionsResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const transactionsJson = await transactionsResponse.json();

  expect(transactionsJson.audit.toolNames).toEqual(["show_recent_transactions"]);
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toBeVisible();
  await expect(page.getByText("Basecamp Market")).toBeVisible();
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  await input.fill("Show the math");
  const [mathResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const mathJson = await mathResponse.json();

  expect(mathJson.audit.toolNames).toEqual(["show_math"]);
  await expect(page.getByRole("heading", { name: "Math breakdown" })).toBeVisible();
  await expect(page.getByText("Rolling net")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent transactions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();

  await input.fill("Is a card missing?");
  const [missingCardResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);
  const missingCardJson = await missingCardResponse.json();

  expect(missingCardJson.audit.toolNames).toEqual(["detect_missing_card"]);
  await expect(page.getByRole("heading", { name: "Free Cash may be missing card spend" })).toBeVisible();
  await expect(page.getByText("Capital One", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Math breakdown" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "$43" })).toBeVisible();
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
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("prompt-chips"));
  await expectElementHorizontallyInsideViewport(page, page.getByTestId("agent-input"));

  const [whyResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Why this number?" }).click(),
  ]);

  expect((await whyResponse.json()).audit.toolNames).toEqual(["explain_free_cash"]);
  await expect(page.getByRole("heading", { name: "Why Free Cash changed" })).toBeVisible();
  await expectHeaderToBeCompact(page);
  await expectNoDocumentHorizontalOverflow(page);
  await expectMobileRegionsToStack(page);
  await expectVisibleElementAboveInput(page, page.getByRole("heading", { name: "Why Free Cash changed" }));

  await page.getByLabel("Ask Spendable").fill("Show true balances");
  const [balancesResponse] = await Promise.all([
    waitForAgentResponse(page),
    page.getByRole("button", { name: "Send" }).click(),
  ]);

  expect((await balancesResponse.json()).audit.toolNames).toEqual(["show_true_balances"]);
  await expect(page.getByRole("heading", { name: "True balances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why Free Cash changed" })).toBeVisible();
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
        message: "Hi. Ask about today's Free Cash number, a purchase, transactions, or what changed.",
        cards: [],
        promptChips: [
          {
            id: "why",
            label: "Why this number?",
            prompt: "Why this number?",
          },
          {
            id: "spend-50",
            label: "Can I spend $50?",
            prompt: "Can I spend $50?",
          },
          {
            id: "changed",
            label: "What changed?",
            prompt: "What changed?",
          },
        ],
        audit: {
          toolNames: ["answer_unrelated"],
          usedModel: true,
          model: "test-model",
        },
      }),
    });
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Ask Spendable").fill("hi");
  const responsePromise = waitForAgentResponse(page);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("hi", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ask Spendable")).toBeFocused();
  await expect(page.getByTestId("agent-thinking")).toBeVisible();
  await expectHeaderToBeCompact(page);
  await responsePromise;
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect(page.getByLabel("Ask Spendable")).toBeFocused();
  await expect(page.getByText("Hi. Ask about today's Free Cash number")).toBeVisible();
});

test("guest onboarding stays on the Spendable screen through email capture", async ({ page }) => {
  await page.route("**/api/auth/sign-in", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "sent",
      }),
    });
  });

  await page.goto("/?onboarding=guest");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Your Free Cash number starts here.")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");
  await expect(page.getByLabel("Ask Spendable")).toHaveAttribute("placeholder", "Enter your email...");

  await page.getByLabel("Ask Spendable").fill("tester@example.com");
  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/sign-in") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("tester@example.com", { exact: true })).toBeVisible();
  await expect(page.getByTestId("agent-thinking")).toBeVisible();
  await responsePromise;
  await expect(page.getByTestId("agent-thinking")).toBeHidden();
  await expect(page.getByText("I sent the sign-in link to tester@example.com")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");
  await expect(page.getByLabel("Ask Spendable")).toBeFocused();
});

test("consent onboarding stays on the Spendable screen before loading the number", async ({ page }) => {
  let consentPayload: unknown = null;
  await page.route("**/api/auth/consent", async (route) => {
    consentPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "accepted",
      }),
    });
  });

  await page.goto("/?onboarding=consent");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Welcome back.")).toBeVisible();
  await expect(page.getByTestId("free-cash-number")).toHaveText("$--");
  await expect(page.getByLabel("Ask Spendable")).toHaveAttribute(
    "placeholder",
    "Protected savings, e.g. 200...",
  );

  await page.getByLabel("Ask Spendable").fill("250");
  const responsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/consent") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Send" }).click();

  await responsePromise;
  expect(consentPayload).toMatchObject({
    protectedSavingsMonthlyCents: 25000,
  });
  await expect(page.getByText("You’re set. I’m loading your Free Cash number")).toBeVisible();
});

test("connect data does not leave the chat stuck while Plaid is loading", async ({ page }) => {
  const plaidScript: { route: Route | null } = {
    route: null,
  };
  await page.route("**/api/free-cash?scenario=default", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        code: "no-financial-data",
        error: "Connect financial data before using live Free Cash.",
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
  await page.route("**/api/providers/connect", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "plaid",
        status: "ready",
        message: "Plaid Link is ready.",
        connect: {
          kind: "plaid",
          linkToken: "link-sandbox-test",
          environment: "sandbox",
          products: ["transactions"],
          mode: "connect",
        },
      }),
    });
  });
  await page.route("https://cdn.plaid.com/link/v2/stable/link-initialize.js", (route) => {
    plaidScript.route = route;
  });

  await page.goto("/?onboarding=ready");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Step 3 is connecting your data.")).toBeVisible();
  await page.getByRole("button", { name: "Connect data" }).click();

  await expect(page.getByText("I’m opening Plaid now.")).toBeVisible();
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

function waitForAgentResponse(page: Page) {
  return page.waitForResponse((response) => {
    return response.url().includes("/api/agent") && response.request().method() === "POST";
  });
}

async function routeAgentThroughMockModel(page: Page) {
  await page.route("**/api/agent", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-free-cash-ai-mode": "mock-model",
      },
    });
  });
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
