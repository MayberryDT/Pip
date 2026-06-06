import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spendable",
    short_name: "Spendable",
    description: "A one-number daily spendable cash signal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8F3EA",
    theme_color: "#F8F3EA",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
