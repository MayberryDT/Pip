import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase browser boundary", () => {
  it("does not reference the service-role key in the browser client module", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/supabase/client.ts"), "utf8");

    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("getSupabaseServiceRoleKey");
  });

  it("does not reference provider secrets or credential stores in any client module", () => {
    const clientFiles = findClientFiles(join(process.cwd(), "src"));
    const disallowedTokens = [
      "TELLER_CERTIFICATE_PEM",
      "TELLER_PRIVATE_KEY_PEM",
      "PLAID_SECRET",
      "PLAID_SANDBOX_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
      "FREE_CASH_PROVIDER_TOKEN_KEY_BASE64",
      "provider_credentials",
      "credential-store",
      "token-crypto",
      "createPlaidClient",
      "TellerHttpClient",
    ];

    expect(clientFiles).toEqual(
      expect.arrayContaining([
        join(process.cwd(), "src/components/FreeCashHome.tsx"),
        join(process.cwd(), "src/lib/supabase/client.ts"),
      ]),
    );

    for (const file of clientFiles) {
      const source = readFileSync(file, "utf8");

      for (const token of disallowedTokens) {
        expect(source, `${file} should not contain ${token}`).not.toContain(token);
      }
    }
  });

  it("keeps long-lived provider token handling out of the Spendable browser surface", () => {
    const source = readFileSync(join(process.cwd(), "src/components/FreeCashHome.tsx"), "utf8");

    expect(source).not.toContain("TellerConnect");
    expect(source).not.toContain("accessToken");
    expect(source).not.toContain("access_token");
    expect(source).not.toContain("/api/providers/teller/enrollment");
    expect(source).toContain("/api/providers/plaid/exchange");
  });
});

function findClientFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return findClientFiles(path);
      }

      if (!/\.(ts|tsx)$/.test(path)) {
        return [];
      }

      const source = readFileSync(path, "utf8");

      return /^["']use client["'];/.test(source) ? [path] : [];
    })
    .sort();
}
