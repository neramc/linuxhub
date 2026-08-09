import { defineConfig } from "vitest/config";

// Root-level tests: the repo scripts. `bun run test` delegates to the
// workspaces, and `scripts/` is not one — so a test file there ran under no
// runner at all, which is a test that rots without ever failing.
//
// `defineConfig` comes from `vitest/config`, not `vite`: the root has no vite
// dependency and does not need one for this.
//
// Named `vitest.scripts.config.ts`, not `vitest.config.ts`, and passed with an
// explicit `--config`. Vitest walks *up* from its working directory looking for
// `vitest.config.*`, so a config at the repo root silently overrode
// `apps/api`'s include glob and left it reporting "No test files found".
export default defineConfig({
	test: {
		include: ["scripts/**/*.test.ts"],
	},
});
