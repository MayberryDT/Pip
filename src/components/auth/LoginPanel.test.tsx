import { describe, expect, it } from "vitest";
import { shouldShowAndroidReviewerSignIn } from "@/components/auth/LoginPanel";

describe("LoginPanel", () => {
  it("shows Play reviewer sign-in only inside the Android shell", () => {
    expect(shouldShowAndroidReviewerSignIn("Mozilla/5.0 PipAndroid/1 VersionCode/13")).toBe(true);
    expect(shouldShowAndroidReviewerSignIn("Mozilla/5.0")).toBe(false);
    expect(shouldShowAndroidReviewerSignIn(null)).toBe(false);
  });
});
