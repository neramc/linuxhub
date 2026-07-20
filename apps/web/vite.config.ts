/// <reference types="vitest/config" />
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		fs: {
			// content/ (distro MDX) lives at the repo root, outside the app root
			allow: ["../.."],
		},
	},
	test: {
		// unit tests only — e2e/ belongs to Playwright (bun run test:e2e)
		include: ["src/**/*.{test,spec}.{js,ts}"],
	},
});
