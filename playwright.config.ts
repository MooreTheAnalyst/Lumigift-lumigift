import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const shouldStartWebServer = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(baseURL);

export default defineConfig({
  testDir: "./e2e",
  // Exclude visual regression tests — those run under playwright.visual.config.ts
  testIgnore: ["**/visual/**"],
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Capture screenshot and video on failure for easier CI debugging
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(shouldStartWebServer
    ? {
        // In CI the build has already run; start the production server.
        // Locally, reuse whatever is already running (dev or prod).
        webServer: {
          command: process.env.CI ? "npm run start" : "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // Pipe server output to the test runner so failures are easier to diagnose.
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }
    : {}),
});
