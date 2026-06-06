import type { PlaidConnectSession } from "@/lib/providers/FinancialDataProvider";

export const PLAID_LINK_TOKEN_STORAGE_KEY = "spendable.plaid.link_token";

const PLAID_SCRIPT_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const PLAID_SCRIPT_LOAD_TIMEOUT_MS = 12_000;

export type PlaidSuccessMetadata = {
  institution?: {
    name?: string;
    institution_id?: string;
  };
};

export type PlaidConnection = {
  publicToken: string | null;
  metadata: PlaidSuccessMetadata;
};

export type PlaidLinkConfig = Pick<PlaidConnectSession, "linkToken"> &
  Partial<Pick<PlaidConnectSession, "mode">>;

export type PlaidLinkResumeState = {
  linkToken: string;
  mode?: PlaidConnectSession["mode"];
};

declare global {
  interface Window {
    Plaid?: {
      create(input: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess(publicToken: string | null, metadata: PlaidSuccessMetadata): void;
        onExit(error: { error_message?: string } | null): void;
      }): {
        open(): void;
      };
    };
  }
}

export async function openPlaidLink(
  config: PlaidLinkConfig,
  options: {
    receivedRedirectUri?: string;
    persistToken?: boolean;
  } = {},
): Promise<PlaidConnection> {
  await loadPlaidScript();

  if (options.persistToken !== false) {
    persistPlaidLinkSession({
      linkToken: config.linkToken,
      mode: config.mode,
    });
  }

  return new Promise((resolve, reject) => {
    const handler = window.Plaid?.create({
      token: config.linkToken,
      receivedRedirectUri: options.receivedRedirectUri,
      onSuccess(publicToken, metadata) {
        clearPersistedPlaidLinkToken();
        resolve({
          publicToken,
          metadata,
        });
      },
      onExit(error) {
        reject(new Error(error?.error_message ?? "Plaid Link closed."));
      },
    });

    if (!handler) {
      reject(new Error("Plaid Link did not load."));
      return;
    }

    try {
      handler.open();
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Plaid Link could not open."));
    }
  });
}

export function getPersistedPlaidLinkToken(): string | null {
  return getPersistedPlaidLinkSession()?.linkToken ?? null;
}

export function getPersistedPlaidLinkSession(): PlaidLinkResumeState | null {
  try {
    const rawValue = window.localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as Partial<PlaidLinkResumeState>;

      if (typeof parsed.linkToken === "string" && parsed.linkToken.trim()) {
        return {
          linkToken: parsed.linkToken,
          mode: parsed.mode === "repair" ? "repair" : "connect",
        };
      }
    } catch {
      return {
        linkToken: rawValue,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function clearPersistedPlaidLinkToken() {
  try {
    window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore browsers that block localStorage in embedded contexts.
  }
}

function persistPlaidLinkSession(session: PlaidLinkResumeState) {
  try {
    window.localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // OAuth can still complete in normal desktop flows even if persistence is blocked.
  }
}

async function loadPlaidScript() {
  if (window.Plaid) {
    return;
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAID_SCRIPT_SRC}"]`);

  if (existing?.dataset.loadState === "failed") {
    existing.remove();
  } else if (existing) {
    await waitForPlaidScript(existing);
    return;
  }

  const script = document.createElement("script");
  script.src = PLAID_SCRIPT_SRC;
  script.dataset.loadState = "loading";
  document.body.appendChild(script);
  await waitForPlaidScript(script);
}

async function waitForPlaidScript(script: HTMLScriptElement) {
  if (window.Plaid) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      script.dataset.loadState = "failed";
      script.remove();
      reject(
        new Error(
          "Plaid is taking too long to open. Check pop-up or script blockers, then tap Connect data again.",
        ),
      );
    }, PLAID_SCRIPT_LOAD_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    }

    function handleLoad() {
      cleanup();
      script.dataset.loadState = "loaded";
      resolve();
    }

    function handleError() {
      cleanup();
      script.dataset.loadState = "failed";
      script.remove();
      reject(new Error("Plaid failed to load. Check pop-up or script blockers, then tap Connect data again."));
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
  });
}
