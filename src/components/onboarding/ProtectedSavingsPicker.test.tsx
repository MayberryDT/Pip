import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ProtectedSavingsPicker,
  __protectedSavingsPickerTestHooks,
} from "@/components/onboarding/ProtectedSavingsPicker";

describe("ProtectedSavingsPicker", () => {
  it("renders the friendly savings cushion controls", () => {
    const markup = renderToStaticMarkup(<ProtectedSavingsPicker onSave={async () => undefined} />);

    expect(markup).toContain("Savings cushion");
    expect(markup).toContain("$100");
    expect(markup).toContain("$200");
    expect(markup).toContain("Recommended");
    expect(markup).toContain("$250");
    expect(markup).toContain("$500");
    expect(markup).toContain("Custom amount");
    expect(markup).toContain("Use $200 cushion");
    expect(markup).toContain("You can change this later.");
  });

  it("sanitizes custom dollar amounts before saving", () => {
    expect(__protectedSavingsPickerTestHooks.sanitizeDollarText("$2,500abc")).toBe("2500");
    expect(__protectedSavingsPickerTestHooks.centsFromDollarText("$2,500abc")).toBe(250000);
    expect(__protectedSavingsPickerTestHooks.formatCushionAmount(250000)).toBe("$2,500");
  });
});
