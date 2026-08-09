// Pre-deploy guard for the Worker.
//
// `apps/api/wrangler.toml` ships with zeroed D1 and KV ids so that local dev,
// tests and `--dry-run` builds work without a Cloudflare account. Those
// placeholders are also perfectly valid TOML, so `wrangler deploy` will happily
// upload a Worker whose bindings point at nothing — and the failure only shows
// up as 500s in production, one request at a time.
//
// It also checks the **binding names**, which is the other half of the same
// trap. `wrangler d1 create <name>` prints a ready-to-paste block whose
// `binding` is the database name, not ours — pasting it whole renames `DB` to
// something else, `env.DB` becomes undefined, and every query dies with
// "Cannot read properties of undefined (reading 'prepare')" while the deploy
// itself succeeds. That happened on the first real deploy of this project.
//
// This runs before `wrangler deploy` (see the `deploy` script in
// apps/api/package.json) and refuses when it finds either fault.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `fileURLToPath`, not `.pathname`: on Windows a file URL's pathname is
// `/C:/Users/...`, whose leading slash makes it an invalid path — every
// script here failed with ENOENT on a Windows checkout.
const CONFIG = fileURLToPath(new URL("../apps/api/wrangler.toml", import.meta.url));
const ENV_TYPE = fileURLToPath(new URL("../apps/api/src/env.ts", import.meta.url));

/**
 * A placeholder is an id with a long run of zeros.
 *
 * Not "all zeros": the committed KV placeholders end in `cace`, `ea7e` and
 * `0e60`, so a stricter rule silently passes three of the four bindings — it
 * did, on the first attempt. A real id is 32 random hex characters, where a run
 * of twelve zeros is a 1-in-2^48 event; the zeroed UUID's longest run is
 * exactly twelve.
 */
export function isPlaceholder(id: string): boolean {
	return /0{12,}/.test(id);
}

type Binding = { line: number; key: string; id: string };

function bindings(toml: string): Binding[] {
	const found: Binding[] = [];
	toml.split("\n").forEach((line, index) => {
		const match = line.match(/^\s*(database_id|id)\s*=\s*"([^"]*)"/);
		if (match?.[1] && match[2] !== undefined) {
			found.push({ line: index + 1, key: match[1], id: match[2] });
		}
	});
	return found;
}

/**
 * The binding names the Worker actually reads, taken from `Env` rather than
 * listed here — a hardcoded copy is one that drifts the first time a binding
 * is added.
 */
export function requiredBindings(envSource: string): string[] {
	const names: string[] = [];
	for (const line of envSource.split("\n")) {
		const match = line.match(/^\s*(\w+):\s*(D1Database|KVNamespace);/);
		if (match?.[1]) names.push(match[1]);
	}
	return names;
}

/** Every `binding = "…"` the config declares. */
export function declaredBindings(toml: string): string[] {
	return [...toml.matchAll(/^\s*binding\s*=\s*"([^"]*)"/gm)].map((m) => m[1] as string);
}

/** The check itself. Guarded below so importing this module for its helpers
 *  does not read files or exit the process. */
function main(): void {
	const toml = readFileSync(CONFIG, "utf8");
	const problems: string[] = [];

	const placeholders = bindings(toml).filter((b) => isPlaceholder(b.id));
	if (placeholders.length > 0) {
		problems.push(
			"Placeholder binding ids are still in place:\n" +
				placeholders
					.map(({ line, key, id }) => `    wrangler.toml:${line}  ${key} = "${id}"`)
					.join("\n") +
				"\n  These are valid TOML, so wrangler would deploy a Worker whose D1 and KV\n" +
				"  bindings point at nothing — visible only as 500s in production.\n" +
				"  Create the resources and paste the real ids: docs/deployment.md §§ 1-2.",
		);
	}

	const declared = declaredBindings(toml);
	const required = requiredBindings(readFileSync(ENV_TYPE, "utf8"));
	const missing = required.filter((name) => !declared.includes(name));
	if (missing.length > 0) {
		problems.push(
			`Bindings the Worker reads are not declared: ${missing.join(", ")}\n` +
				`  wrangler.toml declares: ${declared.join(", ") || "(none)"}\n` +
				"  `env.<NAME>` is undefined at runtime, so every use dies with\n" +
				'  "Cannot read properties of undefined" while the deploy still succeeds.\n' +
				'  Note `wrangler d1 create` suggests `binding = "<database name>"` —\n' +
				"  keep our names (src/env.ts) and replace only the id.",
		);
	}

	if (problems.length > 0) {
		console.error("Refusing to deploy — apps/api/wrangler.toml:\n");
		for (const problem of problems) console.error(`  ${problem}\n`);
		process.exit(1);
	}

	console.log(`deploy config ok — ids look real, bindings present: ${required.join(", ")}`);
}

if (import.meta.main) main();
