import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";
import "./globals.css";

const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export const metadata: Metadata = {
  metadataBase: new URL("https://spendwithpip.com"),
  applicationName: "Pip",
  title: {
    default: "Pip - The number your bank won't show you",
    template: "%s | Pip",
  },
  description:
    "Pip is a cute daily money companion that shows today's spending room before you spend.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Pip",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Pip - The number your bank won't show you",
    description:
      "Pip is a cute daily money companion that shows today's spending room before you spend.",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FCF9F8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaServiceWorkerRegistration />
        {children}
        {UMAMI_WEBSITE_ID ? (
          <Script
            defer
            src="https://analytics.animasai.co/script.js"
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
