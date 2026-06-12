"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { pipLaunch } from "@/lib/marketing/pricing";

type SubmitState = "idle" | "submitting" | "succeeded" | "failed";

export function WaitlistForm({
  sourcePage,
  compact = false,
}: {
  sourcePage: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const fieldId = useMemo(() => `launch-access-email-${sourcePage.replace(/[^a-z0-9]/gi, "-")}`, [sourcePage]);

  async function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    void trackMarketingEvent("waitlist_signup_submitted", { page: sourcePage });

    const attribution = getAttribution();
    const response = await fetch("/api/marketing/waitlist", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        sourcePage,
        referrer: attribution.referrer,
        utm: attribution.utm,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setState("failed");
      setMessage(payload && typeof payload.error === "string" ? payload.error : "That didn't go through. Try again in a moment.");
      void trackMarketingEvent("waitlist_signup_failed", { page: sourcePage, statusCode: response?.status ?? 0 });
      return;
    }

    setState("succeeded");
    setEmail("");
    setMessage("You're on the launch list. I'll let you know when Pip is ready.");
    void trackMarketingEvent("waitlist_signup_succeeded", { page: sourcePage });
  }

  return (
    <form
      className={[
        "w-full",
        compact ? "max-w-xl" : "mx-auto max-w-2xl",
      ].join(" ")}
      onSubmit={submitWaitlist}
    >
      <label className="text-sm font-bold text-ink/74" htmlFor={fieldId}>
        {pipLaunch.primaryCta}
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-taupe"
            size={18}
          />
          <input
            className="focus-ring min-h-12 w-full rounded-full border border-line bg-porcelain px-12 text-base font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] placeholder:text-ink/38"
            id={fieldId}
            inputMode="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </div>
        <button
          className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-moss px-6 text-sm font-bold text-porcelain shadow-soft transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
          disabled={state === "submitting"}
          type="submit"
        >
          {state === "submitting" ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : state === "succeeded" ? (
            <CheckCircle2 aria-hidden="true" size={18} />
          ) : null}
          {state === "submitting" ? "Sending" : state === "succeeded" ? "Sent" : pipLaunch.primaryCtaShort}
        </button>
      </div>
      <p className="mt-3 min-h-5 text-sm font-semibold text-ink/66" aria-live="polite">
        {message || "Get a note when Pip launches for iPhone and Android."}
      </p>
    </form>
  );
}

export async function trackMarketingEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  await fetch("/api/marketing/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventName,
      properties,
    }),
  }).catch(() => null);
}

function getAttribution() {
  const params = new URLSearchParams(window.location.search);

  return {
    referrer: document.referrer || null,
    utm: {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    },
  };
}
