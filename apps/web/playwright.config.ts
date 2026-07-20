import { defineConfig } from "@playwright/test";

// E2E against the production build: `bun run build` first, then
// `bun run test:e2e` (the webServer below serves the built output).
// Chromium is preinstalled in this environment at /opt/pw-browsers/chromium.
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4174",
		launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
	},
	webServer: {
		command: "bun run preview --port 4174 --host 127.0.0.1",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: true,
		timeout: 30_000,
	},
});
