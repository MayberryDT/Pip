import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

describe("MVP scope boundary", () => {
  it("does not add permanent dashboard-style user routes", () => {
    const appRouteDirs = findDirectories(join(process.cwd(), "src/app"))
      .map((dir) => relative(join(process.cwd(), "src/app"), dir))
      .filter(Boolean)
      .filter((dir) => !dir.startsWith("api/"));
    const dashboardRoutePattern =
      /(^|\/)(accounts?|balances?|budgets?|categories|dashboard|settings|transactions?)(\/|$)/i;

    expect(appRouteDirs.filter((dir) => dashboardRoutePattern.test(dir))).toEqual([]);
  });

  it("keeps background sync isolated to the feature-flagged Pip worker", () => {
    const routeDirs = findDirectories(join(process.cwd(), "src/app/api"))
      .map((dir) => relative(join(process.cwd(), "src/app/api"), dir));
    const source = findSourceFiles(join(process.cwd(), "src"))
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(routeDirs.filter((dir) => /(^|\/)sync\/(background|scheduled|cron|job)(\/|$)/i.test(dir))).toEqual([]);
    expect(source).not.toMatch(/\bsetInterval\s*\(|\bcron\s*\(|\bbackgroundSync\b/);
  });

  it("does not render permanent finance-dashboard UI primitives in components", () => {
    const componentSource = findSourceFiles(join(process.cwd(), "src/components"))
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(componentSource).not.toMatch(/<canvas\b|<table\b|\brole=["'](?:menu|tab|tablist)["']/i);
  });
});

function findDirectories(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      const stats = statSync(path);

      if (!stats.isDirectory()) {
        return [];
      }

      return [path, ...findDirectories(path)];
    })
    .sort();
}

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
