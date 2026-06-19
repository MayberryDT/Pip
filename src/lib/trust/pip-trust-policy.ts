import { marketingSite } from "@/lib/marketing/site";
import { pipPricing } from "@/lib/marketing/pricing";
import type { PipPlatform } from "@/lib/platform/android-shell";

export const pipTrustPolicy = {
  effectiveDate: "June 18, 2026",
  revisionDate: "June 18, 2026",
  supportEmail: marketingSite.supportEmail,
  legalOperatorLabel: "Pip / Animas AI support",
  bankDataProvider: {
    name: "Plaid",
    role: "Read-only account connection for balances, transactions, and account metadata.",
  },
  aiProvider: {
    label: "OpenAI-compatible model endpoints through Netlify AI Gateway or OpenAI direct",
    role: "Conversation, explanation, and answer quality support. AI does not own the Spendable Cash Today calculation.",
  },
  processors: [
    {
      name: "Supabase",
      role: "Authentication, database, storage of app rows, row-level security, and server-side account deletion support.",
    },
    {
      name: "Netlify",
      role: "Hosting, serverless functions, request routing, request logs, and deployment infrastructure.",
    },
    {
      name: "Plaid",
      role: "Read-only financial account connection, balances, transactions, account metadata, and connection state.",
    },
    {
      name: "OpenAI or Netlify AI Gateway",
      role: "AI answer generation, explanation support, and assistant quality handling for prompts and selected context.",
    },
  ],
  pricing: {
    weekly: pipPricing.weekly.displayPrice,
    monthly: pipPricing.monthly.displayPrice,
    weeklyAnnualized: "$155.48/year",
    monthlyAnnualized: "$95.88/year",
  },
  productBoundaries: [
    "Pip is decision support, not a bank, broker, lender, credit counselor, tax advisor, or financial advisor.",
    "Spendable Cash Today is an estimate from connected data and product settings, not a promise that a purchase will fit every future obligation.",
    "Pending, missing, stale, disconnected, cash, shared, or manually paid activity can change the number.",
  ],
  securityBoundaries: [
    "Financial connections are read-only.",
    "Pip cannot move, withdraw, transfer, invest, borrow, or pay money from a connected account.",
    "Bank usernames and passwords are not stored by Pip.",
    "Provider access tokens stay server-side and are not sent to the browser.",
    "Pip does not publicly claim SOC 2, a third-party penetration test, or an independent security audit yet.",
  ],
  privacyBoundaries: [
    "Pip stores email address, Supabase user ID, normalized financial data, account metadata, sync logs, settings, AI conversation context, reports, tester feedback, product events, request metadata, and diagnostics needed to run the app.",
    "Raw provider payload storage is intended to stay minimal, with normalized records used for the product surface.",
    "Pip does not sell financial data and does not run an advertising model.",
    "Pip does not intentionally train a Pip-owned AI model on user financial records.",
    "Third-party AI handling depends on the deployed model provider and gateway terms.",
  ],
  deletionSummary:
    "Deletion removes account and financial rows, balances, transactions, sync logs, settings, reports, feedback, chat context, product events, and provider tokens, while limited records may be retained for fraud prevention, security, tax, accounting, or legal obligations.",
  subscriptionSummary:
    "Subscriptions are managed where they start or install. Cancel through that platform before renewal; email support for access or billing mismatch questions.",
  calculationSummary:
    "Spendable Cash Today starts from connected balances and transactions, subtracts recurring obligations and monthly savings, accounts for pending committed spend, adjusts for recent spending pace, and caps the result against available cash.",
  publicLinks: {
    howNumberWorks: "/how-the-number-works",
    security: "/security",
    privacy: "/privacy",
    terms: "/terms",
    support: "/support",
    deleteAccount: "/delete-account",
    pricing: "/pricing",
  },
} as const;

export type PipTrustPolicy = typeof pipTrustPolicy;

export type TrustPolicyAnswer = {
  category:
    | "ai"
    | "calculation"
    | "connection"
    | "deletion"
    | "pricing"
    | "privacy"
    | "security"
    | "terms";
  message: string;
  linkLabel: string;
  href: string;
};

export function composeTrustPolicyAnswer(
  message: string,
  options: {
    platform?: PipPlatform;
  } = {},
): TrustPolicyAnswer {
  const normalized = message.toLowerCase();

  if (/\b(ai|model|chatgpt|openai|train|training|learn from|llm)\b/.test(normalized)) {
    return {
      category: "ai",
      message:
        "I use AI for explanations and answers. The Spendable Cash Today calculation is product math, not model output, and I do not intentionally train a Pip-owned model on your financial records.",
      linkLabel: "AI and privacy details",
      href: pipTrustPolicy.publicLinks.privacy,
    };
  }

  if (/\b(move (?:my |our |your )?money|transfer|withdraw|payment|pay bills?|send money|take money|debit)\b/.test(normalized)) {
    return {
      category: "security",
      message: "I cannot move money. Connected accounts are read-only, and provider tokens stay server-side.",
      linkLabel: "Security details",
      href: pipTrustPolicy.publicLinks.security,
    };
  }

  if (/\b(plaid|provider|bank data|aggregation|aggregator|connect accounts?|credentials?|passwords?|tokens?)\b/.test(normalized)) {
    return {
      category: "connection",
      message:
        "I connect account data through Plaid in read-only mode. I do not store bank usernames or passwords.",
      linkLabel: "Connection details",
      href: pipTrustPolicy.publicLinks.security,
    };
  }

  if (/\b(delete|deletion|erase|remove my data|close account)\b/.test(normalized)) {
    return {
      category: "deletion",
      message:
        "You can request deletion. I remove app and financial rows, with limited records kept only when needed for fraud, security, tax, accounting, or legal reasons.",
      linkLabel: "Deletion details",
      href: pipTrustPolicy.publicLinks.deleteAccount,
    };
  }

  if (/\b(price|pricing|cost|subscription|weekly|monthly|refund|trial|cancel)\b/.test(normalized)) {
    if (options.platform === "android_webview" || /\bandroid\b/.test(normalized)) {
      return {
        category: "pricing",
        message: "Purchases and subscriptions are not available in this Android build.",
        linkLabel: "Support details",
        href: pipTrustPolicy.publicLinks.support,
      };
    }

    return {
      category: "pricing",
      message:
        `Pip lists ${pipTrustPolicy.pricing.weekly} and ${pipTrustPolicy.pricing.monthly}. Subscriptions are managed where they start or install.`,
      linkLabel: "Pricing details",
      href: pipTrustPolicy.publicLinks.pricing,
    };
  }

  if (/\b(privacy|sell data|advertis|data sale|subprocessor|retain|retention)\b/.test(normalized)) {
    return {
      category: "privacy",
      message:
        "I do not sell financial data or use an ad model. I store the financial context needed to calculate, explain, sync, support, and improve Pip.",
      linkLabel: "Privacy details",
      href: pipTrustPolicy.publicLinks.privacy,
    };
  }

  if (/\b(guarantee|financial advice|advisor|legal|terms|liability|promise)\b/.test(normalized)) {
    return {
      category: "terms",
      message:
        "I am decision support, not financial advice. Missing, pending, stale, or disconnected data can change the number.",
      linkLabel: "Terms details",
      href: pipTrustPolicy.publicLinks.terms,
    };
  }

  return {
    category: "calculation",
    message:
      "I calculate the number from connected data, monthly savings, likely commitments, recent spending pace, pending spend, and cash reality.",
    linkLabel: "How the number works",
    href: pipTrustPolicy.publicLinks.howNumberWorks,
  };
}
