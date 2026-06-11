"use client";

import { useEffect, useRef, useState } from "react";
import { PipAvatar } from "@/components/brand/PipAvatar";
import {
  clearPersistedPlaidLinkToken,
  getPersistedPlaidLinkSession,
  openPlaidLink,
  type PlaidConnection,
  type PlaidEventMetadata,
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
        setMessage("I could not find the Plaid session. Return to Pip and tap Connect data again.");
        return;
      }

      try {
        await resumePlaidOAuthConnection({
          linkToken: session.linkToken,
          mode: session.mode,
          receivedRedirectUri: window.location.href,
        });
        setState("success");
        setMessage("Connected. I’m taking you back to Pip now.");
        window.setTimeout(() => window.location.replace("/?plaid=connected"), 650);
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Plaid could not finish connecting.");
      }
    }

    void resumePlaidLink();
  }, []);

  return (
    <main className="pip-app-shell flex min-h-svh items-center justify-center px-5 py-8 text-ink">
      <section className="w-full max-w-md text-center">
        <PipAvatar size="lg" expression="neutral" ariaLabel="Pip" className="mx-auto" />
        <p className="font-display mt-4 text-[3rem] leading-none text-moss">Pip</p>
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
              Back to Pip
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
  const plaid = {
    linkToken: input.linkToken,
    mode: input.mode,
  };
  await trackPlaidClientEvent("plaid_link_started", {
    mode: input.mode ?? "connect",
    surface: "oauth_resume",
  });
  let connection;

  try {
    connection = await openPlaidLink(plaid, {
      receivedRedirectUri: input.receivedRedirectUri,
      persistToken: false,
      onEvent: (eventName, metadata) => {
        void trackPlaidLinkEvent(eventName, metadata, input.mode ?? "connect");
      },
    });
    await trackPlaidClientEvent("plaid_link_succeeded", {
      mode: input.mode ?? "connect",
      surface: "oauth_resume",
      institutionName: connection.metadata.institution?.name ?? null,
      institutionId: connection.metadata.institution?.institution_id ?? null,
    });
  } catch (error) {
    await trackPlaidClientEvent("plaid_link_failed", {
      mode: input.mode ?? "connect",
      surface: "oauth_resume",
      errorMessage: getClientErrorMessage(error),
    });
    throw error;
  }

  if (input.mode === "repair") {
    await refreshPlaidDataWithTelemetry("repair");
  } else {
    await exchangePlaidConnection(connection);
    await refreshPlaidDataWithTelemetry("manual");
  }

  clearPersistedPlaidLinkToken();
}

async function exchangePlaidConnection(connection: PlaidConnection) {
  if (!connection.publicToken) {
    await trackPlaidClientEvent("plaid_exchange_failed", {
      surface: "oauth_resume",
      errorMessage: "Plaid did not return a public token.",
    });
    throw new Error("Plaid did not return a public token.");
  }

  try {
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

    await trackPlaidClientEvent("plaid_exchange_succeeded", {
      surface: "oauth_resume",
      institutionName: connection.metadata.institution?.name ?? null,
      institutionId: connection.metadata.institution?.institution_id ?? null,
    });
  } catch (error) {
    await trackPlaidClientEvent("plaid_exchange_failed", {
      surface: "oauth_resume",
      institutionName: connection.metadata.institution?.name ?? null,
      institutionId: connection.metadata.institution?.institution_id ?? null,
      errorMessage: getClientErrorMessage(error),
    });
    throw error;
  }
}

async function refreshPlaidDataWithTelemetry(reason: "manual" | "repair") {
  try {
    await refreshPlaidData(reason);
    await trackPlaidClientEvent("plaid_sync_succeeded", {
      reason,
      surface: "oauth_resume",
    });
  } catch (error) {
    await trackPlaidClientEvent("plaid_sync_failed", {
      reason,
      surface: "oauth_resume",
      errorMessage: getClientErrorMessage(error),
    });
    throw error;
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

function getClientErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unknown client error.";
}

async function trackPlaidLinkEvent(
  eventName: string,
  metadata: PlaidEventMetadata | undefined,
  mode: "connect" | "repair",
) {
  await trackPlaidClientEvent("plaid_link_event", {
    eventName: eventName.slice(0, 80),
    mode,
    surface: "oauth_resume",
    errorCode: metadata?.error_code?.slice(0, 80) ?? null,
    errorMessage: metadata?.error_message?.slice(0, 180) ?? null,
    exitStatus: metadata?.exit_status?.slice(0, 80) ?? null,
    institutionName: metadata?.institution_name?.slice(0, 120) ?? null,
    institutionId: metadata?.institution_id?.slice(0, 120) ?? null,
    linkSessionId: metadata?.link_session_id?.slice(0, 120) ?? null,
    requestId: metadata?.request_id?.slice(0, 120) ?? null,
    status: metadata?.status?.slice(0, 80) ?? null,
    viewName: metadata?.view_name?.slice(0, 80) ?? null,
  });
}

async function trackPlaidClientEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  await fetch("/api/events", {
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
