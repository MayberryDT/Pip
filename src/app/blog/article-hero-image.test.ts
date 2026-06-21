import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("blog article hero image framing", () => {
  it("uses a contained article hero figure so covers are not cropped", () => {
    const pageSource = readFileSync(join(process.cwd(), "src/app/blog/[slug]/page.tsx"), "utf8");
    const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(pageSource).toContain('className="article-hero-figure"');
    expect(globalCss).toMatch(new RegExp("\\.article-hero-figure\\s*\\{[\\s\\S]*aspect-ratio:\\s*16\\s*/\\s*9"));
    expect(globalCss).toMatch(new RegExp("\\.article-hero-figure\\s+img\\s*\\{[\\s\\S]*object-fit:\\s*contain"));
  });
});
