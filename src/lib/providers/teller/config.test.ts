import { describe, expect, it } from "vitest";
import { createTellerConnectSession, getTellerConfig, getTellerReadiness } from "@/lib/providers/teller/config";

describe("Teller config", () => {
  it("returns an unavailable connect session until an application id is configured", () => {
    expect(createTellerConnectSession(getTellerConfig({})).status).toBe("unavailable");
  });

  it("returns only client-safe Connect configuration when ready", () => {
    const session = createTellerConnectSession(
      getTellerConfig({
        TELLER_APPLICATION_ID: "app_test",
        TELLER_ENVIRONMENT: "development",
        TELLER_PRODUCTS: "transactions,balance",
        TELLER_CERTIFICATE_PEM: "secret-cert",
        TELLER_PRIVATE_KEY_PEM: "secret-key",
      }),
    );

    expect(session).toMatchObject({
      provider: "teller",
      status: "ready",
      connect: {
        applicationId: "app_test",
        environment: "development",
        products: ["transactions", "balance"],
      },
    });
    expect(JSON.stringify(session)).not.toContain("secret-cert");
    expect(JSON.stringify(session)).not.toContain("secret-key");
  });

  it("keeps Connect products limited to read-only data access", () => {
    const config = getTellerConfig({
      TELLER_APPLICATION_ID: "app_test",
      TELLER_PRODUCTS: "Transactions,balance,verify,payments,transfers",
    });

    expect(config.products).toEqual(["transactions", "balance"]);
  });

  it("reports mTLS API readiness separately from Connect readiness", () => {
    expect(
      getTellerReadiness(
        getTellerConfig({
          TELLER_APPLICATION_ID: "app_test",
          TELLER_CERTIFICATE_PEM: "cert",
          TELLER_PRIVATE_KEY_PEM: "key",
          PIP_PROVIDER_TOKEN_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
        }),
      ),
    ).toMatchObject({
      canCreateConnectSession: true,
      canCallApi: true,
    });
  });
});
