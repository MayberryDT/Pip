import type { ReactNode } from "react";
import Link from "next/link";
import { AppAccessSignOutButton } from "@/components/app-access/AppAccessSignOutButton";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";

type AppAccessGateProps =
  | {
      state: "signed-out";
      authNotice?: "auth-error";
    }
  | {
      state: "waitlisted";
      email?: string;
    }
  | {
      state: "unavailable";
    };

export function AppAccessGate(props: AppAccessGateProps) {
  if (props.state === "waitlisted") {
    return (
      <AccessShell
        title="You’re on the Pip waitlist"
        actions={<AppAccessSignOutButton />}
      >
        <p>
          We saved this request{props.email ? ` for ${props.email}` : ""}. I’ll email you when
          app access is ready for your account.
        </p>
      </AccessShell>
    );
  }

  if (props.state === "unavailable") {
    return (
      <AccessShell title="Pip access is temporarily unavailable">
        <p>Access checks are not configured right now. Please try again later.</p>
      </AccessShell>
    );
  }

  return (
    <AccessShell
      title="Join the Pip waitlist"
      actions={
        <Link
          className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
          href="/api/auth/oauth/google"
        >
          Continue with Google
        </Link>
      }
    >
      {props.authNotice ? (
        <p className="mb-3 rounded-[8px] border border-ink/10 bg-white/60 px-4 py-3 text-sm leading-6 text-ink/[0.72]">
          Google sign-in could not finish. Try Continue with Google again from here.
        </p>
      ) : null}
      <p>Sign in with Google and I’ll add your verified email to the app access list.</p>
    </AccessShell>
  );
}

function AccessShell({
  actions,
  children,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <main className="pip-app-shell grid min-h-screen place-items-center px-4 py-8 text-ink">
      <section className="w-full max-w-sm">
        <PipIntroScene
          priority
          title={title}
          actions={actions}
          messageClassName="onboarding-intro-message"
        >
          {children}
        </PipIntroScene>
        <div className="mt-8 flex gap-4 text-xs font-semibold text-ink/[0.45]">
          <Link className="hover:text-ink" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-ink" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-ink" href="/support">
            Support
          </Link>
        </div>
      </section>
    </main>
  );
}
