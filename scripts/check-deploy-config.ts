// Pre-deploy guard for the Worker.
//
// `apps/api/wrangler.toml` ships with zeroed D1 and KV ids so that local dev,
// tests and `--dry-run` builds work without a Cloudflare account. Those
// placeholders are also perfectly valid TOML, so `wrangler deploy` will happily
// upload a Worker whose bindings point at nothing — and the failure only shows
// up as 500s in production, one request at a time.
//
// This runs before `wrangler deploy` (see the `deploy` script in
// apps/api/package.json) and refuses when it finds one.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// `fileURLToPath`, not `.pathname`: on Windows a file URL's pathname is
// `/C:/Users/...`, whose leading slash makes it an invalid path — every
// script here failed with ENOENT on a Windows checkout.
const CONFIG = fileURLToPath(new URL("../apps/api/wrangler.toml", import.meta.url));

/**
 * A placeholder is an id with a long run of zeros.
 *
 * Not "all zeros": the committed KV placeholders end in `cace`, `ea7e` and
 * `0e60`, so a stricter rule silently passes three of the four bindings — it
 * did, on the first attempt. A real id is 32 random hex characters, where a run
 * of twelve zeros is a 1-in-2^48 event; the zeroed UUID's longest run is
 * exactly twelve.
 */
function isPlaceholder(id: string): boolean {
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

const toml = readFileSync(CONFIG, "utf8");
const placeholders = bindings(toml).filter((b) => isPlaceholder(b.id));

if (placeholders.length > 0) {
	console.error("Refusing to deploy: apps/api/wrangler.toml still has placeholder binding ids.\n");
	for (const { line, key, id } of placeholders) {
		console.error(`  wrangler.toml:${line}  ${key} = "${id}"`);
	}
	console.error(
		"\nThese are valid TOML, so wrangler would deploy a Worker whose D1 and KV\n" +
			"bindings point at nothing — visible only as 500s in production.\n" +
			"Create the resources and paste the real ids: docs/deployment.md §§ 1–2.",
	);
	process.exit(1);
}

console.log("deploy config ok — no placeholder binding ids");
