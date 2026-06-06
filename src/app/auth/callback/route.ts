import { NextResponse } from "next/server";
import { acceptCurrentUserInvite } from "@/lib/auth/beta-invites";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EmailOtpCallbackType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  const authParams = getAuthCallbackParams(requestUrl.searchParams);
  if (!authParams) {
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } =
    authParams.kind === "code"
      ? await supabase.auth.exchangeCodeForSession(authParams.code)
      : authParams.kind === "token_hash"
        ? await supabase.auth.verifyOtp({
            token_hash: authParams.tokenHash,
            type: authParams.type,
          })
        : await supabase.auth.verifyOtp({
            email: authParams.email,
            token: authParams.token,
            type: authParams.type,
          });

  if (!error && data.user) {
    await acceptCurrentUserInvite(data.user).catch(() => null);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

function getSafeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function getAuthCallbackParams(searchParams: URLSearchParams):
  | { kind: "code"; code: string }
  | { kind: "email_token"; email: string; token: string; type: EmailOtpCallbackType }
  | { kind: "token_hash"; tokenHash: string; type: EmailOtpCallbackType }
  | null {
  const code = searchParams.get("code");
  if (code) {
    return { kind: "code", code };
  }

  const type = getEmailOtpCallbackType(searchParams.get("type"));
  if (!type) {
    return null;
  }

  const tokenHash = searchParams.get("token_hash");
  if (tokenHash) {
    return { kind: "token_hash", tokenHash, type };
  }

  const token = searchParams.get("token");
  const email = searchParams.get("email");
  if (token && email) {
    return { kind: "email_token", email, token, type };
  }

  if (token) {
    return { kind: "token_hash", tokenHash: token, type };
  }

  return null;
}

function getEmailOtpCallbackType(type: string | null): EmailOtpCallbackType | null {
  switch (type) {
    case "signup":
    case "invite":
    case "magiclink":
    case "recovery":
    case "email_change":
    case "email":
      return type;
    default:
      return null;
  }
}
