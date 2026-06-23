import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  "https://cdn.plaid.com",
  "https://*.plaid.com",
  "https://analytics.animasai.co",
].join(" ");

const connectSources = [
  "'self'",
  ...(process.env.NODE_ENV === "development" ? ["ws:", "http://localhost:*"] : []),
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.plaid.com",
  "https://connect.teller.io",
  "https://analytics.animasai.co",
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src ${scriptSources}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSources}`,
      "frame-src 'self' https://cdn.plaid.com https://*.plaid.com https://connect.teller.io",
      "form-action 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
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
];

export default nextConfig;
