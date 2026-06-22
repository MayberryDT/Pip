export type EmailTemplateMessage = {
  subject: string;
  html: string;
  text: string;
};

export function buildWaitlistConfirmationEmail(input: {
  email: string;
  unsubscribeUrl: string;
  postalAddress: string;
}): EmailTemplateMessage {
  return {
    subject: "You're on the Pip waitlist",
    text: [
      "You're on the Pip waitlist.",
      "",
      "I'll email you when app access opens up and when there are meaningful Pip updates.",
      "",
      `Unsubscribe: ${input.unsubscribeUrl}`,
      "",
      input.postalAddress,
    ].join("\n"),
    html: [
      "<p>You're on the Pip waitlist.</p>",
      "<p>I'll email you when app access opens up and when there are meaningful Pip updates.</p>",
      `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe from product updates</a></p>`,
      `<p>${escapeHtml(input.postalAddress)}</p>`,
    ].join(""),
  };
}

export function buildAppWaitlistConfirmationEmail(input: {
  email: string;
  unsubscribeUrl: string;
  postalAddress: string;
}): EmailTemplateMessage {
  return {
    subject: "You're on the Pip app access list",
    text: [
      "You're on the Pip app access list.",
      "",
      "Google sign-in verified your email, so I can use this address for app access invites.",
      "",
      `Unsubscribe from product updates: ${input.unsubscribeUrl}`,
      "",
      input.postalAddress,
    ].join("\n"),
    html: [
      "<p>You're on the Pip app access list.</p>",
      "<p>Google sign-in verified your email, so I can use this address for app access invites.</p>",
      `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe from product updates</a></p>`,
      `<p>${escapeHtml(input.postalAddress)}</p>`,
    ].join(""),
  };
}

export function buildInviteGrantedEmail(input: {
  email: string;
  appUrl: string;
  unsubscribeUrl: string;
  postalAddress: string;
}): EmailTemplateMessage {
  return {
    subject: "Your Pip access is ready",
    text: [
      "Your Pip access is ready.",
      "",
      `Open Pip: ${input.appUrl}`,
      "",
      "Use the same Google account this email was sent to.",
      "",
      `Unsubscribe from product updates: ${input.unsubscribeUrl}`,
      "",
      input.postalAddress,
    ].join("\n"),
    html: [
      "<p>Your Pip access is ready.</p>",
      `<p><a href="${escapeHtml(input.appUrl)}">Open Pip</a></p>`,
      "<p>Use the same Google account this email was sent to.</p>",
      `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe from product updates</a></p>`,
      `<p>${escapeHtml(input.postalAddress)}</p>`,
    ].join(""),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
