import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The cloud image ships a prebuilt Chromium; use it when present so no
// browser download is needed. Everywhere else Playwright's own browser runs.
const prebuilt = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(prebuilt) ? prebuilt : undefined);

const PORT = 4322;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    // Serves the production build in dist/ (run `bun run build` first).
    command: `bunx astro preview --port ${PORT} --ignore-lock`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
