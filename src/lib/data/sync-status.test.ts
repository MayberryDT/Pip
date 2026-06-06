import { describe, expect, it } from "vitest";
import { isInstitutionStale } from "@/lib/data/sync-status";

describe("institution stale-state detection", () => {
  it("marks an institution stale after the stale timestamp", () => {
    expect(
      isInstitutionStale(
        {
          status: "connected",
          stale_after: "2026-06-05T12:00:00.000Z",
        },
        new Date("2026-06-05T12:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("keeps fresh institutions fresh before the stale timestamp", () => {
    expect(
      isInstitutionStale(
        {
          status: "mocked",
          stale_after: "2026-06-05T12:01:00.000Z",
        },
        new Date("2026-06-05T12:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("treats failed provider status as stale even without a timestamp", () => {
    expect(
      isInstitutionStale({
        status: "failed",
        stale_after: null,
      }),
    ).toBe(true);
  });
});
