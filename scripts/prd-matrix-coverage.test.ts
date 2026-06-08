import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PRD requirement matrix coverage", () => {
  it("covers every numbered PRD story in the requirement matrix", () => {
    const prd = readFileSync(join(process.cwd(), "prd.md"), "utf8");
    const storyNumbers = Array.from(prd.matchAll(/^(\d+)\. As /gm), (match) =>
      Number(match[1]),
    );
    const matrix = extractMatrix(prd);
    const matrixStoryNumbers = new Set(
      Array.from(matrix.matchAll(/Stories ([^|]+)/g)).flatMap((match) =>
        expandStoryList(match[1]),
      ),
    );
    const missing = storyNumbers.filter((story) => !matrixStoryNumbers.has(story));
    const unknown = Array.from(matrixStoryNumbers)
      .filter((story) => !storyNumbers.includes(story))
      .sort((a, b) => a - b);

    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });
});

function extractMatrix(prd: string) {
  const start = prd.indexOf("## Requirement Matrix Snapshot");
  const end = prd.indexOf("\n- Done:", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return prd.slice(start, end);
}

function expandStoryList(value: string) {
  return value
    .split(";")[0]
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim();
      const range = trimmed.match(/^(\d+)-(\d+)$/);

      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);

        return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
      }

      const single = trimmed.match(/^(\d+)$/);

      return single ? [Number(single[1])] : [];
    });
}
