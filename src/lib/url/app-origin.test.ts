import { describe, expect, it } from "vitest";
import { buildAppUrl, getAppOrigin } from "@/lib/url/app-origin";

describe("app origin helpers", () => {
  it("prefers the configured public site URL and strips paths", () => {
    const request = new Request("https://preview.example.com/auth/callback");

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000/some/path",
      }),
    ).toBe("http://localhost:3000");
  });

  it("uses the configured site URL before forwarded host headers", () => {
    const request = new Request("http://localhost:3000/api/auth/oauth/google", {
      headers: {
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getAppOrigin(request, {
        NEXT_PUBLIC_SITE_URL: "https://demo.example.com",
      }),
    ).toBe("https://demo.example.com");
  });

  it("uses URL before forwarded host headers", () => {
    const request = new Request("https://preview.example.com/auth/callback");

    expect(
      getAppOrigin(request, {
        URL: "https://demo.example.com",
      }),
    ).toBe("https://demo.example.com");
  });

  it("uses the stable site URL before a branch request URL", () => {
    const request = new Request("https://preview.example.com/auth/callback");

    expect(
      buildAppUrl("/?auth=callback-failed", request, {
        URL: "http://localhost:3000",
      }).toString(),
    ).toBe("http://localhost:3000/?auth=callback-failed");
  });

  it("uses forwarded headers before the request URL", () => {
    const request = new Request("https://preview.example.com/auth/callback", {
      headers: {
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getAppOrigin(request, {}),
    ).toBe("https://localhost:3000");
  });

  it("falls back to the request URL when no deployment origin is available", () => {
    const request = new Request("http://localhost:3000/auth/callback");

    expect(getAppOrigin(request, {})).toBe("http://localhost:3000");
  });
});
