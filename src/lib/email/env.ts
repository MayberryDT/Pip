export class EmailConfigError extends Error {
  constructor(message = "Email delivery is not configured.") {
    super(message);
    this.name = "EmailConfigError";
  }
}

export type EmailConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
  replyTo?: string;
  postalAddress: string;
  unsubscribeSecret: string;
  resendWebhookSecret?: string;
  siteUrl: string;
};

export function isEmailConfigured(): boolean {
  if (process.env.PIP_EMAIL_MODE === "off") {
    return false;
  }

  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.PIP_EMAIL_FROM &&
    process.env.PIP_EMAIL_POSTAL_ADDRESS &&
    process.env.PIP_EMAIL_UNSUBSCRIBE_SECRET,
  );
}

export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PIP_EMAIL_FROM;
  const postalAddress = process.env.PIP_EMAIL_POSTAL_ADDRESS;
  const unsubscribeSecret = process.env.PIP_EMAIL_UNSUBSCRIBE_SECRET;

  if (!apiKey || !from || !postalAddress || !unsubscribeSecret) {
    throw new EmailConfigError(
      "Set RESEND_API_KEY, PIP_EMAIL_FROM, PIP_EMAIL_POSTAL_ADDRESS, and PIP_EMAIL_UNSUBSCRIBE_SECRET to enable email delivery.",
    );
  }

  return {
    provider: "resend",
    apiKey,
    from,
    replyTo: process.env.PIP_EMAIL_REPLY_TO || undefined,
    postalAddress,
    unsubscribeSecret,
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || undefined,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://spendwithpip.com",
  };
}
