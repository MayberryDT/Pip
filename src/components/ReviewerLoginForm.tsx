"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LogIn } from "lucide-react";

export function ReviewerLoginForm() {
  const [email, setEmail] = useState("play-review@animasai.co");
  const [password, setPassword] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitReviewerLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setStatusText("");

    try {
      const response = await fetch("/api/auth/reviewer-login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Reviewer sign-in failed."));
      }

      setStatusText("Signed in. Opening Pip...");
      window.setTimeout(() => {
        window.location.assign("/app");
      }, 350);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Reviewer sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submitReviewerLogin}>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-normal text-taupe">Email</span>
        <input
          className="focus-ring mt-2 h-12 w-full rounded-[0.9rem] border border-line bg-white/80 px-3 text-sm font-semibold text-ink"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-normal text-taupe">Password</span>
        <input
          className="focus-ring mt-2 h-12 w-full rounded-[0.9rem] border border-line bg-white/80 px-3 text-sm font-semibold text-ink"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button
        className="focus-ring ui-pressable inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-paper disabled:bg-ink/35"
        disabled={isSubmitting}
        type="submit"
      >
        <LogIn aria-hidden="true" size={16} strokeWidth={2.4} />
        <span>{isSubmitting ? "Signing in..." : "Sign in"}</span>
      </button>
      {statusText ? (
        <p className="text-sm font-semibold text-taupe" role="status">
          {statusText}
        </p>
      ) : null}
    </form>
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}
