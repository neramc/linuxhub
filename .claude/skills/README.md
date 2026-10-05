# Project skills

Claude Code loads every `<name>/SKILL.md` in this folder automatically, in local
sessions and in Claude Code on the web (the folder is part of the clone). How
they fit together is in `CLAUDE.md` → "UI work process"; why this set was chosen
is ADR-0015 in `docs/decisions.md`.

| Skill | Role | Source (pinned) | License |
|---|---|---|---|
| `frontend-design` | Design critique: avoid generic/templated UI, restraint, copy for empty and error states. The Adwaita brief always wins (see CLAUDE.md). | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) `plugins/frontend-design/skills/frontend-design` @ `d182ca456ca09d31d139f7d3818d1d333b103cce` | Apache-2.0 (`frontend-design/LICENSE.txt`) |
| `frontend-ui-engineering` | Building UI: components, design-system adherence, states, WCAG 2.2 AA, responsive | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) `skills/frontend-ui-engineering` @ `1401c8b8030e023baeebb31781a6653fe8e93026` | MIT (`LICENSE`) |
| `browser-testing-with-devtools` | Real-browser verification through the `chrome-devtools` MCP server (`.mcp.json`) | agent-skills `skills/browser-testing-with-devtools` @ `1401c8b` | MIT |
| `performance-optimization` | Measure-first performance work, Core Web Vitals, keep-or-revert discipline | agent-skills `skills/performance-optimization` @ `1401c8b` | MIT |
| `code-review-and-quality` | Multi-axis review incl. needless abstraction, duplication, dependencies | agent-skills `skills/code-review-and-quality` @ `1401c8b` | MIT |

## Local changes to the vendored files

`frontend-design` is copied unmodified. In the four agent-skills:

- A `Linuxhub overlay (read first)` block sits right under each H1, between
  `<!-- linuxhub-overlay:start … -->` and `<!-- linuxhub-overlay:end -->`. It maps
  the generic advice to this project (Astro + vanilla islands, CSP, Adwaita tokens,
  Bun, lab-only performance evidence). Everything outside the block is upstream text.
- Links to the upstream repo-level `references/` folder are rewritten to copies inside
  each skill: `references/accessibility-checklist.md`, `references/performance-checklist.md`
  (+ `optimization-patterns.md`), `references/security-checklist.md` (agent-skills @ `1401c8b`, MIT).
- Two references are adapted from [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills)
  @ `afa8da942115f2961fdbfa80807ea0b232ff6c00` (MIT, `LICENSE-web-quality-skills`), instead of
  installing that package's overlapping skills:
  - `frontend-ui-engineering/references/wcag-2.2.md` ← `skills/accessibility/references/WCAG.md`
  - `performance-optimization/references/web-vitals.md` ← `skills/core-web-vitals/references/{LCP,INP,CLS}.md`

## Deliberately not installed

| Candidate | Why not |
|---|---|
| frontend-design as a plugin (`enabledPlugins`) | Cloud sessions don't install plugins a repository enables, so the skill would be missing there; a local plugin plus this copy would load it twice. The vendored copy works everywhere. |
| agent-skills `code-simplification` | Same job as the built-in `/simplify` and `code-review-and-quality`; its safety rules are folded into the latter's overlay. |
| agent-skills `using-agent-skills` (router) and the other 20 skills | Claude Code routes skills natively; the rest is outside this project's needs. |
| web-quality-skills `performance`, `core-web-vitals`, `accessibility` | Duplicate `performance-optimization` / `frontend-ui-engineering`; the unique parts are the two adapted references above. Several snippets break the CSP (inline `onload`/`onclick`). |
| web-quality-skills `seo`, `best-practices`, `web-quality-audit` | Already implemented and gated (Lighthouse SEO/best practices = 1, hreflang, sitemap, JSON-LD, security headers); overlap with the built-in `/security-review`. |

## Updating

Re-copy the upstream folder at a new commit, re-apply the overlay block and the
reference-link rewrites listed above, update the commit in the table, and check
with `claude plugin validate .claude/skills`.
