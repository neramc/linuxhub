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
});
