// Live-data snapshot CLI — fetches release/EOL and mirror data from official
// and public APIs and writes apps/web/src/lib/server/live-data.json.
//
// Run with:  bun packages/ingest/src/live.ts
//
// Sources (registered in .ai/data-sources.md; all are public endpoints
// intended for programmatic use — no robots-disallowed crawling):
//   - endoflife.date/api/<product>.json   → release cycles, dates, EOL
//   - archlinux.org/mirrors/status/json/  → official Arch mirror health
//   - mirrors.fedoraproject.org/mirrorlist → official Fedora mirror list
//
// The snapshot is committed so builds/deploys never need network access;
// Phase 5 moves this onto Workers Cron Triggers writing into D1/KV.

import { ingestUserAgent } from "./index";

const UA = ingestUserAgent("https://github.com/neramc/linuxhub");
const OUT = new URL("../../../apps/web/src/lib/server/live-data.json", import.meta.url).pathname;

// our slug → endoflife.date product slug
const EOL_PRODUCTS: Record<string, string> = {
	ubuntu: "ubuntu",
	fedora: "fedora",
	debian: "debian",
	"linux-mint": "linuxmint",
	opensuse: "opensuse",
	nixos: "nixos",
	"pop-os": "pop-os",
};

type EolCycle = {
	cycle: string;
	releaseDate?: string;
	eol?: string | boolean;
	latest?: string;
	lts?: boolean;
	codename?: string;
};

export type LiveRelease = {
	cycle: string;
	latest?: string;
	codename?: string;
	releaseDate?: string;
	eol?: string;
	lts: boolean;
	supported: boolean;
};

export type LiveMirror = {
	name: string;
	url: string;
	country?: string;
	countryCode?: string;
	note?: string;
};

// Transport: curl honors this environment's HTTPS proxy + CA bundle, which
// Bun's fetch currently does not. On Workers (Phase 5) this becomes fetch().
async function getText(url: string): Promise<string> {
	const proc = Bun.spawn(["curl", "-sSL", "--max-time", "30", "-H", `User-Agent: ${UA}`, url]);
	const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (code !== 0 || text.length === 0) throw new Error(`curl exit ${code} for ${url}`);
	return text;
}

async function getJson<T>(url: string): Promise<T> {
	return JSON.parse(await getText(url)) as T;
}

function normalizeCycles(cycles: EolCycle[]): LiveRelease[] {
	const today = new Date().toISOString().slice(0, 10);
	return cycles.slice(0, 6).map((c) => {
		const eol = typeof c.eol === "string" ? c.eol : undefined;
		const supported = c.eol === false || (eol !== undefined && eol > today);
		return {
			cycle: c.cycle,
			latest: c.latest,
			codename: c.codename,
			releaseDate: c.releaseDate,
			eol,
			lts: c.lts === true,
			supported,
		};
	});
}

async function fetchReleases(): Promise<Record<string, LiveRelease[]>> {
	const out: Record<string, LiveRelease[]> = {};
	for (const [slug, product] of Object.entries(EOL_PRODUCTS)) {
		try {
			const cycles = await getJson<EolCycle[]>(`https://endoflife.date/api/${product}.json`);
			out[slug] = normalizeCycles(cycles);
			console.log(`releases  ${slug}: ${out[slug].length} cycles`);
		} catch (e) {
			console.warn(`releases  ${slug}: FAILED (${e})`);
		}
	}
	return out;
}

async function fetchArchMirrors(): Promise<LiveMirror[]> {
	type ArchMirror = {
		url: string;
		protocol: string;
		country: string;
		country_code: string;
		score: number | null;
		completion_pct: number | null;
		active: boolean;
	};
	const body = await getJson<{ urls: ArchMirror[] }>("https://archlinux.org/mirrors/status/json/");
	return body.urls
		.filter((u) => u.active && u.protocol === "https" && u.completion_pct === 1 && u.score !== null)
		.sort((a, b) => (a.score ?? 99) - (b.score ?? 99))
		.slice(0, 8)
		.map((u) => ({
			name: new URL(u.url).hostname,
			url: u.url,
			country: u.country,
			countryCode: u.country_code,
			note: `score ${u.score?.toFixed(1)} · https`,
		}));
}

async function fetchFedoraMirrors(): Promise<LiveMirror[]> {
	const text = await getText(
		"https://mirrors.fedoraproject.org/mirrorlist?repo=fedora-42&arch=x86_64",
	);
	const urls = text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("http"));
	const seen = new Set<string>();
	const mirrors: LiveMirror[] = [];
	for (const u of urls) {
		try {
			const host = new URL(u).hostname;
			if (seen.has(host)) continue;
			seen.add(host);
			mirrors.push({ name: host, url: u, note: "via mirrors.fedoraproject.org" });
			if (mirrors.length >= 8) break;
		} catch {
			// skip malformed lines
		}
	}
	return mirrors;
}

const releases = await fetchReleases();
let archMirrors: LiveMirror[] = [];
let fedoraMirrors: LiveMirror[] = [];
try {
	archMirrors = await fetchArchMirrors();
	console.log(`mirrors   arch: ${archMirrors.length}`);
} catch (e) {
	console.warn(`mirrors   arch: FAILED (${e})`);
}
try {
	fedoraMirrors = await fetchFedoraMirrors();
	console.log(`mirrors   fedora: ${fedoraMirrors.length}`);
} catch (e) {
	console.warn(`mirrors   fedora: FAILED (${e})`);
}

const snapshot = {
	fetched_at: new Date().toISOString(),
	sources: [
		"https://endoflife.date/api (release cycles, dates, EOL)",
		"https://archlinux.org/mirrors/status/json/ (official Arch mirror health)",
		"https://mirrors.fedoraproject.org/mirrorlist (official Fedora mirrors)",
	],
	releases,
	mirrors: { arch: archMirrors, fedora: fedoraMirrors },
};

await Bun.write(OUT, `${JSON.stringify(snapshot, null, "\t")}\n`);
console.log(`\nwrote ${OUT}`);
