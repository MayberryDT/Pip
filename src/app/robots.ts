import type { MetadataRoute } from "next";

const appOrigin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/api/", "/auth/", "/plaid/", "/admin"],
      },
    ],
    sitemap: `${appOrigin}/sitemap.xml`,
    host: appOrigin,
  };
}
