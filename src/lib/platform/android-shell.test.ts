import { describe, expect, it } from "vitest";
import {
  getClientPipPlatform,
  isAndroidAppShellHeaders,
  isAndroidAppShellUserAgent,
  isAndroidPaymentRestrictedPath,
} from "@/lib/platform/android-shell";

describe("android shell platform detection", () => {
  it("detects the native shell user-agent suffix", () => {
    expect(isAndroidAppShellUserAgent("Mozilla/5.0 PipAndroid/1 VersionCode/12")).toBe(true);
    expect(isAndroidAppShellUserAgent("Mozilla/5.0")).toBe(false);
    expect(getClientPipPlatform("Mozilla/5.0 PipAndroid/1")).toBe("android_webview");
  });

  it("detects Android shell headers", () => {
    expect(
      isAndroidAppShellHeaders({
        get: (name) => (name === "user-agent" ? "PipAndroid/1" : null),
      }),
    ).toBe(true);
  });

  it("restricts known payment paths for Android", () => {
    expect(isAndroidPaymentRestrictedPath("/pricing")).toBe(true);
    expect(isAndroidPaymentRestrictedPath("/pricing/monthly")).toBe(true);
    expect(isAndroidPaymentRestrictedPath("/checkout")).toBe(true);
    expect(isAndroidPaymentRestrictedPath("/support")).toBe(false);
  });
});
