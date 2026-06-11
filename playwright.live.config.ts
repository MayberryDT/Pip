import { defineConfig } from "@playwright/test";

const liveBaseURL =
  process.env.PIP_LIVE_BASE_URL ?? "https://spendwithpip.com";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /live-authenticated-onboarding\.spec\.ts/,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: liveBaseURL,
    viewport: {
      width: 390,
      height: 844,
    },
    launchOptions: {
      executablePath: "/usr/bin/google-chrome",
    },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
