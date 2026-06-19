import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./src/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware", () => {
  it("rewrites Android pricing requests to the Android access page before rendering prices", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/pricing", {
      headers: {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/12",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://spendwithpip.com/android-access");
  });

  it("redirects Android root marketing requests to the app", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/", {
      headers: {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("location")).toBe("https://spendwithpip.com/app");
  });

  it("redirects Android risky marketing pages to the app", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/how-it-works", {
      headers: {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("location")).toBe("https://spendwithpip.com/app");
  });

  it("redirects Android llms copy requests to the app", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/llms.txt", {
      headers: {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("location")).toBe("https://spendwithpip.com/app");
  });

  it("does not redirect Android legal/support requests", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/privacy", {
      headers: {
        "user-agent": "Mozilla/5.0 PipAndroid/1 VersionCode/13",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("does not rewrite normal web pricing requests", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/pricing", {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
