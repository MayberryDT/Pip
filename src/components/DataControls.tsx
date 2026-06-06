"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LogOut, Plug, RefreshCw, Save, Shield, Trash2, X } from "lucide-react";
import {
  canRefreshData,
  formatLastRefresh,
  getConnectionStatusMessage,
  getConnectLabel,
  getLatestSyncRunMessage,
  getPlaidConnectRequest,
  getRefreshLabel,
  getRefreshProvider,
  type FinancialProvider,
  type SyncStatusResponse,
} from "@/components/data-controls-helpers";
import { openPlaidLink } from "@/lib/providers/plaid/link-browser";

type SettingsResponse = {
  protectedSavingsMonthlyCents: number;
  manualRefreshOnly: boolean;
  privacyConsentAt: string | null;
};

type UsageResponse = {
  periodStart: string;
  freeCashViewCount: number;
  promptChipSelectionCount: number;
  aiQuestionCount: number;
  agentFollowUpCount: number;
  estimatedModelCallCount: number;
  purchaseSimulationCount: number;
  trueBalanceRevealCount: number;
  missingCardNudgeShownCount: number;
  missingCardSuppressionCount: number;
  negativeFreeCashFollowUpCount: number;
  providerSyncCount: number;
  partialProviderSyncCount: number;
  failedProviderSyncCount: number;
};

type PlaidConnectConfig = {
  kind: "plaid";
  linkToken: string;
  environment: "sandbox" | "production";
  products: string[];
  mode: "connect" | "repair";
};

type ConnectSessionResponse = {
  provider: "mock" | "teller" | "plaid";
  status: "ready" | "unavailable";
  message: string;
  connect?: PlaidConnectConfig | {
    kind: string;
  };
};

