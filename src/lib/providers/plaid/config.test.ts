import { describe, expect, it, vi } from "vitest";
import { CountryCode, Products } from "plaid";
import {
  createPlaidConnectSession,
  getPlaidConfig,
  getPlaidReadiness,
  type PlaidClient,
} from "@/lib/providers/plaid/config";

describe("Plaid config", () => {
  it("reports unavailable until Plaid credentials are configured", () => {
    const config = getPlaidConfig({});

    expect(getPlaidReadiness(config)).toMatchObject({
      environment: "sandbox",
      clientIdConfigured: false,
      secretConfigured: false,
      canCreateLinkToken: false,
    });
  });

  it("filters Balance out of Link products and defaults to US transactions", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      PLAID_PRODUCTS: "transactions,balance",
      PLAID_COUNTRY_CODES: "US",
    });

    expect(config.products).toEqual([Products.Transactions]);
    expect(config.countryCodes).toEqual([CountryCode.Us]);
  });

  it("keeps Link product requests limited to MVP read-only transaction data", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      PLAID_PRODUCTS:
        "auth,transactions,transactions,liabilities,transfer,payment_initiation,signal,identity,balance",
    });

    expect(config.products).toEqual([Products.Transactions]);
  });

  it("derives the Plaid OAuth redirect URI from the canonical site URL", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com/some/path",
    });

    expect(config.redirectUri).toBe("https://spendwithpip.com/plaid/oauth");
  });

  it("derives the Plaid webhook URL from a public HTTPS site URL", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com/some/path",
    });

    expect(config.webhookUrl).toBe("https://spendwithpip.com/api/webhooks/plaid");
  });

  it("prefers an explicit public Plaid webhook URL", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com",
      PLAID_WEBHOOK_URL: "https://hooks.spendwithpip.com/plaid?ignored=true",
    });

    expect(config.webhookUrl).toBe("https://hooks.spendwithpip.com/plaid");
  });

  it("does not configure Plaid webhooks for localhost URLs", () => {
    const config = getPlaidConfig({
      PLAID_CLIENT_ID: "client-id",
      PLAID_SECRET: "secret",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      PLAID_WEBHOOK_URL: "http://localhost:3000/api/webhooks/plaid",
    });

    expect(config.webhookUrl).toBeUndefined();
  });

  it("creates a client-safe Link session without exposing credentials", async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: {
        link_token: "link-sandbox-123",
      },
    });
    const client = {
      linkTokenCreate,
    } as unknown as PlaidClient;

    const session = await createPlaidConnectSession({
      userId: "user-1",
      client,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
        PLAID_CLIENT_NAME: "Spendable",
        PLAID_REDIRECT_URI: "https://spendwithpip.com/plaid/oauth",
        NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com",
      }),
    });

    expect(session).toMatchObject({
      provider: "plaid",
      status: "ready",
      connect: {
        kind: "plaid",
        linkToken: "link-sandbox-123",
        environment: "sandbox",
        products: [Products.Transactions],
        mode: "connect",
      },
    });
    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        client_name: "Spendable",
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        redirect_uri: "https://spendwithpip.com/plaid/oauth",
        webhook: "https://spendwithpip.com/api/webhooks/plaid",
        user: {
          client_user_id: "user-1",
        },
      }),
    );
    expect(JSON.stringify(session)).not.toContain("secret");
  });

  it("creates Plaid update-mode Link sessions without product requests", async () => {
    const linkTokenCreate = vi.fn().mockResolvedValue({
      data: {
        link_token: "link-repair-123",
      },
    });
    const client = {
      linkTokenCreate,
    } as unknown as PlaidClient;

    const session = await createPlaidConnectSession({
      userId: "user-1",
      accessToken: "access-token",
      client,
      config: getPlaidConfig({
        PLAID_CLIENT_ID: "client-id",
        PLAID_SECRET: "secret",
        PLAID_PRODUCTS: "transactions",
        NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com",
      }),
    });

    expect(session).toMatchObject({
      provider: "plaid",
      status: "ready",
      message: "Plaid repair is ready.",
      connect: {
        kind: "plaid",
        linkToken: "link-repair-123",
        products: [],
        mode: "repair",
      },
    });
    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "access-token",
        country_codes: [CountryCode.Us],
        user: {
          client_user_id: "user-1",
        },
      }),
    );
    expect(linkTokenCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        products: expect.anything(),
        transactions: expect.anything(),
        webhook: expect.anything(),
      }),
    );
    expect(JSON.stringify(session)).not.toContain("access-token");
  });
});
