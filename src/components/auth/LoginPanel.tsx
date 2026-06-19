"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PipIntroScene } from "@/components/onboarding/PipIntroScene";
import { getClientPipPlatform } from "@/lib/platform/android-shell";

export function LoginPanel() {
  const [showReviewerSignIn, setShowReviewerSignIn] = useState(false);

  useEffect(() => {
    setShowReviewerSignIn(shouldShowAndroidReviewerSignIn(window.navigator.userAgent));
  }, []);

  return (
    <main className="pip-app-shell grid min-h-screen place-items-center px-4 py-8 text-ink">
      <section className="w-full max-w-sm">
        <PipIntroScene
          priority
          title="Hi, I’m Pip. I’ll help you find the money that’s actually okay to use today."
          actions={
            <Link
              className="focus-ring flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)]"
              href="/api/auth/oauth/google"
            >
              Continue with Google
            </Link>
          }
          messageClassName="onboarding-intro-message"
        >
          <p>
            Connect checking and cards so I can show Spendable Cash Today without making balances the
            default number.
          </p>
          <p className="mt-3 text-xs leading-5 text-ink/50">
            Sign in with Google to set up Pip on this device.
          </p>
        </PipIntroScene>
        <div className="mt-8 flex gap-4 text-xs font-semibold text-ink/[0.45]">
          {showReviewerSignIn ? (
            <Link className="hover:text-ink" href="/reviewer-login">
              Play reviewer sign-in
            </Link>
          ) : null}
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

export function shouldShowAndroidReviewerSignIn(userAgent: string | null | undefined): boolean {
  return getClientPipPlatform(userAgent) === "android_webview";
}