export function DataControls() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [protectedSavings, setProtectedSavings] = useState("200");
  const [status, setStatus] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const connectionStatusMessage = getConnectionStatusMessage(syncStatus);
  const latestSyncRunMessage = getLatestSyncRunMessage(syncStatus);
  const refreshIsEnabled = canRefreshData(syncStatus);

  useEffect(() => {
    if (!open || settings) {
      return;
    }

    void loadSettings();
  }, [open, settings]);

  async function loadSettings() {
    const [settingsResponse, syncResponse, usageResponse] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/sync/status"),
      fetch("/api/usage"),
    ]);
    const payload = await settingsResponse.json().catch(() => null);

    if (!settingsResponse.ok) {
      setStatus(payload?.error ?? "Settings unavailable.");
      return;
    }

    setSettings(payload);
    setProtectedSavings(String(Math.round(payload.protectedSavingsMonthlyCents / 100)));

    if (syncResponse.ok) {
      setSyncStatus(await syncResponse.json());
    }

    if (usageResponse.ok) {
      setUsage(await usageResponse.json());
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving");

    const amount = Math.max(0, Math.round(Number(protectedSavings || "0") * 100));
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protectedSavingsMonthlyCents: amount,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? "Save failed.");
      return;
    }

    setSettings((current) =>
      current
        ? {
            ...current,
            protectedSavingsMonthlyCents: amount,
          }
        : null,
    );
    setStatus("Saved");
  }

  async function deleteData() {
    setStatus("Deleting");

    const response = await fetch("/api/delete-data", {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(payload?.error ?? "Delete failed.");
      return;
    }

    window.location.reload();
  }

  async function connectData() {
    setStatus("Connecting");

    const connectResponse = await fetch("/api/providers/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "plaid",
        ...getPlaidConnectRequest(syncStatus),
      }),
    });
    const connectPayload = await connectResponse.json().catch(() => null);

    if (!connectResponse.ok) {
      setStatus(getErrorMessage(connectPayload, "Connect failed."));
      return;
    }

    const connectSession = connectPayload as ConnectSessionResponse | null;

    if (connectSession?.status !== "ready" || !connectSession.connect) {
      setStatus(connectSession?.message ?? "Provider unavailable.");
      return;
    }

    if (!isPlaidConnectConfig(connectSession.connect)) {
      setStatus("Plaid connection is unavailable.");
      return;
    }

    try {
      const connection = await openPlaidLink(connectSession.connect);

      if (connectSession.connect.mode === "repair") {
        await runRefresh("Syncing", "plaid", "repair");
        return;
      }

      if (!connection.publicToken) {
        setStatus("Plaid did not return a public token.");
        return;
      }

      const exchangeResponse = await fetch("/api/providers/plaid/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          publicToken: connection.publicToken,
          metadata: connection.metadata,
        }),
      });
      const exchangePayload = await exchangeResponse.json().catch(() => null);

      if (!exchangeResponse.ok) {
        setStatus(exchangePayload?.error ?? "Plaid exchange failed.");
        return;
      }

      await runRefresh("Syncing", "plaid");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Plaid Link closed.");
    }
  }

  async function refreshData() {
    const provider = getRefreshProvider(syncStatus);

    if (!provider) {
      setStatus("Connect data first.");
      return;
    }

    return runRefresh("Refreshing", provider);
  }

  async function runRefresh(label: string, provider: FinancialProvider, reason: "manual" | "repair" = "manual") {
    setStatus(label);

    const response = await fetch("/api/sync/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider,
        reason,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const retry = payload?.retryAfterSeconds ? ` Try again in ${payload.retryAfterSeconds}s.` : "";
      setStatus(`${payload?.error ?? "Refresh failed."}${retry}`);
      return;
    }

    setStatus("Refreshed");
    window.location.reload();
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
    });
    window.location.reload();
  }

  return (
    <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
      <button
        type="button"
        className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-ink/10 bg-white/76 text-ink shadow-[0_10px_24px_rgba(23,26,31,0.08)]"
        aria-label="Data controls"
        title="Data controls"
        onClick={() => setOpen(true)}
      >
        <Shield aria-hidden="true" size={18} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-20 bg-ink/18 px-4 py-5 backdrop-blur-sm">
          <section className="ml-auto flex h-full w-full max-w-sm flex-col rounded-2xl bg-paper p-4 text-ink shadow-[0_20px_60px_rgba(23,26,31,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Data</h2>
              <button
                type="button"
                className="focus-ring grid h-9 w-9 place-items-center rounded-full bg-white/80 text-ink"
                aria-label="Close"
                title="Close"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <form className="mt-6 space-y-3" onSubmit={saveSettings}>
              <label className="block text-sm font-semibold" htmlFor="protected-savings">
                Protected savings
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold text-ink/50">$</span>
                <input
                  id="protected-savings"
                  className="focus-ring min-h-12 min-w-0 flex-1 rounded-full border border-ink/12 bg-white px-4 text-base text-ink"
                  inputMode="numeric"
                  value={protectedSavings}
                  onChange={(event) => setProtectedSavings(event.target.value.replace(/[^\d]/g, ""))}
                />
                <button
                  type="submit"
                  className="focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-paper disabled:bg-ink/30"
                  aria-label="Save"
                  title="Save"
                >
                  <Save aria-hidden="true" size={18} />
                </button>
              </div>
            </form>

            <div className="mt-6 space-y-2 text-sm leading-6 text-ink/[0.62]">
              <p>Manual refresh only: {settings?.manualRefreshOnly === false ? "Off" : "On"}</p>
              <p>Consent: {settings?.privacyConsentAt ? "Accepted" : "Pending"}</p>
              <p>Last refresh: {formatLastRefresh(syncStatus)}</p>
              {connectionStatusMessage ? (
                <p className="font-semibold text-coral">{connectionStatusMessage}</p>
              ) : null}
              {latestSyncRunMessage ? <p className="font-semibold text-coral">{latestSyncRunMessage}</p> : null}
              {usage ? (
                <p>
                  Usage this month: {usage.freeCashViewCount} views, {usage.promptChipSelectionCount} chips,{" "}
                  {usage.aiQuestionCount} questions, {usage.agentFollowUpCount} follow-ups,{" "}
                  {usage.purchaseSimulationCount} spend tests, {usage.trueBalanceRevealCount} balance reveals,{" "}
                  {usage.missingCardNudgeShownCount} nudges, {usage.missingCardSuppressionCount} suppressions,{" "}
                  {usage.negativeFreeCashFollowUpCount} negative follow-ups,{" "}
                  {usage.estimatedModelCallCount} model calls, {usage.providerSyncCount} syncs
                  {usage.partialProviderSyncCount || usage.failedProviderSyncCount
                    ? ` (${usage.partialProviderSyncCount} partial, ${usage.failedProviderSyncCount} failed).`
                    : "."}
                </p>
              ) : null}
            </div>

            <div className="mt-auto space-y-3 pt-8">
              {status ? <p className="text-sm leading-6 text-ink/[0.62]">{status}</p> : null}
              <button
                type="button"
                className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/10 bg-white/80 px-4 text-sm font-semibold text-ink"
                onClick={connectData}
              >
                <Plug aria-hidden="true" size={17} />
                {getConnectLabel(syncStatus)}
              </button>
              <button
                type="button"
                className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/10 bg-white/80 px-4 text-sm font-semibold text-ink disabled:bg-ink/5 disabled:text-ink/35"
                onClick={refreshData}
                disabled={!refreshIsEnabled}
              >
                <RefreshCw aria-hidden="true" size={17} />
                {getRefreshLabel(syncStatus)}
              </button>
              {confirmingDelete ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm leading-6 text-red-800">Delete stored financial data?</p>
                  <button
                    type="button"
                    className="focus-ring mt-3 min-h-11 w-full rounded-full bg-red-700 px-4 text-sm font-semibold text-white"
                    onClick={deleteData}
                  >
                    Delete data
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-800"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 aria-hidden="true" size={17} />
                  Delete data
                </button>
              )}
              <button
                type="button"
                className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-ink/10 bg-white/80 px-4 text-sm font-semibold text-ink"
                onClick={signOut}
              >
                <LogOut aria-hidden="true" size={17} />
                Sign out
              </button>
              <div className="flex items-center justify-center gap-4 pt-2 text-xs font-semibold text-ink/[0.45]">
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
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}

function isPlaidConnectConfig(connect: ConnectSessionResponse["connect"]): connect is PlaidConnectConfig {
  return Boolean(
    connect &&
      connect.kind === "plaid" &&
      "linkToken" in connect &&
      typeof connect.linkToken === "string" &&
      "mode" in connect &&
      (connect.mode === "connect" || connect.mode === "repair"),
  );
}
