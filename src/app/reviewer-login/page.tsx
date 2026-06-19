import type { Metadata } from "next";
import { ReviewerLoginForm } from "@/components/ReviewerLoginForm";
import { buildMarketingMetadata } from "@/lib/marketing/metadata";

export const metadata: Metadata = {
  ...buildMarketingMetadata({
    title: "Play review sign in",
    description: "Sign in to Pip with the Play review account.",
    path: "/reviewer-login",
  }),
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReviewerLoginPage() {
  return (
    <main className="pip-app-shell min-h-screen px-5 py-6 text-ink">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[430px] flex-col justify-center">
        <div className="glass-panel space-y-5 px-5 py-6">
          <img
            src="/brand/pip-logo.png"
            alt="Pip"
            width={757}
            height={634}
            className="h-16 w-auto object-contain"
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-taupe">Play review</p>
            <h1 className="font-display mt-2 text-[2rem] leading-none text-ink">Sign in to Pip</h1>
            <p className="mt-3 text-sm leading-6 text-ink/[0.70]">
              Use the reviewer credentials provided in Play Console App access.
            </p>
          </div>
          <ReviewerLoginForm />
        </div>
      </section>
    </main>
  );
}
