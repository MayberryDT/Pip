import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";

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

    const response = await middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBe("https://spendwithpip.com/android-access");
  });

  it("does not rewrite normal web pricing requests", async () => {
    vi.stubEnv("PIP_SUPABASE_MODE", "off");
    const request = new NextRequest("https://spendwithpip.com/pricing", {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });

    const response = await middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
