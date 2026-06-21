export const marketingSite = {
  name: "Pip",
  defaultTitle: "Pip - Before you spend, check one number",
  defaultDescription:
    "Pip is a paid daily money companion that shows Spendable Cash Today, one calm number before you spend. Plans start at $2.99/week.",
  domain: "spendwithpip.com",
  supportEmail: "tyler@animasai.co",
  appPath: "/app",
};

export const publicMarketingPages = [
  {
    path: "/",
    label: "Home",
    description: "Meet Pip and learn the daily number your bank will not show you.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/how-it-works",
    label: "How it works",
    description: "See how Pip turns account data into Spendable Cash Today.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/how-the-number-works",
    label: "How the number works",
    description: "See the inputs, limits, and receipt behind Spendable Cash Today.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/pricing",
    label: "Pricing",
    description: "See Pip weekly and monthly pricing.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/security",
    label: "Security",
    description: "Read the trust boundaries for account connection, data, and money movement.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/blog",
    label: "Blog",
    description: "Product-led articles about bank balances, no-budget spending, and daily money habits.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/support",
    label: "Support",
    description: "Get support for connection, app access, account data, and deletion questions.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/privacy",
    label: "Privacy",
    description: "Review what Pip stores and how data deletion works.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/terms",
    label: "Terms",
    description: "Review Pip terms, product boundaries, subscription context, and no-money-movement limits.",
    updatedAt: "2026-06-11",
  },
  {
    path: "/delete-account",
    label: "Delete account",
    description: "Request deletion of your Pip account and associated app data.",
    updatedAt: "2026-06-11",
  },
] as const;

export function getMarketingOrigin(env: Record<string, string | undefined> = process.env): string {
  const configured = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL);

  if (configured) {
    return configured;
  }

  return `https://${marketingSite.domain}`;
}

export function getCanonicalUrl(path: string, env: Record<string, string | undefined> = process.env): string {
  return new URL(path, getMarketingOrigin(env)).toString();
}

function normalizeOrigin(rawUrl: string | undefined): string | null {
  if (!rawUrl?.trim()) {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  const urlWithProtocol =
    trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
      ? trimmedUrl
      : `https://${trimmedUrl}`;

  try {
    return new URL(urlWithProtocol).origin;
  } catch {
    return null;
  }
}
