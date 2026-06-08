"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearPersistedPlaidLinkToken,
  getPersistedPlaidLinkSession,
  openPlaidLink,
  type PlaidConnection,
} from "@/lib/providers/plaid/link-browser";

type ResumeState = "loading" | "error" | "success";

export function PlaidOAuthResume() {
  const hasStarted = useRef(false);
  const [state, setState] = useState<ResumeState>("loading");
  const [message, setMessage] = useState("Finishing your secure Plaid connection.");

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    async function resumePlaidLink() {
      const session = getPersistedPlaidLinkSession();

      if (!session?.linkToken) {
        setState("error");
        setMessage("I could not find the Plaid session. Return to Spendable and tap Connect data again.");
        return;
      }

      try {
        await resumePlaidOAuthConnection({
          linkToken: session.linkToken,
          mode: session.mode,
          receivedRedirectUri: window.location.href,
        });
        setState("success");
        setMessage("Connected. I’m taking you back to Spendable now.");
        window.setTimeout(() => window.location.replace("/?plaid=connected"), 650);
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Plaid could not finish connecting.");
      }
    }

    void resumePlaidLink();
  }, []);

  return (
    <main className="free-cash-app-shell flex min-h-svh items-center justify-center px-5 py-8 text-ink">
      <section className="w-full max-w-md text-center">
        <p className="font-display text-[3rem] leading-none text-ink">Spendable</p>
        <div className="glass-panel mt-8 px-6 py-6 text-left">
          <p className="text-xs font-bold uppercase tracking-normal text-taupe">
            {state === "error" ? "Connection paused" : state === "success" ? "Connected" : "Secure connection"}
          </p>
          <p className="font-display mt-3 text-[1.45rem] leading-[1.28] text-ink">{message}</p>
          {state === "loading" ? (
            <div className="mt-5 flex items-center gap-2 text-taupe" aria-hidden="true">
              <span className="thinking-dot" />
              <span className="thinking-dot thinking-dot-delay-1" />
              <span className="thinking-dot thinking-dot-delay-2" />
            </div>
          ) : null}
          {state === "error" ? (
            <a
              className="focus-ring mt-5 inline-flex min-h-11 items-center rounded-full border border-ink/10 bg-porcelain px-5 text-sm font-semibold text-ink"
              href="/"
            >
              Back to Spendable
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export async function resumePlaidOAuthConnection(input: {
  linkToken: string;
  mode?: "connect" | "repair";
  receivedRedirectUri: string;
}) {
  const connection = await openPlaidLink(
    {
      linkToken: input.linkToken,
      mode: input.mode,
    },
    {
      receivedRedirectUri: input.receivedRedirectUri,
      persistToken: false,
    },
  );

  if (input.mode === "repair") {
    await refreshPlaidData("repair");
  } else {
    await exchangePlaidConnection(connection);
    await refreshPlaidData("manual");
  }

  clearPersistedPlaidLinkToken();
}

async function exchangePlaidConnection(connection: PlaidConnection) {
  if (!connection.publicToken) {
    throw new Error("Plaid did not return a public token.");
  }

  const response = await fetch("/api/providers/plaid/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      publicToken: connection.publicToken,
      metadata: connection.metadata,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Plaid exchange failed."));
  }
}

async function refreshPlaidData(reason: "manual" | "repair") {
  const response = await fetch("/api/sync/manual", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      provider: "plaid",
      reason,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const retry = payload?.retryAfterSeconds ? ` Try again in ${payload.retryAfterSeconds}s.` : "";
    throw new Error(`${getErrorMessage(payload, "Refresh failed.")}${retry}`);
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}
