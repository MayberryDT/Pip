export const marketingSite = {
  name: "Pip",
  defaultTitle: "Pip - Before you spend, check one number",
  defaultDescription:
    "Pip is a paid daily money companion that shows Spendable Cash Today, one calm number before you spend. One monthly subscription costs $7.99/month.",
  domain: "spendwithpip.com",
  supportEmail: "tyler@animasai.co",
  appPath: "/app",
};

export const publicMarketingPages = [
  {
    path: "/",
    label: "Home",
    description: "Meet Pip and learn the daily number your bank will not show you.",
  },
  {
    path: "/how-it-works",
    label: "How it works",
    description: "See how Pip turns account data into Spendable Cash Today.",
  },
  {
    path: "/how-the-number-works",
    label: "How the number works",
    description: "See the inputs, limits, and receipt behind Spendable Cash Today.",
  },
  {
    path: "/pricing",
    label: "Pricing",
    description: "See Pip's single monthly price.",
  },
  {
    path: "/security",
    label: "Security",
    description: "Read the trust boundaries for account connection, data, and money movement.",
  },
  {
    path: "/blog",
    label: "Blog",
    description: "Product-led articles about bank balances, no-budget spending, and daily money habits.",
  },
  {
    path: "/support",
    label: "Support",
    description: "Get support for connection, app access, account data, and deletion questions.",
  },
  {
    path: "/privacy",
    label: "Privacy",
    description: "Review what Pip stores and how data deletion works.",
  },
  {
    path: "/terms",
    label: "Terms",
    description: "Review Pip terms, product boundaries, subscription context, and no-money-movement limits.",
  },
  {
    path: "/delete-account",
    label: "Delete account",
    description: "Request deletion of your Pip account and associated app data.",
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
