import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BillingPortalActionButton,
  openBillingPortal,
} from "@/components/billing/BillingPortalAction";

describe("BillingPortalActionButton", () => {
  it("renders a hosted billing portal action", () => {
    const markup = renderToStaticMarkup(
      <BillingPortalActionButton
        action={{ label: "Open billing", endpoint: "/api/billing/portal" }}
      />,
    );

    expect(markup).toContain("Open billing");
  });

  it("opens the hosted Stripe billing portal", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        url: "https://billing.stripe.test/session",
      }),
    });
    const assign = vi.fn();

    await openBillingPortal({ endpoint: "/api/billing/portal", fetcher, assign });

    expect(fetcher).toHaveBeenCalledWith("/api/billing/portal", {
      method: "POST",
    });
    expect(assign).toHaveBeenCalledWith("https://billing.stripe.test/session");
  });
});
