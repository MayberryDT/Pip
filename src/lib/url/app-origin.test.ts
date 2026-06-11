import { describe, expect, it } from "vitest";
import { buildAppUrl, getAppOrigin } from "@/lib/url/app-origin";

describe("app origin helpers", () => {
  it("prefers the configured public site URL and strips paths", () => {
    const request = new Request("https://main--pip-mayberrydt.netlify.app/auth/callback");

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://pip-mayberrydt.netlify.app/some/path",
      }),
    ).toBe("https://pip-mayberrydt.netlify.app");
  });

  it("uses the stable Netlify site URL before a branch request URL", () => {
    const request = new Request("https://main--pip-mayberrydt.netlify.app/auth/callback");

    expect(
      buildAppUrl("/?auth=callback-failed", request, {
        URL: "https://pip-mayberrydt.netlify.app",
      }).toString(),
    ).toBe("https://pip-mayberrydt.netlify.app/?auth=callback-failed");
  });

  it("uses forwarded production headers before a deploy-prime URL", () => {
    const request = new Request("https://main--pip-mayberrydt.netlify.app/auth/callback", {
      headers: {
        "x-forwarded-host": "pip-mayberrydt.netlify.app",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getAppOrigin(request, {
        DEPLOY_PRIME_URL: "https://main--pip-mayberrydt.netlify.app",
      }),
    ).toBe("https://pip-mayberrydt.netlify.app");
  });

  it("falls back to the request URL when no deployment origin is available", () => {
    const request = new Request("http://localhost:3000/auth/callback");

    expect(getAppOrigin(request, {})).toBe("http://localhost:3000");
  });
});
