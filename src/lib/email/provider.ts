export type EmailTag = {
  name: string;
  value: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags: EmailTag[];
  replyTo?: string;
};

export type EmailSendResult =
  | { status: "sent"; provider: string; providerMessageId?: string }
  | { status: "skipped"; provider: "none" };

export type EmailProvider = {
  name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
};

export async function sendEmailWithProvider(
  provider: EmailProvider | null,
  message: EmailMessage,
): Promise<EmailSendResult> {
  if (!provider) {
    return { status: "skipped", provider: "none" };
  }

  return provider.send(message);
}
