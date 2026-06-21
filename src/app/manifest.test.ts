import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("keeps the install surface focused on the one-number app", () => {
    expect(manifest()).toMatchObject({
      id: "/app",
      name: "Pip",
      short_name: "Pip",
      start_url: "/app",
      scope: "/",
      display: "standalone",
      display_override: ["standalone", "minimal-ui"],
      orientation: "portrait",
      prefer_related_applications: false,
      categories: ["finance", "productivity"],
      lang: "en-US",
      dir: "ltr",
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
    expect(readPngInfo("public/icon-192.png")).toEqual({ width: 192, height: 192, colorType: 6 });
    expect(readPngInfo("public/icon-512.png")).toEqual({ width: 512, height: 512, colorType: 6 });
    expect(readPngInfo("public/icon-maskable-192.png")).toEqual({ width: 192, height: 192, colorType: 6 });
    expect(readPngInfo("public/icon-maskable-512.png")).toEqual({ width: 512, height: 512, colorType: 6 });
    expect(readPngInfo("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180, colorType: 6 });
  });

  it("keeps icon corners transparent so favicons and phone shortcuts render softly", async () => {
    await expectTransparentCorners("public/icon.png");
    await expectTransparentCorners("public/icon-192.png");
    await expectTransparentCorners("public/icon-512.png");
    await expectTransparentCorners("public/apple-touch-icon.png");
  });

  it("keeps native Android launcher corners transparent", async () => {
    const adaptiveIconSource = readFileSync(
      join(process.cwd(), "mobile/android-webview/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"),
      "utf8",
    );

    expect(adaptiveIconSource).not.toContain("@android:color/white");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-mdpi/ic_launcher.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-hdpi/ic_launcher.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xhdpi/ic_launcher.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xxhdpi/ic_launcher.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-mdpi/ic_maskable.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-hdpi/ic_maskable.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xhdpi/ic_maskable.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xxhdpi/ic_maskable.png");
    await expectTransparentCorners("mobile/android-webview/app/src/main/res/mipmap-xxxhdpi/ic_maskable.png");
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
    const registrationPath = join(process.cwd(), "src/components/PwaServiceWorkerRegistration.tsx");

    expect(existsSync(serviceWorkerPath)).toBe(true);
    expect(existsSync(offlinePath)).toBe(true);

    const source = readFileSync(serviceWorkerPath, "utf8");

    expect(source).toContain('const STATIC_CACHE_NAME = "pip-static-v8"');
    expect(source).toContain("/offline.html");
    expect(source).toContain("/brand/pip-logo.png");
    expect(source).toContain("/brand/pip-character/v001/avatar/normal.png");
    expect(source).toContain("/brand/pip-character/v001/medium/onboarding-wave.png");
    expect(source).toContain("/_next/static/");
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/auth")');
    expect(source).toContain('url.pathname.includes("/providers/")');
    expect(source).toContain('url.pathname.includes("/sync/")');
    expect(source).toContain('url.pathname.includes("/agent")');
    expect(source).toContain('url.pathname.includes("/events")');
    expect(source).toContain('url.pathname.includes("/pip-cash")');

    const registrationSource = readFileSync(registrationPath, "utf8");

    expect(registrationSource).toContain('process.env.NODE_ENV === "development"');
    expect(registrationSource).toContain("getRegistrations");
    expect(registrationSource).toContain("cacheName.startsWith(\"pip-\")");
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

async function expectTransparentCorners(path: string): Promise<void> {
  const { data, info } = await sharp(join(process.cwd(), path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cornerIndexes = [
    0,
    (info.width - 1) * 4,
    (info.height - 1) * info.width * 4,
    (info.height * info.width - 1) * 4,
  ];

  for (const index of cornerIndexes) {
    expect(data[index + 3]).toBe(0);
  }
}
