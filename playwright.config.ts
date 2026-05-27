import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Load e2e-specific env vars (never reuse .env.dev — prevents LIVEKIT_E2E_MOCK leakage)
dotenv.config({ path: ".env.test.e2e" });

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./playwright-results",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],

  projects: [
    {
      name: "setup",
      testMatch: "**/*.setup.ts",
    },
    {
      name: "e2e",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/host.json",
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      },
    },
  ],

  webServer: {
    command: "pnpm --filter @yelli/web dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Propagate mock guard to the Next.js dev server process
      LIVEKIT_E2E_MOCK: process.env.LIVEKIT_E2E_MOCK ?? "false",
    },
  },
});
