import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/components",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/component-gallery",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
