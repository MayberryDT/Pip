import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSavingsGoalsClientEnabled,
  isSavingsGoalsEnabled,
} from "@/lib/savings-goals/feature-flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("savings goal feature flags", () => {
  it("keeps savings goals on by default", () => {
    vi.stubEnv("PIP_SAVINGS_GOALS_ENABLED", undefined);
    vi.stubEnv("NEXT_PUBLIC_SAVINGS_GOALS_ENABLED", undefined);

    expect(isSavingsGoalsEnabled()).toBe(true);
    expect(isSavingsGoalsClientEnabled()).toBe(true);
  });

  it("allows an explicit false value to disable savings goals", () => {
    vi.stubEnv("PIP_SAVINGS_GOALS_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_SAVINGS_GOALS_ENABLED", "false");

    expect(isSavingsGoalsEnabled()).toBe(false);
    expect(isSavingsGoalsClientEnabled()).toBe(false);
  });
});
