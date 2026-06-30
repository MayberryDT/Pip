import { describe, expect, it } from "vitest";
import {
  getPipAgentQualityVariantInstructions,
  resolvePipAgentQualityVariant,
} from "@/lib/agent/quality-variants";

describe("Pip agent quality variants", () => {
  it("defaults to champion when no variant is selected", () => {
    expect(resolvePipAgentQualityVariant()).toBe("champion");
  });

  it("accepts known challenger variants", () => {
    expect(resolvePipAgentQualityVariant("direct-answer")).toBe("direct-answer");
    expect(getPipAgentQualityVariantInstructions("direct-answer")).toContain("bottom line first");
  });

  it("falls back to champion for unknown variants", () => {
    expect(resolvePipAgentQualityVariant("unknown")).toBe("champion");
  });
});
