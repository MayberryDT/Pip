import type { Metadata } from "next";
import { AdminControlCenter } from "@/components/admin/AdminControlCenter";
import { getAdminAccessState } from "@/lib/admin/auth";
import { loadAdminWaitlist } from "@/lib/admin/waitlist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pip admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const adminState = await getAdminAccessState();

  if (adminState.status === "signed-out") {
    return (
      <AdminShell
        title="Pip admin sign in"
        actionHref="/api/auth/oauth/google?next=%2Fadmin"
        actionLabel="Sign in with Google"
      />
    );
  }

  if (adminState.status === "forbidden") {
    return <AdminShell title="Admin access required" />;
  }

  if (adminState.status === "unavailable") {
    return <AdminShell title="Admin access is unavailable" />;
  }

  const supabase = createSupabaseAdminClient();
  const waitlist = await loadAdminWaitlist(supabase);

  return (
    <AdminControlCenter
      rows={waitlist.rows}
      summary={{
        waitlistCount: waitlist.waitlistCount,
        appWaitlistCount: waitlist.appWaitlistCount,
        activeGrantCount: waitlist.activeGrantCount,
      }}
    />
  );
}

function AdminShell({
  actionHref,
  actionLabel,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  title: string;
}) {
  return (
    <main className="pip-app-shell grid min-h-screen place-items-center px-5 py-8 text-ink">
      <section className="glass-panel w-full max-w-[430px] space-y-5 px-5 py-6">
        <img
          alt="Pip"
          className="h-16 w-auto object-contain"
          height={634}
          src="/brand/pip-logo.png"
          width={757}
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-normal text-taupe">Admin</p>
          <h1 className="font-display mt-2 text-[2rem] leading-none text-ink">{title}</h1>
        </div>
        {actionHref && actionLabel ? (
          <a
            className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-paper"
            href={actionHref}
          >
            {actionLabel}
          </a>
        ) : null}
      </section>
    </main>
  );
}
