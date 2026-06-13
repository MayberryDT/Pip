"use client";

import { useEffect } from "react";
import { trackMarketingEvent } from "@/components/marketing/trackMarketingEvent";

export function ArticleViewEvent({ slug, tags }: { slug: string; tags: string[] }) {
  useEffect(() => {
    void trackMarketingEvent("blog_article_viewed", {
      page: `/blog/${slug}`,
      slug,
      article_tags: tags.join(","),
    });
  }, [slug, tags]);

  return null;
}
