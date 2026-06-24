import { describe, expect, it } from "vitest";
import { getSafeAuthNextPath } from "@/lib/url/safe-next-path";

describe("getSafeAuthNextPath", () => {
  const origin = "https://spendwithpip.com";

  it.each([
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5Cevil.example",
    "/%2F%2Fevil.example",
    "/%2f%5cevil.example",
    "/app\nLocation:https://evil.example",
    "/pricing",
    "/welcome",
  ])("falls back to /app for unsafe auth next path %j", (next) => {
    expect(getSafeAuthNextPath(next, origin)).toBe("/app");
  });

  it.each([
    ["/app", "/app"],
    ["/app?auth=ok", "/app?auth=ok"],
    ["/app/settings", "/app/settings"],
    ["/app/settings?tab=accounts", "/app/settings?tab=accounts"],
    ["/admin", "/admin"],
    ["/admin?auth=ok", "/admin?auth=ok"],
  ])("allows app destination %j", (next, expected) => {
    expect(getSafeAuthNextPath(next, origin)).toBe(expected);
  });
});
