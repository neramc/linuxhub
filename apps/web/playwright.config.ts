import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// E2E runs against the production build: `bun run build` first, then
// `bun run test:e2e` (the webServer below serves the built output).
//
// Browser resolution has to work in three places: this container ships a
// prebuilt Chromium at a fixed path, CI installs its own via
// `playwright install`, and a dev machine may have either. Point at the
// prebuilt binary only when it actually exists, otherwise let Playwright
// resolve the browser it manages.
const PREBUILT_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(PREBUILT_CHROMIUM) ? PREBUILT_CHROMIUM : undefined;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4174",
		launchOptions: { executablePath },
	},
	webServer: {
		command: "bun run preview --port 4174 --host 127.0.0.1",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
