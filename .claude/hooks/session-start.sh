#!/bin/bash
# SessionStart hook — prepares a cold Claude Code on the web container so the
# quality gates (`bun run check` / `lint` / `test` / `build` / `test:e2e`) work
# on the first try. Safe to re-run; skipped on local machines.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Bun workspaces: one install covers apps/* and packages/*.
bun install

# SvelteKit generates ./$types for every route from the route tree. Without a
# sync, `bun run check` and any editor tooling fail on a fresh clone with
# "Cannot find module './$types'".
(cd apps/web && bunx svelte-kit sync)

# This image ships a prebuilt Chromium; playwright.config.ts uses it when the
# path exists and falls back to Playwright's own browser everywhere else.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_PATH="/opt/pw-browsers/chromium"' >> "$CLAUDE_ENV_FILE"
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
fi

echo "linuxhub: dependencies installed, SvelteKit types synced."
