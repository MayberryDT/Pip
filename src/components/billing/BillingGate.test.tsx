import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingGate, startBillingCheckout } from "@/components/billing/BillingGate";

describe("BillingGate", () => {
  it("renders a Stripe checkout CTA without rendering the app", () => {
    const markup = renderToStaticMarkup(<BillingGate email="tester@example.com" />);

    expect(markup).toContain("tester@example.com");
    expect(markup).toContain("Subscribe with Stripe");
    expect(markup).toContain("Sign out");
    expect(markup).not.toContain("data-testid=\"agent-thread\"");
  });

  it("starts Stripe checkout and redirects to the hosted session", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        url: "https://checkout.stripe.test/session",
      }),
    });
    const assign = vi.fn();

    await startBillingCheckout({ fetcher, assign });

    expect(fetcher).toHaveBeenCalledWith("/api/billing/checkout", {
      method: "POST",
    });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
  });

  it("throws when checkout creation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Billing is not enabled." }),
    });

    await expect(startBillingCheckout({ fetcher })).rejects.toThrow("Billing is not enabled.");
  });
});
