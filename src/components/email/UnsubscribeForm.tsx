"use client";

import { useState } from "react";

export function UnsubscribeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function submit() {
    setStatus("submitting");
    const response = await fetch("/api/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    setStatus(response.ok ? "success" : "error");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink/70">
        This removes the email address attached to this link from future product update emails.
      </p>
      <button
        className="focus-ring rounded bg-ink px-5 py-3 text-sm font-bold text-soft-white disabled:opacity-60"
        type="button"
        onClick={submit}
        disabled={!token || status === "submitting" || status === "success"}
      >
        {status === "submitting" ? "Unsubscribing..." : "Unsubscribe"}
      </button>
      {status === "success" ? (
        <p className="text-sm font-bold text-moss">You're unsubscribed from future Pip product updates.</p>
      ) : null}
      {status === "error" ? (
        <p className="text-sm font-bold text-red-700">This unsubscribe link could not be used.</p>
      ) : null}
    </div>
  );
}
