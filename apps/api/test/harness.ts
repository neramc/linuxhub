// Test harness: a real D1 and real KV namespaces, backed by workerd through
// Miniflare (.ai/backend-rules.md § "Testing").
//
// Why a real database rather than a fake: the migrations in `migrations/` are
// applied verbatim, so every test also exercises the schema — CHECK
// constraints, UNIQUE keys, and upsert conflict targets all bite here exactly
// as they will in production. A hand-written stub would silently accept writes
// that D1 rejects.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import type { Env } from "../src/env";

// `fileURLToPath`, not `.pathname`: on Windows a file URL's pathname is
// `/C:/Users/...`, whose leading slash makes it an invalid path — every
// script here failed with ENOENT on a Windows checkout.
// `.href`, not the URL object: `fileURLToPath` is typed against Node's URL,
// while `new URL` here resolves to the Workers one that @cloudflare/workers-types
// declares. Structurally identical, nominally different — passing the string
// sidesteps a mismatch that is purely about which declaration won.
const MIGRATIONS = fileURLToPath(new URL("../migrations/", import.meta.url).href);

/** Splits a migration file into statements. Line comments are stripped first so
 *  a `;` inside one can never split a statement in the wrong place. */
export function splitStatements(sql: string): string[] {
	return sql
		.split("\n")
		.map((line) => line.replace(/--.*$/, ""))
		.join("\n")
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export async function applyMigrations(db: D1Database): Promise<void> {
	const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
	for (const file of files) {
		const sql = await readFile(`${MIGRATIONS}${file}`, "utf8");
		for (const statement of splitStatements(sql)) {
			await db.prepare(statement).run();
		}
	}
}

export type TestContext = {
	env: Env;
	/** Always call in `afterEach`/`afterAll` — it stops the workerd process. */
	dispose(): Promise<void>;
};

export async function createTestContext(): Promise<TestContext> {
	const mf = new Miniflare({
		modules: true,
		// The harness drives bindings directly; the Worker under test is imported
		// as a module, so this placeholder script is never invoked.
		script: "export default { fetch: () => new Response('harness') };",
		d1Databases: { DB: ":memory:" },
		kvNamespaces: ["KV_CACHE", "KV_RATE", "KV_GEO"],
	});

	// Miniflare's bindings are structurally the Workers runtime types but are
	// declared against its own copies, so they are cast at this one boundary.
	const env = {
		DB: (await mf.getD1Database("DB")) as unknown as D1Database,
		KV_CACHE: (await mf.getKVNamespace("KV_CACHE")) as unknown as KVNamespace,
		KV_RATE: (await mf.getKVNamespace("KV_RATE")) as unknown as KVNamespace,
		KV_GEO: (await mf.getKVNamespace("KV_GEO")) as unknown as KVNamespace,
	} satisfies Env;

	await applyMigrations(env.DB);
	return { env, dispose: () => mf.dispose() };
}
