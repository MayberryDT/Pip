import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAppUrl, getAppOrigin } from "@/lib/url/app-origin";
import { getSafeAuthNextPath } from "@/lib/url/safe-next-path";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getAppOrigin(request);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(buildAppUrl("/app?auth=unconfigured", request));
  }

  const supabase = await createSupabaseServerClient();
  const next = getSafeAuthNextPath(requestUrl.searchParams.get("next"), origin);
  const redirectTo = new URL("/auth/callback", origin);

  if (next !== "/app") {
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
    return NextResponse.redirect(buildAppUrl("/app?auth=oauth-start-failed", request));
  }

  return NextResponse.redirect(data.url);
}
