#!/bin/bash
# SessionStart hook: prepares a cold Claude Code on the web container so the
# quality gates (lint / check / test / build / test:e2e) work on the first try.
# Safe to re-run; skipped on local machines.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

bun install

# Generates .astro/types.d.ts (content collection + astro:* module types) so
# `bun run check` and editor tooling work on a fresh clone.
bunx astro sync >/dev/null

# The image ships a prebuilt Chromium; playwright.config.ts picks it up.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PLAYWRIGHT_CHROMIUM_PATH="/opt/pw-browsers/chromium"' >> "$CLAUDE_ENV_FILE"
  echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "$CLAUDE_ENV_FILE"
  # Lighthouse CI (performance-optimization skill) looks for Chrome here.
  echo 'export CHROME_PATH="/opt/pw-browsers/chromium"' >> "$CLAUDE_ENV_FILE"
fi

echo "linuxhub: dependencies installed, Astro types synced."
