"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { trackMarketingEvent } from "@/components/marketing/trackMarketingEvent";

export function MarketingCtaLink({
  children,
  className,
  eventLabel,
  eventProperties,
  href,
}: {
  children: ReactNode;
  className: string;
  eventLabel: string;
  eventProperties?: Record<string, string | number | boolean | null>;
  href: string;
}) {
  return (
    <Link
      className={`${className} ui-pressable`}
      href={href}
      onClick={() => {
        void trackMarketingEvent("marketing_cta_clicked", {
          cta_label: eventLabel,
          href,
          page: window.location.pathname,
          ...(eventProperties ?? {}),
        });
      }}
    >
      {children}
    </Link>
  );
}
