import { Resend } from "resend";
import { getEmailConfig, isEmailConfigured } from "@/lib/email/env";
import type { EmailMessage, EmailProvider, EmailSendResult } from "@/lib/email/provider";

export function createConfiguredEmailProvider(): EmailProvider | null {
  if (!isEmailConfigured()) {
    return null;
  }

  const config = getEmailConfig();
  const resend = new Resend(config.apiKey);

  return {
    name: "resend",
    async send(message: EmailMessage): Promise<EmailSendResult> {
      const response = await resend.emails.send({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo ?? config.replyTo,
        tags: message.tags,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return {
        status: "sent",
        provider: "resend",
        providerMessageId: response.data?.id,
      };
    },
  };
}
