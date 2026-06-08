import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("keeps the install surface focused on the one-number app", () => {
    expect(manifest()).toMatchObject({
      name: "Pip",
      short_name: "Pip",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#F8F3EA",
      theme_color: "#F8F3EA",
      icons: [
        {
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-maskable-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
  });

  it("ships generated PNG app icons at install-required sizes", () => {
    expect(readPngInfo("public/icon-192.png")).toEqual({ width: 192, height: 192, colorType: 2 });
    expect(readPngInfo("public/icon-512.png")).toEqual({ width: 512, height: 512, colorType: 2 });
    expect(readPngInfo("public/icon-maskable-192.png")).toEqual({ width: 192, height: 192, colorType: 2 });
    expect(readPngInfo("public/icon-maskable-512.png")).toEqual({ width: 512, height: 512, colorType: 2 });
    expect(readPngInfo("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180, colorType: 2 });
  });

  it("points layout metadata at the generated PNG icons", () => {
    const source = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(source).toContain("/icon-192.png");
    expect(source).toContain("/icon-512.png");
    expect(source).toContain("/apple-touch-icon.png");
    expect(source).not.toContain('apple: "/icon.svg"');
  });

  it("registers a privacy-safe service worker with an offline fallback", () => {
    const serviceWorkerPath = join(process.cwd(), "public/sw.js");
    const offlinePath = join(process.cwd(), "public/offline.html");

    expect(existsSync(serviceWorkerPath)).toBe(true);
    expect(existsSync(offlinePath)).toBe(true);

    const source = readFileSync(serviceWorkerPath, "utf8");

    expect(source).toContain("/offline.html");
    expect(source).toContain("/_next/static/");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/auth")');
    expect(source).toContain('url.pathname.includes("/providers/")');
    expect(source).toContain('url.pathname.includes("/sync/")');
    expect(source).toContain('url.pathname.includes("/agent")');
    expect(source).toContain('url.pathname.includes("/events")');
    expect(source).toContain('url.pathname.includes("/free-cash")');
  });
});

function readPngInfo(path: string): { width: number; height: number; colorType: number } {
  const buffer = readFileSync(join(process.cwd(), path));

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}
