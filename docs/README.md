# docs/

Human-facing documentation: ADR deep-dives, runbooks, and operational guides.

| File | Contents |
|---|---|
| `monorepo.md` | Layout, the enforced workspace boundaries, the dependency catalog, and how to add a workspace |
| `deployment.md` | Getting live: Cloudflare resources, secrets, D1 migrations, cron seeding, Vercel, rollback, and where the site origin lives |
| `next-session-prompt.md` | Ready-to-paste continuation prompt for the next agent session |

Machine/agent-facing project memory lives in `.ai/` — which takes priority over
this directory in the SSOT order (`.ai/` > `docs/` > `prompts/` > code).
