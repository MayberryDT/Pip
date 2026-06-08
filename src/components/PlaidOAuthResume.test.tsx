import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PlaidOAuthResume,
  resumePlaidOAuthConnection,
} from "@/components/PlaidOAuthResume";

const plaidMocks = vi.hoisted(() => ({
  clearPersistedPlaidLinkToken: vi.fn(),
  getPersistedPlaidLinkSession: vi.fn(),
  openPlaidLink: vi.fn(),
}));

vi.mock("@/lib/providers/plaid/link-browser", () => ({
  clearPersistedPlaidLinkToken: plaidMocks.clearPersistedPlaidLinkToken,
  getPersistedPlaidLinkSession: plaidMocks.getPersistedPlaidLinkSession,
  openPlaidLink: plaidMocks.openPlaidLink,
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "ok" })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PlaidOAuthResume", () => {
  it("renders the secure connection shell", () => {
    const markup = renderToStaticMarkup(<PlaidOAuthResume />);

    expect(markup).toContain("Spendable");
    expect(markup).toContain("Finishing your secure Plaid connection.");
  });

  it("resumes Plaid OAuth, exchanges the public token, refreshes Plaid data, and clears the stored token", async () => {
    plaidMocks.openPlaidLink.mockResolvedValue({
      publicToken: "public-token-123",
      metadata: {
        institution: {
          name: "Northstar Bank",
        },
      },
    });
    const fetchMock = vi.mocked(fetch);

    await resumePlaidOAuthConnection({
      linkToken: "link-oauth-123",
      mode: "connect",
      receivedRedirectUri: "https://free-cash-mayberrydt.netlify.app/plaid/oauth?oauth_state_id=state-1",
    });

    expect(plaidMocks.openPlaidLink).toHaveBeenCalledWith(
      {
        linkToken: "link-oauth-123",
        mode: "connect",
      },
      {
        receivedRedirectUri: "https://free-cash-mayberrydt.netlify.app/plaid/oauth?oauth_state_id=state-1",
        persistToken: false,
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/providers/plaid/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publicToken: "public-token-123",
        metadata: {
          institution: {
            name: "Northstar Bank",
          },
        },
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/sync/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "plaid",
        reason: "manual",
      }),
    });
    expect(plaidMocks.clearPersistedPlaidLinkToken).toHaveBeenCalled();
  });

  it("runs repair sync without exchanging a public token", async () => {
    plaidMocks.openPlaidLink.mockResolvedValue({
      publicToken: null,
      metadata: {},
    });
    const fetchMock = vi.mocked(fetch);

    await resumePlaidOAuthConnection({
      linkToken: "link-repair-123",
      mode: "repair",
      receivedRedirectUri: "https://free-cash-mayberrydt.netlify.app/plaid/oauth?oauth_state_id=state-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/sync/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "plaid",
        reason: "repair",
      }),
    });
    expect(plaidMocks.clearPersistedPlaidLinkToken).toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}
