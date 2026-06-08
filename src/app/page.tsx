import { FreeCashHome } from "@/components/FreeCashHome";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string; onboarding?: string; plaid?: string }>;
}) {
  const params = await searchParams;
  const devOnboardingState =
    process.env.NODE_ENV !== "production" ? params?.onboarding : undefined;
  const authNotice = getAuthNotice(params?.auth);
  const connectionNotice = getConnectionNotice(params?.plaid);

  if (devOnboardingState === "guest") {
    return <FreeCashHome authState={{ status: "guest" }} authNotice={authNotice} />;
  }

  if (devOnboardingState === "consent") {
    return <FreeCashHome authState={{ status: "needs-consent", email: "tester@example.com" }} />;
  }

  if (devOnboardingState === "ready") {
    return (
      <FreeCashHome
        authState={{ status: "ready", email: "tester@example.com" }}
        connectionNotice={connectionNotice}
        enableAccountControls
      />
    );
  }

  if (!isSupabaseConfigured()) {
    return <FreeCashHome />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let hasConsented = false;

  if (user) {
    const { data } = await supabase
      .from("user_settings")
      .select("privacy_consent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    hasConsented = Boolean(data?.privacy_consent_at);
  }

  if (!user) {
    return <FreeCashHome authState={{ status: "guest" }} authNotice={authNotice} />;
  }

  if (!hasConsented) {
    return <FreeCashHome authState={{ status: "needs-consent", email: user.email ?? "" }} />;
  }

  return (
    <FreeCashHome
      authState={{ status: "ready", email: user.email ?? "" }}
      connectionNotice={connectionNotice}
      enableAccountControls
    />
  );
}

function getAuthNotice(auth: string | undefined): "auth-error" | undefined {
  if (auth === "callback-failed" || auth === "oauth-start-failed" || auth === "unconfigured") {
    return "auth-error";
  }

  return undefined;
}

function getConnectionNotice(plaid: string | undefined): "plaid-connected" | undefined {
  return plaid === "connected" ? "plaid-connected" : undefined;
}
