import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  webServer: {
    command: "FREE_CASH_AI_MODE=mock-model FREE_CASH_SUPABASE_MODE=off npm run dev -- -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    viewport: {
      width: 390,
      height: 844,
    },
    launchOptions: {
      executablePath: "/usr/bin/google-chrome",
    },
  },
});
