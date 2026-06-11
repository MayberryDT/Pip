import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const scannedPaths = [
  "src/app",
  "src/components",
  "src/lib/agent",
  "README.md",
  "public",
];

const bannedPublicPhrases = [
  /\bFree Cash Today\b/,
  /\bFree Cash\b/,
  /\bPIP Cash Today\b/,
  /\bPIP cash\b/,
  /\bMy Margin\b/,
  /\bMargin Today\b/,
];

describe("Pip rebrand boundary", () => {
  it("keeps old product names out of user-facing source and docs", () => {
    const matches = scannedPaths
      .filter((path) => existsSync(join(process.cwd(), path)))
      .flatMap((path) => findFiles(join(process.cwd(), path)))
      .filter((path) => isScannedFile(path))
      .flatMap((path) => findBannedPhraseMatches(path));

    expect(matches).toEqual([]);
  });
});

function findFiles(path: string): string[] {
  const stat = statSync(path);

  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => findFiles(join(path, entry)));
}

function isScannedFile(path: string): boolean {
  if (/\.(png|jpg|jpeg|webp|ico)$/.test(path)) {
    return false;
  }

  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path)) {
    return false;
  }

  return /\.(ts|tsx|js|jsx|css|html|md)$/.test(path);
}

function findBannedPhraseMatches(path: string): string[] {
  const source = readFileSync(path, "utf8");

  return bannedPublicPhrases.flatMap((pattern) => {
    const match = source.match(pattern);

    return match
      ? [`${relative(process.cwd(), path)}: ${match[0]}`]
      : [];
  });
}
