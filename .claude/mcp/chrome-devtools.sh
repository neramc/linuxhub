#!/bin/sh
# Chrome DevTools MCP server for the browser-testing-with-devtools skill
# (.claude/skills/). Pinned version, headless, throwaway profile, and no usage
# statistics or CrUX lookups (CLAUDE.md rule 9). Page-ID routing is off because
# one session drives one browser. In Claude Code cloud containers it uses the
# preinstalled Chromium; elsewhere chrome-devtools-mcp finds the local Chrome.
set -eu

exe="${CHROME_DEVTOOLS_MCP_CHROME:-${PLAYWRIGHT_CHROMIUM_PATH:-/opt/pw-browsers/chromium}}"
if [ -x "$exe" ]; then
  set -- --executablePath="$exe" "$@"
  # Containers run as root, where Chromium refuses to start with its sandbox.
  if [ "$(id -u)" = 0 ]; then
    set -- --chromeArg=--no-sandbox "$@"
  fi
fi

exec npx -y chrome-devtools-mcp@1.10.1 --headless --isolated \
  --no-usage-statistics --no-performance-crux --no-page-id-routing "$@"
