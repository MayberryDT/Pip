"use client";

import { useEffect } from "react";
import { trackMarketingEvent } from "@/components/marketing/WaitlistForm";

export function MarketingPageView() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    void trackMarketingEvent("marketing_page_view", {
      page: window.location.pathname,
      referrer: document.referrer || null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    });
  }, []);

  return null;
}
