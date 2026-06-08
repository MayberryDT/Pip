import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/?auth=unconfigured", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const origin = getAppOrigin(request);
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const redirectTo = new URL("/auth/callback", origin);

  if (next !== "/") {
    redirectTo.searchParams.set("next", next);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/?auth=oauth-start-failed", requestUrl.origin));
  }

  return NextResponse.redirect(data.url);
}

function getSafeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function getAppOrigin(request: Request): string {
  const explicitUrl = normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_PRIME_URL,
  );

  if (explicitUrl) {
    return explicitUrl;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    return normalizeOrigin(`${forwardedProto}://${forwardedHost}`) ?? new URL(request.url).origin;
  }

  return new URL(request.url).origin;
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
