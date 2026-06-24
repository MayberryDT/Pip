"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, UserPlus } from "lucide-react";
import type { AdminWaitlistRow } from "@/lib/admin/waitlist";

type AdminControlCenterProps = {
  rows: AdminWaitlistRow[];
  summary: {
    waitlistCount: number;
    appWaitlistCount: number;
    activeGrantCount: number;
  };
};

type GrantStatus = {
  email: string;
  message: string;
};

export function AdminControlCenter({ rows, summary }: AdminControlCenterProps) {
  const [query, setQuery] = useState("");
  const [grantingEmail, setGrantingEmail] = useState<string | null>(null);
  const [grantStatus, setGrantStatus] = useState<GrantStatus | null>(null);
  const [localRows, setLocalRows] = useState(rows);
  const [localActiveGrantCount, setLocalActiveGrantCount] = useState(summary.activeGrantCount);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return localRows;
    }

    return localRows.filter((row) =>
      [row.email, row.normalizedEmail, row.sourcePage, row.lastSourcePage ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [localRows, query]);

  async function grantAccess(row: AdminWaitlistRow) {
    if (grantingEmail) {
      return;
    }

    setGrantingEmail(row.normalizedEmail);
    setGrantStatus(null);

    try {
      const response = await fetch("/api/admin/access-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          note: "Granted from /admin",
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getPayloadError(payload));
      }

      setLocalRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.normalizedEmail === row.normalizedEmail
            ? {
                ...currentRow,
                accessStatus: "active",
                accessGrantedAt: new Date().toISOString(),
                inviteEmailSentAt: hasSentInvitePayload(payload)
                  ? new Date().toISOString()
                  : currentRow.inviteEmailSentAt,
              }
            : currentRow,
        ),
      );
      if (row.accessStatus !== "active") {
        setLocalActiveGrantCount((currentCount) => currentCount + 1);
      }
      setGrantStatus({
        email: row.normalizedEmail,
        message: getGrantMessage(payload),
      });
    } catch (error) {
      setGrantStatus({
        email: row.normalizedEmail,
        message: error instanceof Error ? error.message : "Grant failed.",
      });
    } finally {
      setGrantingEmail(null);
    }
  }

  return (
    <main className="pip-app-shell min-h-screen px-5 py-6 text-ink">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="glass-panel px-5 py-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-taupe">Admin</p>
              <h1 className="font-display mt-2 text-[2.4rem] leading-none text-ink">Pip Control Center</h1>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Metric label="Waitlist" value={summary.waitlistCount} />
              <Metric label="App requests" value={summary.appWaitlistCount} />
              <Metric label="Active" value={localActiveGrantCount} />
            </div>
          </div>
        </div>

        <div className="glass-panel px-4 py-4">
          <label className="flex min-h-12 items-center gap-2 rounded-full border border-line bg-white/75 px-4">
            <Search aria-hidden="true" size={17} strokeWidth={2.4} />
            <span className="sr-only">Search waitlist</span>
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-taupe"
              placeholder="Search email or source"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        {filteredRows.length > 0 ? (
          <div className="grid gap-3">
            {filteredRows.map((row) => (
              <article className="glass-panel px-4 py-4" key={row.normalizedEmail}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-bold text-ink">{row.email}</p>
                    <p className="mt-1 text-xs font-semibold text-taupe">
                      {row.lastSourcePage ?? row.sourcePage} ·{" "}
                      {formatDate(row.appWaitlistLastRequestedAt ?? row.newsletterOptInAt)}
                    </p>
                    {grantStatus?.email === row.normalizedEmail ? (
                      <p className="mt-2 text-xs font-semibold text-taupe" role="status">
                        {grantStatus.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={row.accessStatus} />
                    <button
                      className="focus-ring ui-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-paper disabled:bg-ink/35"
                      disabled={row.accessStatus === "active" || grantingEmail === row.normalizedEmail}
                      type="button"
                      onClick={() => grantAccess(row)}
                    >
                      <UserPlus aria-hidden="true" size={16} strokeWidth={2.4} />
                      <span>{grantingEmail === row.normalizedEmail ? "Granting..." : "Grant access"}</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="glass-panel px-5 py-6 text-sm font-semibold text-taupe">No waitlist rows yet.</div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1 py-1">
      <p className="text-lg font-black text-ink">{value}</p>
      <p className="text-[0.68rem] font-bold uppercase tracking-normal text-taupe">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: AdminWaitlistRow["accessStatus"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-moss/30 bg-moss/10 px-3 text-xs font-bold text-moss">
        <ShieldCheck aria-hidden="true" size={14} strokeWidth={2.4} />
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-white/55 px-3 text-xs font-bold text-taupe">
      {status === "revoked" ? "Revoked" : "Waitlisted"}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No timestamp";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPayloadError(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return "Grant failed.";
}

function getGrantMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "inviteEmailStatus" in payload) {
    return `Access granted. Invite email: ${String(payload.inviteEmailStatus)}.`;
  }

  return "Access granted.";
}

function hasSentInvitePayload(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "inviteEmailStatus" in payload &&
      payload.inviteEmailStatus === "sent",
  );
}
