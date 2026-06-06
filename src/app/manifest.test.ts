import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("keeps the install surface focused on the one-number app", () => {
    expect(manifest()).toMatchObject({
      name: "Spendable",
      short_name: "Spendable",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#F8F3EA",
      theme_color: "#F8F3EA",
      icons: [
        {
          src: "/icon.svg",
          type: "image/svg+xml",
          purpose: "maskable",
        },
      ],
    });
  });
});
