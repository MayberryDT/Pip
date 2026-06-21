import { CheckCircle2 } from "lucide-react";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";
import { getProductAccessHref, productAccess } from "@/lib/marketing/product-access";
import {
  pipPaidTrustLine,
  pipPricingIncludedFeatures,
  pipPricingPlans,
  pipSubscriptionCaveat,
} from "@/lib/marketing/pricing";

export function PricingCards({
  ctaHref = getProductAccessHref(),
  eventSource = "pricing_cards",
  showIncluded = false,
}: {
  ctaHref?: string;
  eventSource?: string;
  showIncluded?: boolean;
}) {
  return (
    <div>
      <div className="grid gap-4">
        {pipPricingPlans.map((plan) => (
          <article
            className="pricing-plan-card relative flex min-h-[19rem] flex-col p-6 text-ink"
            key={plan.id}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-moss">{plan.label}</p>
            <div aria-label={plan.displayPrice} className="mt-5 flex items-end gap-2">
              <p className="swiss-price text-ink">
                {plan.price}
              </p>
              <p className="pb-1 text-base font-bold text-ink/58">/{plan.period}</p>
            </div>
            <h3 className="mt-5 text-xl font-bold text-ink">{plan.tagline}</h3>
            <p className="mt-2 text-sm leading-6 text-ink/66">{plan.description}</p>
            <MarketingCtaLink
              className="focus-ring mt-auto inline-flex min-h-11 w-fit items-center justify-center bg-ink px-5 text-sm font-bold text-porcelain transition hover:bg-moss"
              eventLabel={`${eventSource}_${plan.id}`}
              eventProperties={{
                intent: "get_pip",
                selected_plan: plan.id,
                price: plan.price,
                period: plan.period,
              }}
              href={ctaHref}
            >
              {productAccess.shortLabel}
            </MarketingCtaLink>
          </article>
        ))}
      </div>

      {showIncluded ? (
        <div className="pricing-included-panel mt-5 bg-porcelain p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-moss">Included</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {pipPricingIncludedFeatures.map((feature) => (
              <div className="flex gap-2 text-sm font-semibold leading-6 text-ink/72" key={feature}>
                <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-moss" size={17} />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pricing-trust-panel mt-5 bg-porcelain p-4">
        <p className="text-sm font-semibold leading-6 text-ink/62">
          {pipPaidTrustLine} No ads. No selling your financial data. Read-only account connection.
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-ink/50">{pipSubscriptionCaveat}</p>
      </div>
    </div>
  );
}
