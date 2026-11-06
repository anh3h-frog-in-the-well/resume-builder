import { defineConfig, devices } from "@playwright/test";
import { e2eBaseUrl, e2eServerEnv } from "./tests/e2e/support/env";

const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests run the real Next.js app in a browser while every backend
 * dependency is faked (see tests/e2e/support/env.ts). No MySQL or Ollama server
 * is required.
 *
 * Set E2E_SERVER=production to run against `next build && next start`
 * instead of the dev server.
 */
const serverCommand =
  process.env.E2E_SERVER === "production"
    ? "npm run build && npm run start"
    : "npm run dev";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./tests/e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: serverCommand,
    url: `${e2eBaseUrl}/login`,
    env: e2eServerEnv,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
