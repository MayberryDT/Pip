import type { Metadata, Viewport } from "next";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Pip",
  title: "Pip",
  description: "Spendable cash for everyday life.",
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
    title: "Pip",
    description: "The number your bank won't show you.",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F8F3EA",
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
      </body>
    </html>
  );
}
