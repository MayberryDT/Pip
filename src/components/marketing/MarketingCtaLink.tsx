"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { trackMarketingEvent } from "@/components/marketing/WaitlistForm";

export function MarketingCtaLink({
  children,
  className,
  eventLabel,
  href,
}: {
  children: ReactNode;
  className: string;
  eventLabel: string;
  href: string;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => {
        void trackMarketingEvent("marketing_cta_clicked", {
          cta_label: eventLabel,
          href,
          page: window.location.pathname,
        });
      }}
    >
      {children}
    </Link>
  );
}
