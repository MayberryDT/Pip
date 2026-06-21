import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("blog article hero image framing", () => {
  it("uses a contained article hero figure so covers are not cropped", () => {
    const pageSource = readFileSync(join(process.cwd(), "src/app/blog/[slug]/page.tsx"), "utf8");
    const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(pageSource).toContain('className="article-hero-figure"');
    expect(globalCss).toMatch(new RegExp("\\.editorial-site\\s+\\.article-hero-figure\\s*\\{[\\s\\S]*aspect-ratio:\\s*16\\s*/\\s*9"));
    expect(globalCss).toMatch(new RegExp("\\.editorial-site\\s+\\.article-hero-figure\\s+img\\s*\\{[\\s\\S]*object-fit:\\s*contain"));
  });

  it("gives the desktop article hero image enough grid width", () => {
    const pageSource = readFileSync(join(process.cwd(), "src/app/blog/[slug]/page.tsx"), "utf8");
    const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(pageSource).toContain('className="article-hero-media col-span-12 lg:col-span-5 lg:col-start-8"');
    expect(globalCss).toMatch(new RegExp("\\.article-hero-media\\s*\\{[\\s\\S]*align-self:\\s*center"));
    expect(globalCss).toMatch(new RegExp("\\.article-hero-figure\\s*\\{[\\s\\S]*width:\\s*100%"));
  });

  it("lets mobile article titles use the full content width", () => {
    const pageSource = readFileSync(join(process.cwd(), "src/app/blog/[slug]/page.tsx"), "utf8");
    const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(pageSource).toContain('className="article-hero-title mt-6 max-w-5xl"');
    expect(globalCss).toMatch(
      new RegExp("@media \\(max-width:\\s*767px\\)\\s*\\{[\\s\\S]*\\.editorial-site\\s+\\.article-hero-title\\s*\\{[\\s\\S]*max-width:\\s*none")
    );
  });
});
