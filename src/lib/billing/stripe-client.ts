import Stripe from "stripe";
import { getBillingConfig, type BillingConfig } from "@/lib/billing/stripe-config";

export function createStripeClient(config: BillingConfig = getBillingConfig()): Stripe {
  if (config.mode === "off") {
    throw new Error("Stripe billing is off.");
  }

  return new Stripe(config.secretKey, {
    appInfo: {
      name: "Pip",
      version: "0.1.0",
    },
    typescript: true,
  });
}
