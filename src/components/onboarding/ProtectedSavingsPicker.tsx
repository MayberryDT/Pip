"use client";

import { useMemo, useState } from "react";

type SaveStatus = "idle" | "saving" | "error";

const quickAmounts = [
  { amountCents: 10000, label: "$100" },
  { amountCents: 20000, label: "$200", badge: "Recommended" },
  { amountCents: 25000, label: "$250" },
  { amountCents: 50000, label: "$500" },
] as const;

const maxProtectedSavingsCents = 10_000_000;

export function ProtectedSavingsPicker({
  initialAmountCents = 20000,
  onSave,
  idPrefix = "onboarding",
}: {
  initialAmountCents?: number;
  onSave: (amountCents: number) => Promise<void>;
  idPrefix?: string;
}) {
  const [amountText, setAmountText] = useState(() => dollarsFromCents(initialAmountCents));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const amountCents = useMemo(() => centsFromDollarText(amountText), [amountText]);
  const amountLabel = formatCushionAmount(amountCents);
  const inputId = `${idPrefix}-savings-cushion`;
  const isSaving = status === "saving";

  async function saveAmount() {
    if (amountCents > maxProtectedSavingsCents) {
      setStatus("error");
      setError("Keep the cushion at $100,000 or less.");
      return;
    }

    setStatus("saving");
    setError("");

    try {
      await onSave(amountCents);
    } catch (saveError) {
      setStatus("error");
      setError(getSaveErrorText(saveError));
    }
  }

  return (
    <div className="space-y-3" data-testid="protected-savings-picker">
      <div>
        <p className="text-xs font-bold uppercase tracking-normal text-taupe">Savings cushion</p>
        <p className="mt-1 text-xs leading-5 text-ink/[0.62]">
          Pick a monthly amount for Pip to keep out of your spendable cash.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Savings cushion options">
        {quickAmounts.map((option) => {
          const active = amountCents === option.amountCents;

          return (
            <button
              key={option.amountCents}
              type="button"
              className={[
                "focus-ring min-h-10 shrink-0 rounded-full border px-3 text-xs font-semibold transition",
                active
                  ? "border-moss/35 bg-moss text-paper shadow-[0_10px_24px_rgba(83,101,79,0.16)]"
                  : "border-ink/10 bg-white/62 text-ink/[0.72] hover:bg-white/82",
              ].join(" ")}
              aria-pressed={active}
              disabled={isSaving}
              onClick={() => setAmountText(dollarsFromCents(option.amountCents))}
            >
              <span>{option.label}</span>
              {"badge" in option ? <span className="ml-1 text-[0.68rem] opacity-[0.78]">{option.badge}</span> : null}
            </button>
          );
        })}
      </div>

      <label className="block text-xs font-bold uppercase tracking-normal text-taupe" htmlFor={inputId}>
        Custom amount
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-full border border-ink/12 bg-white/72 px-4 shadow-[0_12px_34px_rgba(23,26,31,0.07)]">
        <span className="text-base font-semibold text-ink/46">$</span>
        <input
          id={inputId}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/34"
          inputMode="numeric"
          value={amountText}
          disabled={isSaving}
          placeholder="200"
          onChange={(event) => {
            setAmountText(sanitizeDollarText(event.target.value));
            if (status === "error") {
              setStatus("idle");
              setError("");
            }
          }}
        />
      </div>

      <button
        type="button"
        className="focus-ring min-h-11 w-full rounded-full bg-ink px-5 text-sm font-semibold text-paper shadow-[0_12px_34px_rgba(23,26,31,0.12)] transition disabled:bg-ink/30"
        disabled={isSaving}
        onClick={saveAmount}
      >
        {isSaving ? "Saving cushion..." : `Use ${amountLabel} cushion`}
      </button>

      <p className="text-xs leading-5 text-ink/50">You can change this later.</p>
      {error ? (
        <p className="rounded-[10px] border border-red-200 bg-red-50/80 px-3 py-2 text-sm leading-6 text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function sanitizeDollarText(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 6);
}

function centsFromDollarText(value: string): number {
  return Math.max(0, Math.round(Number(sanitizeDollarText(value) || "0") * 100));
}

function dollarsFromCents(amountCents: number): string {
  return String(Math.max(0, Math.round(amountCents / 100)));
}

function formatCushionAmount(amountCents: number): string {
  return `$${Math.round(amountCents / 100).toLocaleString("en-US")}`;
}

function getSaveErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "I couldn’t save that cushion yet. Please try again.";
}

export const __protectedSavingsPickerTestHooks = {
  centsFromDollarText,
  sanitizeDollarText,
  formatCushionAmount,
};
