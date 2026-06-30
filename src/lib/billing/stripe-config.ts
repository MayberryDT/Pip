export class StripeBillingConfigError extends Error {
  constructor(message = "Stripe billing is not configured.") {
    super(message);
    this.name = "StripeBillingConfigError";
  }
}

export type BillingMode = "off" | "test" | "live";

export type BillingConfig =
  | { mode: "off" }
  | {
      mode: "test" | "live";
      secretKey: string;
      webhookSecret: string;
      monthlyPriceId: string;
    };

export function isBillingConfigured(env: Record<string, string | undefined> = process.env) {
  return env.PIP_BILLING_MODE === "test" || env.PIP_BILLING_MODE === "live";
}

export function getBillingConfig(env: Record<string, string | undefined> = process.env): BillingConfig {
  const mode = parseBillingMode(env.PIP_BILLING_MODE);

  if (mode === "off") {
    return { mode };
  }

  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const monthlyPriceId = env.STRIPE_PRICE_MONTHLY?.trim();

  if (!secretKey || !webhookSecret || !monthlyPriceId) {
    throw new StripeBillingConfigError(
      "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_MONTHLY when PIP_BILLING_MODE is test or live.",
    );
  }

  return {
    mode,
    secretKey,
    webhookSecret,
    monthlyPriceId,
  };
}

function parseBillingMode(value: string | undefined): BillingMode {
  if (value === "test" || value === "live") {
    return value;
  }

  return "off";
}
