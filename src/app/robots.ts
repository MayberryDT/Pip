import type { MetadataRoute } from "next";
import { getMarketingOrigin } from "@/lib/marketing/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/how-it-works",
          "/security",
          "/support",
          "/privacy",
          "/terms",
          "/delete-account",
          "/blog",
        ],
        disallow: ["/api/", "/auth/", "/plaid/", "/app"],
      },
    ],
    sitemap: `${getMarketingOrigin()}/sitemap.xml`,
    host: getMarketingOrigin(),
  };
}
