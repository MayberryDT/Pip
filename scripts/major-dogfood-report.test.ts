import { describe, expect, it } from "vitest";
import {
  validateBrowserEvidence,
  validateEvalReport,
  validateManifest,
  validateProductionRedaction,
} from "./major-dogfood-report.mjs";

describe("major dogfood report validation", () => {
  it("rejects browser evidence that is not from the in-app Browser iab backend", () => {
    const result = validateBrowserEvidence(
      {
        validatedBy: "standalone_playwright",
        backend: "chromium",
        viewports: [],
      },
      { requiredCapabilityIds: ["guest_start"] },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("browser evidence must be validatedBy codex_in_app_browser");
    expect(result.failures).toContain("browser evidence backend must be iab");
  });

  it("accepts complete in-app Browser evidence", () => {
    const result = validateBrowserEvidence(
      {
        validatedBy: "codex_in_app_browser",
        backend: "iab",
        viewports: [
          {
            name: "mobile",
            passed: true,
            consoleErrors: [],
            networkFailures: [],
            checkedCapabilities: ["guest_start", "spendable_explanation"],
          },
          {
            name: "desktop",
            passed: true,
            consoleErrors: [],
            networkFailures: [],
            checkedCapabilities: ["guest_start", "spendable_explanation"],
          },
        ],
      },
      { requiredCapabilityIds: ["guest_start", "spendable_explanation"] },
    );

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects incomplete viewport evidence", () => {
    const result = validateBrowserEvidence(
      {
        validatedBy: "codex_in_app_browser",
        backend: "iab",
        viewports: [
          {
            name: "mobile",
            passed: true,
            consoleErrors: ["ReferenceError: broken"],
            networkFailures: [],
            checkedCapabilities: ["guest_start"],
          },
        ],
      },
      { requiredCapabilityIds: ["guest_start", "spendable_explanation"] },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("browser evidence missing desktop viewport");
    expect(result.failures).toContain("mobile viewport has console errors");
    expect(result.failures).toContain("mobile viewport missing capability spendable_explanation");
  });

  it("validates eval report suite, status, and selected case ids", () => {
    const result = validateEvalReport(
      {
        status: "passed",
        suite: "major-capabilities-expanded",
        failureCount: 0,
        cases: [{ id: "case-1" }, { id: "case-2" }],
      },
      {
        suite: "major-capabilities-expanded",
        expectedCaseIds: ["case-1", "case-2"],
      },
    );

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects production-safe reports with raw or unredacted content", () => {
    const result = validateProductionRedaction({
      suite: "major-capabilities-production-safe",
      cases: [
        {
          inputMessage: "Can Pip move my money?",
          responseMessage: "I checked that safely.",
          rawResponse: { message: "I checked that safely." },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("production-safe report contains unredacted inputMessage for case 0");
    expect(result.failures).toContain("production-safe report contains rawResponse for case 0");
  });

  it("accepts production-safe redacted reports", () => {
    const result = validateProductionRedaction({
      suite: "major-capabilities-production-safe",
      cases: [
        {
          inputMessage: "[redacted]",
          responseMessage: "[redacted]",
          message: "[redacted]",
          responseSearchText: "[redacted]",
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects a passed manifest with unresolved failures", () => {
    const result = validateManifest({
      status: "passed",
      tiers: [{ name: "api-primary", status: 0 }],
      failureRecords: [{ caseId: "major-forecast", rootCause: "router missed trend wording" }],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("failure major-forecast missing affected rerun evidence");
    expect(result.failures).toContain("failure major-forecast missing final complete rerun evidence");
  });

  it("accepts a complete manifest with affected rerun and final rerun records", () => {
    const result = validateManifest({
      status: "passed",
      tiers: [
        { name: "api-primary", status: 0 },
        { name: "browser-iab", status: 0 },
      ],
      failureRecords: [
        {
          caseId: "major-forecast",
          rootCause: "router missed trend wording",
          affectedRerun: { status: "passed", reportPath: "/tmp/affected.json" },
          finalRerun: { status: "passed", manifestPath: "/tmp/final-manifest.json" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
