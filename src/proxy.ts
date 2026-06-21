import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import {
  isAndroidAppShellHeaders,
  isAndroidMarketingRestrictedPath,
  isAndroidPaymentRestrictedPath,
} from "@/lib/platform/android-shell";
import { getSupabasePublicConfig, isSupabaseConfigured } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  if (
    isAndroidAppShellHeaders(request.headers) &&
    isAndroidPaymentRestrictedPath(request.nextUrl.pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/android-access";
    url.search = "";

    return NextResponse.rewrite(url);
  }

  if (
    isAndroidAppShellHeaders(request.headers) &&
    isAndroidMarketingRestrictedPath(request.nextUrl.pathname)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";

    return NextResponse.redirect(url);
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next({
      request,
    });
  }

  let response = NextResponse.next({
    request,
  });
  const { url, anonKey } = getSupabasePublicConfig();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Session/auth routes need Supabase cookie refresh. Android shell routes stay
  // here because this proxy also enforces the native WebView app restrictions.
  matcher: [
    "/app/:path*",
    "/auth/:path*",
    "/api/:path*",
    "/plaid/oauth",
    "/reviewer-login",
    "/",
    "/pricing/:path*",
    "/checkout/:path*",
    "/billing/:path*",
    "/subscribe/:path*",
    "/subscription/:path*",
    "/upgrade/:path*",
    "/how-it-works/:path*",
    "/how-the-number-works/:path*",
    "/blog/:path*",
    "/llms.txt",
  ],
};
