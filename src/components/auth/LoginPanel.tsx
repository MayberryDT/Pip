"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function LoginPanel() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus("error");
      setMessage(payload?.error ?? "Sign-in failed.");
      return;
    }

    setStatus("sent");
    setMessage("Check your email for the private beta sign-in link.");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <section className="w-full max-w-sm">
        <h1 className="font-display text-5xl font-normal tracking-normal">Spendable</h1>
        <p className="mt-5 text-sm leading-6 text-ink/[0.62]">
          Connect checking and cards so Spendable can count spending without making balances the
          default number.
        </p>
        <p className="mt-4 text-xs leading-5 text-ink/50">
          Private beta access is invite-only and uses an email sign-in link.
        </p>
        <form className="mt-8 space-y-3" onSubmit={handleSubmit}>
          <input
            className="focus-ring min-h-14 w-full rounded-full border border-ink/12 bg-white px-5 text-base text-ink shadow-[0_12px_34px_rgba(23,26,31,0.08)]"
            value={email}
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            onChange={(event) => setEmail(event.target.value)}
            disabled={status === "sending"}
          />
          <button
            type="submit"
            className="focus-ring min-h-14 w-full rounded-full bg-ink px-5 text-base font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)] disabled:bg-ink/30"
            disabled={status === "sending" || !email.trim()}
          >
            {status === "sending" ? "Sending" : "Sign in"}
          </button>
        </form>
        {message ? <p className="mt-4 text-sm leading-6 text-ink/[0.66]">{message}</p> : null}
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
