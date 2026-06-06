import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Free Cash deep-module boundary", () => {
  it("keeps deterministic money math isolated from providers, routes, databases, and AI", () => {
    const moduleFiles = findSourceFiles(join(process.cwd(), "src/lib/free-cash"));

    expect(moduleFiles.length).toBeGreaterThan(0);

    for (const file of moduleFiles) {
      const source = readFileSync(file, "utf8");

      expect(source, `${file} should not import provider code`).not.toMatch(
        /@\/lib\/providers|@\/lib\/supabase|@\/app\/api|@\/lib\/agent|openai|plaid|teller/i,
      );
      expect(source, `${file} should not touch browser or server runtimes`).not.toMatch(
        /\bfetch\(|process\.env|NextResponse|cookies\(|headers\(/,
      );
    }
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

      if (!path.endsWith(".ts") || path.endsWith(".test.ts")) {
        return [];
      }

      return [path];
    })
    .sort();
}
