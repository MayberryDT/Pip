// @ts-nocheck
import { describe, expect, it } from "vitest";
import {
  durableReviewerStaleAfter,
  evaluateReviewerReadiness,
} from "./play-review-lib.mjs";

describe("verify-reviewer-account readiness", () => {
  it("passes durable manual-only seeded reviewer data", () => {
    expect(evaluateReviewerReadiness({
      settings: {
        manual_refresh_only: true,
      },
      appAccessGrant: {
        status: "active",
        normalized_email: "play-review@animasai.co",
      },
      institutions: [
        {
          id: "institution-1",
          institution_name: "Play Review Bank",
          status: "connected",
          last_successful_sync_at: "2026-06-18T12:00:00.000Z",
          stale_after: durableReviewerStaleAfter,
        },
      ],
    }, {
      now: new Date("2026-06-20T12:00:00.000Z"),
    })).toEqual([]);
  });

  it("fails when reviewer data can auto-refresh or is already stale", () => {
    expect(evaluateReviewerReadiness({
      settings: {
        manual_refresh_only: false,
      },
      appAccessGrant: {
        status: "active",
        normalized_email: "play-review@animasai.co",
      },
      institutions: [
        {
          id: "institution-1",
          institution_name: "Play Review Bank",
          status: "connected",
          last_successful_sync_at: "2026-06-18T12:00:00.000Z",
          stale_after: "2026-06-19T12:00:00.000Z",
        },
      ],
    }, {
      now: new Date("2026-06-20T12:00:00.000Z"),
    })).toEqual([
      "Reviewer account must have manual_refresh_only=true.",
      "Reviewer institution Play Review Bank is already stale.",
    ]);
  });

  it("fails when reviewer institutions are broken", () => {
    expect(evaluateReviewerReadiness({
      settings: {
        manual_refresh_only: true,
      },
      appAccessGrant: {
        status: "active",
        normalized_email: "play-review@animasai.co",
      },
      institutions: [
        {
          id: "institution-1",
          institution_name: "Play Review Bank",
          status: "failed",
          last_successful_sync_at: null,
          stale_after: null,
        },
      ],
    })).toEqual([
      "Reviewer institution Play Review Bank has status failed.",
      "Reviewer institution Play Review Bank is missing last_successful_sync_at.",
    ]);
  });

  it("fails when reviewer app access is missing or revoked", () => {
    const readyData = {
      settings: {
        manual_refresh_only: true,
      },
      institutions: [
        {
          id: "institution-1",
          institution_name: "Play Review Bank",
          status: "connected",
          last_successful_sync_at: "2026-06-18T12:00:00.000Z",
          stale_after: durableReviewerStaleAfter,
        },
      ],
    };

    expect(evaluateReviewerReadiness({
      ...readyData,
      appAccessGrant: null,
    })).toEqual([
      "Reviewer account is missing an active app access grant.",
    ]);

    expect(evaluateReviewerReadiness({
      ...readyData,
      appAccessGrant: {
        status: "revoked",
        normalized_email: "play-review@animasai.co",
      },
    })).toEqual([
      "Reviewer account is missing an active app access grant.",
    ]);
  });
});
