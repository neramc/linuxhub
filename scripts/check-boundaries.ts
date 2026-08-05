// Workspace boundary check.
//
//   bun scripts/check-boundaries.ts
//
// `.ai/architecture.md` states two rules that nothing enforced until now, so
// breaking either typechecked cleanly and failed later — at deploy, or at
// runtime in production:
//
//   1. Runtime boundary. apps/api runs on workerd. Bun and Node APIs do not
//      exist there, and wrangler.toml sets no `nodejs_compat` flag, so a
//      `node:` import or a `Bun.` global reaching the Worker bundle is a
//      deploy-time failure. packages/ingest is the live hazard: the Worker
//      imports its fetchers, while its CLI half legitimately uses Bun.file and
//      node:fs — only the import graph keeps them apart.
//
//   2. Dependency direction. `packages/*` are libraries; they must not import
//      an app. And the two apps must not import each other — they are separate
//      deployments that talk over HTTP.
//
// This scans import specifiers with a regex rather than a full AST. That is
// enough to be exact about *what a module imports*, which is all these rules
// are about, and it keeps the check dependency-free. It deliberately does not
// try to judge how an import is used.

import { readdir } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

type Violation = { file: string; line: number; rule: string; detail: string };

const SOURCE = /\.(ts|tsx|svelte|js)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", ".wrangler", "build"]);

/** `import … from "x"`, `export … from "x"`, `import("x")`, `require("x")`. */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;
/** A bare `import "x"` side-effect statement, which the pattern above misses. */
const BARE_IMPORT = /^\s*import\s+["']([^"']+)["']/gm;

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".") && entry.name !== ".") {
			if (SKIP_DIRS.has(entry.name)) continue;
		}
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = `${dir}/${entry.name}`;
		if (entry.isDirectory()) yield* walk(full);
		else if (SOURCE.test(entry.name)) yield full;
	}
}

function importsOf(source: string): Array<{ spec: string; line: number }> {
	const found: Array<{ spec: string; line: number }> = [];
	const lineOf = (index: number) => source.slice(0, index).split("\n").length;
	for (const pattern of [IMPORT, BARE_IMPORT]) {
		pattern.lastIndex = 0;
		let match = pattern.exec(source);
		while (match !== null) {
			if (match[1]) found.push({ spec: match[1], line: lineOf(match.index) });
			match = pattern.exec(source);
		}
	}
	return found;
}

/** Type-only imports are erased before anything runs, so they cannot drag a
 *  runtime dependency into the Worker bundle. */
function isTypeOnly(source: string, line: number): boolean {
	const text = source.split("\n")[line - 1] ?? "";
	return /^\s*(?:import|export)\s+type\b/.test(text);
}

const violations: Violation[] = [];

for await (const file of walk(`${ROOT}/apps`)) {
	const rel = file.slice(ROOT.length + 1);
	const source = await Bun.file(file).text();
	// Scoped to what wrangler actually bundles (`main` is src/index.ts). Tests
	// run under Vitest on Bun and never reach workerd, so harness.ts reading
	// the migration files with node:fs is correct, not a violation.
	const isApi = rel.startsWith("apps/api/src/");
	const isWeb = rel.startsWith("apps/web/");

	for (const { spec, line } of importsOf(source)) {
		if (isApi && spec.startsWith("node:") && !isTypeOnly(source, line)) {
			violations.push({
				file: rel,
				line,
				rule: "workers-runtime",
				detail: `imports "${spec}" — workerd has no Node builtins and wrangler.toml sets no nodejs_compat flag`,
			});
		}
		if (isApi && spec === "@linuxhub/web") {
			violations.push({
				file: rel,
				line,
				rule: "app-isolation",
				detail: "apps/api imports apps/web",
			});
		}
		if (isWeb && spec === "@linuxhub/api") {
			violations.push({
				file: rel,
				line,
				rule: "app-isolation",
				detail: "apps/web imports apps/api — they are separate deployments and talk over HTTP",
			});
		}
	}

	// `Bun.` is a global, not an import, so it needs its own scan. Comments are
	// stripped first so the many mentions of Bun in prose do not trip it.
	if (isApi) {
		const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
		const bun = code.match(/\bBun\.\w+/);
		if (bun) {
			violations.push({
				file: rel,
				line: source.split("\n").findIndex((l) => l.includes(bun[0])) + 1,
				rule: "workers-runtime",
				detail: `uses the Bun global "${bun[0]}" — not available on workerd`,
			});
		}
	}
}

for await (const file of walk(`${ROOT}/packages`)) {
	const rel = file.slice(ROOT.length + 1);
	const source = await Bun.file(file).text();
	for (const { spec, line } of importsOf(source)) {
		if (spec.startsWith("@linuxhub/web") || spec.startsWith("@linuxhub/api")) {
			violations.push({
				file: rel,
				line,
				rule: "dependency-direction",
				detail: `imports "${spec}" — packages are libraries and must not depend on an app`,
			});
		}
		if (/(^|\/)\.\.\/\.\.\/\.\.\/apps\//.test(spec)) {
			violations.push({
				file: rel,
				line,
				rule: "dependency-direction",
				detail: `reaches into apps/ via "${spec}"`,
			});
		}
	}
}

if (violations.length > 0) {
	console.error(`\n${violations.length} workspace boundary violation(s):\n`);
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}`);
		console.error(`    [${v.rule}] ${v.detail}\n`);
	}
	console.error('Rules are stated in .ai/architecture.md § "Runtime boundaries".\n');
	process.exit(1);
}

console.log("workspace boundaries ok");
