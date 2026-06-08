import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePaths = [
  "src/app",
  "src/components",
  "src/lib/agent",
];

describe("Free Cash language boundary", () => {
  it("does not use safe-to-spend wording in app source", () => {
    const matches = sourcePaths.flatMap((path) => {
      return findSourceFiles(join(process.cwd(), path))
        .filter((filePath) => !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"))
        .flatMap((filePath) => {
          const source = readFileSync(filePath, "utf8");
          const match = source.match(/\bsafe to spend\b|\bwhat is safe\b|\bsafely spend\b/i);

          return match ? [`${filePath}: ${match[0]}`] : [];
        });
    });

    expect(matches).toEqual([]);
  });

  it("does not point users to a separate data control surface", () => {
    const matches = sourcePaths.flatMap((path) => {
      return findSourceFiles(join(process.cwd(), path))
        .filter((filePath) => !filePath.endsWith(".test.ts") && !filePath.endsWith(".test.tsx"))
        .flatMap((filePath) => {
          const source = readFileSync(filePath, "utf8");
          const match = source.match(/\bdata control\b/i);

          return match ? [`${filePath}: ${match[0]}`] : [];
        });
    });

    expect(matches).toEqual([]);
  });
});

function findSourceFiles(path: string): string[] {
  const entries = readdirSync(path);

  return entries.flatMap((entry) => {
    const childPath = join(path, entry);
    const stat = statSync(childPath);

    if (stat.isDirectory()) {
      return findSourceFiles(childPath);
    }

    return /\.(ts|tsx)$/.test(childPath) ? [childPath] : [];
  });
}
