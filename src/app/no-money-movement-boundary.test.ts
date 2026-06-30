import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

describe("no money movement boundary", () => {
  it("does not expose payment or transfer API route surfaces", () => {
    const apiRoutePaths = findSourceFiles(join(process.cwd(), "src/app/api")).map((file) =>
      relative(process.cwd(), file),
    );
    const moneyMovementRoutePattern =
      /(^|\/)(ach|bill-pay|bill_pay|card-payment|card-payments|deposit|deposits|payment|payments|payout|payouts|transfer|transfers|venmo|withdraw|withdrawal|withdrawals|zelle)(\/|$)/i;

    expect(
      apiRoutePaths.filter((filePath) => moneyMovementRoutePattern.test(filePath)),
    ).toEqual([]);
  });

  it("keeps provider integrations to read-only data and connection repair APIs", () => {
    const providerSources = findSourceFiles(join(process.cwd(), "src/lib/providers"))
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => `${relative(process.cwd(), file)}\n${readFileSync(file, "utf8")}`)
      .join("\n\n");

    const forbiddenPatterns = [
      {
        label: "Plaid Link products outside the MVP read-only data set",
        pattern: /\bProducts\.(Auth|Identity|Income|PaymentInitiation|Signal|Transfer)\b/,
      },
      {
        label: "Plaid action or processor methods",
        pattern: /\b(paymentInitiation|processor|sandboxTransfer|transfer)[A-Z]\w*\s*\(/i,
      },
      {
        label: "Teller action endpoints",
        pattern: /["'`]\/(ach|payments?|transfers?|verify|zelle)\b/i,
      },
    ];

    for (const { label, pattern } of forbiddenPatterns) {
      expect(providerSources, label).not.toMatch(pattern);
    }
  });

  it("does not install money-movement dependencies beyond Stripe billing", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });

    const allowedBillingDependencies = new Set(["stripe"]);

    expect(
      dependencyNames.filter(
        (name) =>
          !allowedBillingDependencies.has(name) &&
          /stripe|dwolla|paypal|adyen|checkout|square|venmo/i.test(name),
      ),
    ).toEqual([]);
  });
});

function findSourceFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        return findSourceFiles(path);
      }

      if (!/\.(ts|tsx)$/.test(path)) {
        return [];
      }

      return [path];
    })
    .sort();
}
