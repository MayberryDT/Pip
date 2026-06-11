export function getAppOrigin(request: Request, env: Record<string, string | undefined> = process.env): string {
  return (
    getCurrentOrigin(env.NEXT_PUBLIC_SITE_URL) ??
    getCurrentOrigin(env.URL) ??
    getForwardedOrigin(request) ??
    getCurrentOrigin(env.DEPLOY_PRIME_URL) ??
    new URL(request.url).origin
  );
}

export function buildAppUrl(
  path: string,
  request: Request,
  env: Record<string, string | undefined> = process.env,
): URL {
  return new URL(path, getAppOrigin(request, env));
}

function getForwardedOrigin(request: Request): string | null {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"));

  if (!host) {
    return null;
  }

  const requestUrl = new URL(request.url);
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const proto = forwardedProto ?? requestUrl.protocol.replace(/:$/, "") ?? "https";

  return normalizeOrigin(`${proto}://${host}`);
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();

  return first || null;
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

function getCurrentOrigin(rawUrl: string | undefined): string | null {
  const origin = normalizeOrigin(rawUrl);

  if (!origin || isLegacyNetlifyOrigin(origin)) {
    return null;
  }

  return origin;
}

function isLegacyNetlifyOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);

    return /(^|--)(free-cash-mayberrydt|pip-mayberrydt)\.netlify\.app$/i.test(hostname);
  } catch {
    return false;
  }
}
