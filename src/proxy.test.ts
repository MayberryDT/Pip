import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("does not proxy every public marketing route by default", () => {
    expect(config.matcher).toEqual([
      "/app/:path*",
      "/auth/:path*",
      "/api/:path*",
      "/plaid/oauth",
      "/reviewer-login",
      "/",
      "/pricing/:path*",
      "/checkout/:path*",
      "/billing/:path*",
      "/subscribe/:path*",
      "/subscription/:path*",
      "/upgrade/:path*",
      "/how-it-works/:path*",
      "/how-the-number-works/:path*",
      "/blog/:path*",
      "/llms.txt",
    ]);
  });

  it("keeps the Android shell restriction paths inside the narrowed matcher", () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining([
        "/",
        "/pricing/:path*",
        "/checkout/:path*",
        "/billing/:path*",
        "/subscribe/:path*",
        "/subscription/:path*",
        "/upgrade/:path*",
        "/how-it-works/:path*",
        "/how-the-number-works/:path*",
        "/blog/:path*",
        "/llms.txt",
      ]),
    );
    expect(config.matcher).not.toContain("/security");
    expect(config.matcher).not.toContain("/support");
  });
});
