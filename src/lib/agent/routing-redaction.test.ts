import { describe, expect, it } from "vitest";
import { redactRoutingText, routingTemplateHash } from "@/lib/agent/routing-redaction";

describe("routing redaction", () => {
  it("redacts route text without keeping obvious sensitive values", () => {
    const redacted = redactRoutingText("Show $123.45 from card ending in 4242 on Jan 3");

    expect(redacted).toContain("$AMOUNT");
    expect(redacted).toContain("LAST4");
    expect(redacted).toContain("DATE");
    expect(redacted).not.toContain("123.45");
    expect(redacted).not.toContain("4242");
  });

  it("hashes redacted templates stably", () => {
    expect(routingTemplateHash("Can I spend $20?")).toBe(routingTemplateHash("Can I spend $20?"));
    expect(routingTemplateHash("Can I spend $20?")).toHaveLength(8);
  });
});
