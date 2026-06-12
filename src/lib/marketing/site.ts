export const marketingSite = {
  name: "Pip",
  defaultTitle: "Pip - Before you spend, check one number",
  defaultDescription:
    "Pip is a cute daily money companion that shows Spendable Cash Today, one calm number for what's actually okay to use today. No budget. No dashboard.",
  domain: "spendwithpip.com",
  supportEmail: "support@spendwithpip.com",
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
    description: "Get private beta support and deletion guidance.",
  },
  {
    path: "/privacy",
    label: "Privacy",
    description: "Review what Pip stores and how data deletion works.",
  },
  {
    path: "/terms",
    label: "Terms",
    description: "Review Pip beta terms and product boundaries.",
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
