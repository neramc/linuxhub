/// <reference types="vitest/config" />
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

// `fileURLToPath`, not `.pathname`: on Windows a file URL's pathname is
// `/C:/Users/...`, whose leading slash makes it an invalid path — every
// script here failed with ENOENT on a Windows checkout.
const CONTENT_DIR = fileURLToPath(new URL("../../content/distros/", import.meta.url));

/**
 * Fails the build when the authored distro content is not reachable.
 *
 * `src/lib/content/index.ts` picks the docs up with an `import.meta.glob` that
 * reaches five levels up, out of `apps/web` and into the repo root. Vercel's
 * Root Directory setting is documented as making files outside it
 * inaccessible — and a glob that matches nothing is **not an error**. Without
 * this check, a misconfigured deploy builds cleanly and ships a site whose
 * every distro page has three empty tabs.
 *
 * So: turn the silent failure into a loud one. This is also, incidentally, the
 * test of whether the deployment can see the repo root at all.
 */
function requireDistroContent(): Plugin {
	return {
		name: "linuxhub:require-distro-content",
		buildStart() {
			let docs = 0;
			let distros = 0;
			try {
				for (const slug of readdirSync(CONTENT_DIR)) {
					const slugDir = join(CONTENT_DIR, slug);
					if (!statSync(slugDir).isDirectory()) continue;
					distros++;
					for (const locale of readdirSync(slugDir)) {
						const localeDir = join(slugDir, locale);
						if (!statSync(localeDir).isDirectory()) continue;
						docs += readdirSync(localeDir).filter((f) => f.endsWith(".md")).length;
					}
				}
			} catch (error) {
				throw new Error(
					`Cannot read ${CONTENT_DIR} — the distro content at the repository root is not ` +
						`reachable from this build (${String(error)}).\n` +
						"On Vercel this means the Root Directory excludes the repo root; see " +
						"docs/deployment.md § 6.",
				);
			}

			if (docs === 0) {
				throw new Error(
					`No distro content found under ${CONTENT_DIR}. The build would succeed and every ` +
						"distro page would render three empty tabs — see docs/deployment.md § 6.",
				);
			}

			this.info(`distro content: ${docs} docs across ${distros} distros`);
		},
	};
}

export default defineConfig({
	plugins: [requireDistroContent(), sveltekit()],
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
