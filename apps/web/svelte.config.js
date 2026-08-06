import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: [".svelte", ".md"],
	preprocess: [
		vitePreprocess(),
		mdsvex({
			extensions: [".md"],
			smartypants: { dashes: "oldschool" },
		}),
	],
	kit: {
		adapter: adapter(),

		// Content-Security-Policy (.ai/security.md § "Headers"). SvelteKit owns
		// this rather than a hand-written header because it is the only thing that
		// knows the hashes of the scripts it injects; `mode: 'auto'` uses hashes
		// for prerendered pages and a nonce for dynamic ones.
		csp: {
			mode: "auto",
			directives: {
				"default-src": ["self"],
				"script-src": ["self"],
				// Inline *style attributes* (`style="…"`) are all over the approved
				// comps and are what this allows. It is not the hole 'unsafe-inline'
				// is on script-src: a style attribute cannot execute, and every
				// value in one comes from our own markup, never from user input.
				// Removing it means editing every approved screen, which is a
				// design change, not a security fix.
				"style-src": ["self", "unsafe-inline"],
				"img-src": ["self", "data:"],
				"font-src": ["self"],
				"connect-src": ["self"],
				// No third-party origins at all. hCaptcha's hosts are added here
				// when the write endpoints land (5.5), not before.
				"frame-src": ["none"],
				"object-src": ["none"],
				"base-uri": ["self"],
				"form-action": ["self"],
				"frame-ancestors": ["none"],
			},
		},
	},
};

export default config;
