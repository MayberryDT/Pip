import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { SENSITIVE_JSON_CACHE_CONTROL, sensitiveJson } from "@/lib/security/http-cache";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://cdn.plaid.com https://*.plaid.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.plaid.com https://connect.teller.io",
  "frame-src 'self' https://cdn.plaid.com https://*.plaid.com https://connect.teller.io",
  "form-action 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

const hsts = "max-age=31536000; includeSubDomains; preload";

const sensitiveRouteFiles = [
  "src/app/api/account/delete/route.ts",
  "src/app/api/agent/route.ts",
  "src/app/api/auth/consent/route.ts",
  "src/app/api/auth/reviewer-login/route.ts",
  "src/app/api/auth/sign-in/route.ts",
  "src/app/api/auth/sign-out/route.ts",
  "src/app/api/delete-data/route.ts",
  "src/app/api/email/unsubscribe/route.ts",
  "src/app/api/email/resend-webhook/route.ts",
  "src/app/api/missing-card-preferences/route.ts",
  "src/app/api/operator/agent-chats/route.ts",
  "src/app/api/operator/access-grants/route.ts",
  "src/app/api/operator/email-list/route.ts",
  "src/app/api/operator/overview/route.ts",
  "src/app/api/pip-cash/route.ts",
  "src/app/api/pip/reactions/seen/route.ts",
  "src/app/api/providers/connect/route.ts",
  "src/app/api/providers/plaid/exchange/route.ts",
  "src/app/api/providers/teller/enrollment/route.ts",
  "src/app/api/providers/teller/health/route.ts",
  "src/app/api/savings-goals/[goalId]/route.ts",
  "src/app/api/savings-goals/route.ts",
  "src/app/api/settings/route.ts",
  "src/app/api/sync/app-open/route.ts",
  "src/app/api/sync/manual/route.ts",
  "src/app/api/sync/status/route.ts",
  "src/app/api/usage/route.ts",
];

describe("security headers", () => {
  it("sets conservative privacy headers for app and API responses", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toEqual([
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Strict-Transport-Security",
            value: hsts,
          },
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

    expect(netlifyToml).toContain(`Content-Security-Policy = "${contentSecurityPolicy}"`);
    expect(netlifyToml).toContain(`Strict-Transport-Security = "${hsts}"`);
    expect(netlifyToml).toContain('X-Frame-Options = "DENY"');
    expect(netlifyToml).toContain('X-Content-Type-Options = "nosniff"');
    expect(netlifyToml).toContain('Referrer-Policy = "no-referrer"');
    expect(netlifyToml).toContain(
      'Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=()"',
    );
  });

  it("marks sensitive JSON responses private and no-store", async () => {
    const response = sensitiveJson({ status: "ok" }, {
      status: 202,
      headers: {
        "Retry-After": "30",
      },
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe(SENSITIVE_JSON_CACHE_CONTROL);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("keeps sensitive API routes on the no-store JSON helper", () => {
    sensitiveRouteFiles.forEach((filePath) => {
      const source = readFileSync(join(process.cwd(), filePath), "utf8");

      expect(source, filePath).toContain("sensitiveJson");
      expect(source, filePath).not.toContain("NextResponse.json");
    });
  });

  it("keeps the legacy free-cash API on the no-store pip-cash handler", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/free-cash/route.ts"), "utf8");

    expect(source.trim()).toBe('export { GET } from "@/app/api/pip-cash/route";');
  });
});
