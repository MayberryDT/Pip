import { describe, expect, it } from "vitest";
import { buildAppUrl, getAppOrigin } from "@/lib/url/app-origin";

describe("app origin helpers", () => {
  it("prefers the configured public site URL and strips paths", () => {
    const request = new Request("https://main--spendwithpip.netlify.app/auth/callback");

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://spendwithpip.com/some/path",
      }),
    ).toBe("https://spendwithpip.com");
  });

  it("ignores legacy Netlify site URL values and uses the forwarded production host", () => {
    const request = new Request("https://spendwithpip.com/api/auth/oauth/google", {
      headers: {
        "x-forwarded-host": "spendwithpip.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://free-cash-mayberrydt.netlify.app",
      }),
    ).toBe("https://spendwithpip.com");
  });

  it("ignores legacy Netlify branch aliases before deploy-prime fallbacks", () => {
    const request = new Request("https://spendwithpip.netlify.app/auth/callback");

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://main--pip-mayberrydt.netlify.app",
        URL: "https://free-cash-mayberrydt.netlify.app",
        DEPLOY_PRIME_URL: "https://main--spendwithpip.netlify.app",
      }),
    ).toBe("https://main--spendwithpip.netlify.app");
  });

  it("uses the stable Netlify site URL before a branch request URL", () => {
    const request = new Request("https://main--spendwithpip.netlify.app/auth/callback");

    expect(
      buildAppUrl("/?auth=callback-failed", request, {
        URL: "https://spendwithpip.com",
      }).toString(),
    ).toBe("https://spendwithpip.com/?auth=callback-failed");
  });

  it("uses forwarded production headers before a deploy-prime URL", () => {
    const request = new Request("https://main--spendwithpip.netlify.app/auth/callback", {
      headers: {
        "x-forwarded-host": "spendwithpip.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getAppOrigin(request, {
        DEPLOY_PRIME_URL: "https://main--spendwithpip.netlify.app",
      }),
    ).toBe("https://spendwithpip.com");
  });

  it("falls back to the request URL when no deployment origin is available", () => {
    const request = new Request("http://localhost:3000/auth/callback");

    expect(getAppOrigin(request, {})).toBe("http://localhost:3000");
  });
});
