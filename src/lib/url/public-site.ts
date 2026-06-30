export function getPublicSiteOrigin() {
  return process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "http://localhost:3000";
}

export function getPublicSiteUrl(path: string) {
  return new URL(path, getPublicSiteOrigin()).toString();
}
