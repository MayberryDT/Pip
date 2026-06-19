// @ts-nocheck
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findAndroidVisibleCopyBlockers,
  findAndroidVisibleCopyBlockersInContent,
  runCheckAndroidVisibleCopy,
} from "./check-android-visible-copy.mjs";

describe("check-android-visible-copy", () => {
  it("passes the configured Android-visible copy files", () => {
    expect(findAndroidVisibleCopyBlockers()).toEqual([]);
  });

  it("fails when Android-visible copy includes pricing blockers", () => {
    expect(findAndroidVisibleCopyBlockersInContent("example.tsx", "View pricing for $2.99/week.")).toEqual([
      {
        file: "example.tsx",
        pattern: "\\$2\\.99",
      },
      {
        file: "example.tsx",
        pattern: "\\bView pricing\\b",
      },
    ]);
  });

  it("exposes a package script for Android copy verification", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["play:android-copy:verify"]).toBe(
      "node scripts/play-review/check-android-visible-copy.mjs",
    );
  });

  it("returns success for current repository copy", () => {
    expect(runCheckAndroidVisibleCopy({
      stdout: () => undefined,
      stderr: () => undefined,
    })).toBe(0);
  });
});
