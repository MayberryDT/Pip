import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers", () => {
  it("sets conservative privacy headers for app and API responses", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toEqual([
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ]);
  });

  it("keeps matching Netlify CDN headers for static assets", () => {
    const netlifyToml = readFileSync(join(process.cwd(), "netlify.toml"), "utf8");

    expect(netlifyToml).toContain('X-Frame-Options = "DENY"');
    expect(netlifyToml).toContain('X-Content-Type-Options = "nosniff"');
    expect(netlifyToml).toContain('Referrer-Policy = "no-referrer"');
    expect(netlifyToml).toContain(
      'Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=()"',
    );
  });
});
