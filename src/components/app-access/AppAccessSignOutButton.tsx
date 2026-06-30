"use client";

import { useState } from "react";

type SignOutOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: boolean }>;
  assign?: (url: string) => void;
};

export async function signOutAndRedirect({
  fetcher = fetch,
  assign = (url) => window.location.assign(url),
}: SignOutOptions = {}) {
  const response = await fetcher("/api/auth/sign-out", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Sign-out failed.");
  }

  assign("/app");
}

export function AppAccessSignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setError("");

    try {
      await signOutAndRedirect();
    } catch {
      setError("Sign-out failed. Try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-full border border-ink/15 bg-white/70 px-5 text-base font-semibold text-ink transition disabled:text-ink/45"
        disabled={isSigningOut}
        onClick={onClick}
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </button>
      {error ? <p className="text-center text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
