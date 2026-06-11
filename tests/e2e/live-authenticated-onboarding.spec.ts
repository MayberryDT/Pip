import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

const storageState = process.env.PIP_LIVE_STORAGE_STATE;
const usableStorageState = storageState && existsSync(storageState) ? storageState : undefined;
const shouldCompletePlaid = process.env.PIP_LIVE_COMPLETE_PLAID === "1";
const plaidInstitution = process.env.PIP_LIVE_PLAID_INSTITUTION ?? "First Platypus Bank";
const plaidUsername = process.env.PIP_LIVE_PLAID_USERNAME ?? "user_good";
const plaidPassword = process.env.PIP_LIVE_PLAID_PASSWORD ?? "pass_good";

test.describe("live authenticated onboarding smoke", () => {
  test.skip(
    !usableStorageState,
    "Set PIP_LIVE_STORAGE_STATE to an existing Playwright storageState file for a Google user.",
  );

  test.use({
    storageState: usableStorageState,
  });

  test("proves the deployed Google onboarding path reaches connected Spendable Cash Today", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await assertAuthenticatedSession(page);

    await expect(page.getByText("Pip", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Ask Pip")).toBeVisible();
    await completeConsentIfNeeded(page);

    await completePlaidIfNeeded(page);

    await expect(page.getByTestId("pip-cash-number")).not.toHaveText("$--", {
      timeout: 15_000,
    });
    const responsePromise = page.waitForResponse((response) => {
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
    await page.getByLabel("Ask Pip").fill("Why this number?");
    await page.getByRole("button", { name: "Send" }).click();
    const response = await responsePromise;
    const payload = await response.json();

    expect(response.ok()).toBe(true);
    expect(payload.audit?.usedModel).toBe(true);
    expect(payload.audit?.toolNames).toContain("get_pip_cash_drivers");
    await expect(page.getByRole("heading", { name: "Why this number changed" })).toBeVisible();
  });
});

async function assertAuthenticatedSession(page: Page) {
  const syncStatusResponse = await page.request.get("/api/sync/status");

  expect(
    syncStatusResponse.status(),
    "Saved storage state must belong to a signed-in Google user before the live smoke can prove onboarding.",
  ).not.toBe(401);
  expect(syncStatusResponse.ok()).toBe(true);
}

async function completeConsentIfNeeded(page: Page) {
  if (!(await page.getByText("Let’s set aside a little cushion first.").isVisible().catch(() => false))) {
    return;
  }

  const consentResponse = page.waitForResponse((response) => {
    return response.url().includes("/api/auth/consent") && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Use $200 cushion" }).click();
  await expect((await consentResponse).ok()).toBe(true);
  await page.waitForLoadState("domcontentloaded");
}

async function completePlaidIfNeeded(page: Page) {
  const connectStep = page.getByText("Almost there. Connect your account data and I’ll start showing your spendable cash.");

  if (!(await connectStep.isVisible().catch(() => false))) {
    await assertConnectedSyncStatus(page);
    return;
  }

  if (!shouldCompletePlaid) {
    throw new Error(
      "The live user is still at the connect-data step. Set PIP_LIVE_COMPLETE_PLAID=1 to let this smoke attempt Plaid Sandbox Link, or complete Plaid manually and save storage state again.",
    );
  }

  await page.getByRole("button", { name: "Connect data" }).click();
  await expect(page.getByText("I’m opening Plaid now.")).toBeVisible();
  const exchangeResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/providers/plaid/exchange") && response.request().method() === "POST";
  });
  const syncResponsePromise = page.waitForResponse((response) => {
    return response.url().includes("/api/sync/manual") && response.request().method() === "POST";
  });
  await completePlaidSandboxLink(page);
  const exchangeResponse = await exchangeResponsePromise;
  const syncResponse = await syncResponsePromise;

  expect(exchangeResponse.ok()).toBe(true);
  expect(syncResponse.ok()).toBe(true);
  await expect(syncResponse.json()).resolves.toMatchObject({
    provider: "plaid",
  });
  await expect(page.getByText("Connected. I’m syncing your account data")).toBeVisible({
    timeout: 45_000,
  });
  await page.waitForLoadState("domcontentloaded");
  await assertConnectedSyncStatus(page);
}

async function assertConnectedSyncStatus(page: Page) {
  const syncStatusResponse = await page.request.get("/api/sync/status");

  expect(syncStatusResponse.ok()).toBe(true);

  const syncStatus = await syncStatusResponse.json();
  const plaidInstitution = syncStatus.institutions?.find(
    (institution: { provider?: string; status?: string }) => institution.provider === "plaid",
  );

  expect(plaidInstitution).toMatchObject({
    provider: "plaid",
    status: "connected",
  });
  expect(syncStatus.latestSyncRun).toMatchObject({
    provider: "plaid",
    status: "succeeded",
  });
  expect(syncStatus.latestSyncRun.accountCount).toBeGreaterThan(0);
  expect(syncStatus.latestSyncRun.transactionCount).toBeGreaterThan(0);
}

async function completePlaidSandboxLink(page: Page) {
  const plaidFrame = page.frameLocator('iframe[src*="plaid.com"]').first();

  await clickFirstVisible([
    plaidFrame.getByRole("button", { name: /continue/i }),
    plaidFrame.getByRole("button", { name: /get started/i }),
  ]);

  await fillFirstVisible(
    [
      plaidFrame.getByPlaceholder(/search/i),
      plaidFrame.getByRole("textbox", { name: /search/i }),
    ],
    plaidInstitution,
  );
  await clickFirstVisible([
    plaidFrame.getByText(plaidInstitution, { exact: false }),
    plaidFrame.getByRole("button", { name: new RegExp(plaidInstitution, "i") }),
  ]);

  await fillFirstVisible(
    [
      plaidFrame.getByLabel(/username/i),
      plaidFrame.getByPlaceholder(/username/i),
      plaidFrame.locator('input[name*="user" i]').first(),
    ],
    plaidUsername,
  );
  await fillFirstVisible(
    [
      plaidFrame.getByLabel(/password/i),
      plaidFrame.getByPlaceholder(/password/i),
      plaidFrame.locator('input[type="password"]').first(),
    ],
    plaidPassword,
  );
  await clickFirstVisible([
    plaidFrame.getByRole("button", { name: /submit/i }),
    plaidFrame.getByRole("button", { name: /continue/i }),
  ]);

  await clickFirstVisible([
    plaidFrame.getByRole("button", { name: /continue/i }),
    plaidFrame.getByRole("button", { name: /allow/i }),
    plaidFrame.getByRole("button", { name: /connect/i }),
  ]);
}

async function fillFirstVisible(locators: ReturnType<Page["locator"]>[], value: string) {
  for (const locator of locators) {
    if (await locator.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await locator.fill(value);
      return;
    }
  }

  throw new Error("Expected one of the Plaid Link fields to be visible.");
}

async function clickFirstVisible(locators: ReturnType<Page["locator"]>[]) {
  for (const locator of locators) {
    if (await locator.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await locator.click();
      return;
    }
  }

  throw new Error("Expected one of the Plaid Link buttons to be visible.");
}
