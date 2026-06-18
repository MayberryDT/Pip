export const pipAndroidUserAgentToken = "PipAndroid/1";

export type PipPlatform = "android_webview" | "web";

type HeaderLike = {
  get(name: string): string | null;
};

export function isAndroidAppShellUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent?.includes(pipAndroidUserAgentToken));
}

export function isAndroidAppShellHeaders(headers: HeaderLike): boolean {
  return isAndroidAppShellUserAgent(headers.get("user-agent"));
}

export function getClientPipPlatform(userAgent: string | null | undefined): PipPlatform {
  return isAndroidAppShellUserAgent(userAgent) ? "android_webview" : "web";
}

export function isAndroidPaymentRestrictedPath(pathname: string): boolean {
  return androidPaymentRestrictedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const androidPaymentRestrictedPaths = [
  "/pricing",
  "/checkout",
  "/billing",
  "/subscribe",
  "/subscription",
  "/upgrade",
] as const;
