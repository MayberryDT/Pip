import { PipHome } from "@/components/PipHome";
import { AppAccessGate } from "@/components/app-access/AppAccessGate";
import { summarizeAppEntitlement } from "@/lib/access/app-entitlement";
import { loadActiveBillingSubscriptionForUser } from "@/lib/billing/billing-repository";
import {
  getCurrentPipCashState,
  NoFinancialDataError,
  type PipCashApiState,
} from "@/lib/data/current-snapshot";
import {
  loadActiveAppAccessGrant,
  recordAppAccessGrantAccess,
} from "@/lib/data/app-access-grants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLocalFakeAppMode, isSupabaseConfigured, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppPage({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string; onboarding?: string; plaid?: string }>;
}) {
  const params = await searchParams;
  const devOnboardingState =
    process.env.NODE_ENV !== "production" && process.env.PIP_LOCAL_STAGING !== "1"
      ? params?.onboarding
      : undefined;
  const authNotice = getAuthNotice(params?.auth);
  const connectionNotice = getConnectionNotice(params?.plaid);

  if (devOnboardingState === "guest") {
    return <PipHome authState={{ status: "guest" }} authNotice={authNotice} />;
  }

  if (devOnboardingState === "test") {
    return <PipHome authState={{ status: "guest" }} authNotice={authNotice} devOnboardingFlow />;
  }

  if (devOnboardingState === "demo") {
    return <PipHome />;
  }

  if (devOnboardingState === "consent") {
    return <PipHome authState={{ status: "needs-consent", email: "tester@example.com" }} />;
  }

  if (devOnboardingState === "ready") {
    return (
      <PipHome
        authState={{ status: "ready", email: "tester@example.com" }}
        connectionNotice={connectionNotice}
        enableAccountControls
      />
    );
  }

  if (!isSupabaseConfigured()) {
    if (isLocalFakeAppMode()) {
      return <PipHome />;
    }

    return <AppAccessGate state="unavailable" />;
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
    return <AppAccessGate state="signed-out" authNotice={authNotice} />;
  }

  const admin = createAppAccessAdminClient();

  if (!admin) {
    return <AppAccessGate state="unavailable" />;
  }

  const [grant, subscription] = await Promise.all([
    user.email ? loadActiveAppAccessGrant(admin, user.email) : Promise.resolve(null),
    loadActiveBillingSubscriptionForUser(admin, user.id),
  ]);
  const entitlement = summarizeAppEntitlement({ grant, subscription });

  if (!entitlement.hasAccess) {
    return <AppAccessGate state="billing-required" email={user.email ?? undefined} />;
  }

  if (entitlement.source === "manual_grant" && grant) {
    await recordAppAccessGrantAccess(admin, grant, user.id);
  }

  if (!hasConsented) {
    return <PipHome authState={{ status: "needs-consent", email: user.email ?? "" }} />;
  }

  let initialResult: PipCashApiState | null = null;

  try {
    initialResult = await getCurrentPipCashState({ recordFreshnessViewed: true });
  } catch (error) {
    if (!(error instanceof NoFinancialDataError)) {
      throw error;
    }
  }

  return (
    <PipHome
      authState={{ status: "ready", email: user.email ?? "" }}
      connectionNotice={connectionNotice}
      enableAccountControls
      initialResult={initialResult}
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

function createAppAccessAdminClient() {
  try {
    return createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      return null;
    }

    throw error;
  }
}
