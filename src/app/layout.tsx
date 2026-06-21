import type { Metadata, Viewport } from "next";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";
import "./globals.css";

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
      </body>
    </html>
  );
}
