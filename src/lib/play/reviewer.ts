const defaultReviewerEmails = ["play-review@animasai.co", "play-delete-test@animasai.co"];

export function getPlayReviewerEmails(env: Record<string, string | undefined> = process.env): string[] {
  const configured = env.PIP_PLAY_REVIEWER_EMAILS?.split(",") ?? [];
  const normalized = configured
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : defaultReviewerEmails;
}

export function isPlayReviewerEmail(
  email: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return getPlayReviewerEmails(env).includes(email.trim().toLowerCase());
}
