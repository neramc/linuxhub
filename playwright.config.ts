import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The cloud image ships a prebuilt Chromium; use it when present so no
// browser download is needed. Everywhere else Playwright's own browser runs.
const prebuilt = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(prebuilt) ? prebuilt : undefined);

// E2E_PORT / E2E_ROOT / E2E_CONFIG let several checkouts or build snapshots
// run their own server side by side (see scripts/serve.ts).
const PORT = Number(process.env.E2E_PORT ?? 4322);
const serveArgs = [
  `--port=${PORT}`,
  ...(process.env.E2E_ROOT ? [`--root=${process.env.E2E_ROOT}`] : []),
  ...(process.env.E2E_CONFIG ? [`--config=${process.env.E2E_CONFIG}`] : []),
].join(" ");

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
    command: `bun scripts/serve.ts ${serveArgs}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
