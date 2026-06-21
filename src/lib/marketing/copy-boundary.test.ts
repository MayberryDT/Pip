import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const copyTargets = [
  "content/articles",
  "public/llms.txt",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/pricing/page.tsx",
  "src/components/PipHome.tsx",
  "src/components/auth/LoginPanel.tsx",
  "src/components/marketing/PricingCards.tsx",
  "src/components/marketing/PricingPageContent.tsx",
  "src/lib/agent/ai-agent.ts",
  "src/lib/marketing/pricing.ts",
  "src/lib/marketing/site.ts",
  "src/lib/trust/pip-trust-policy.ts",
] as const;

const forbiddenPatterns = [
  /\$2\.99\/week/i,
  /\bweekly pricing\b/i,
  /\bweekly plan\b/i,
  /\bpipPricing\.weekly\b/i,
  /\bactually okay to use today\b/i,
  /\bokay to use today\b/i,
  /\bokay to spend today\b/i,
  /\bYes\. You still\b/i,
  /\bsafe to spend\b/i,
] as const;

describe("public copy boundaries", () => {
  it("keeps production copy monthly-only and decision-support safe", () => {
    const matches = copyTargets.flatMap((target) =>
      readTarget(join(process.cwd(), target)).flatMap((filePath) => {
        if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) {
          return [];
        }

        const source = readFileSync(filePath, "utf8");

        return forbiddenPatterns.flatMap((pattern) => {
          const match = source.match(pattern);

          return match ? [`${filePath}: ${match[0]}`] : [];
        });
      }),
    );

    expect(matches).toEqual([]);
  });
});

function readTarget(path: string): string[] {
  const stat = statSync(path);

  if (stat.isDirectory()) {
    return findFiles(path);
  }

  return [path];
}

function findFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const stat = statSync(childPath);

    if (stat.isDirectory()) {
      return findFiles(childPath);
    }

    return /\.(md|txt|ts|tsx)$/.test(childPath) ? [childPath] : [];
  });
}
