// Live-data snapshot CLI — writes apps/web/src/lib/server/live-data.json from
// the same source fetchers the Worker cron uses.
//
// Run with:  bun packages/ingest/src/live.ts
//
// The snapshot is committed so builds/deploys never need network access. It
// backs the Phase 4 BFF; once the BFF proxies the Worker (task 5.4) this CLI
// stays useful only as an offline fallback and a way to eyeball a source.
//
// Sources and their verification status live in .ai/data-sources.md. The
// normalizers are shared with the Worker (src/sources/*), so a fix to how a
// payload is read lands in both places at once — only the transport differs.

import { createFetchClient, type HttpClient } from "./http";
import { DISTRO_SOURCES } from "./registry";
import { fetchArchMirrors } from "./sources/arch-mirrors";
import { fetchReleaseCycles } from "./sources/endoflife";
import { fetchFedoraMirrors } from "./sources/fedora-mirrors";
import type { LiveMirror, LiveRelease } from "./types";

const SITE = "https://github.com/neramc/linuxhub";
const OUT = new URL("../../../apps/web/src/lib/server/live-data.json", import.meta.url).pathname;

// This container's HTTPS proxy breaks Bun's fetch but not curl, so the CLI
// swaps in a curl transport. On Workers the native fetch client is used
// instead — see .ai/handoff.md § "Environment notes".
function curlClient(): HttpClient {
	const ua = `linuxhub-ingest (+${SITE}/about#crawler)`;
	async function getText(url: string): Promise<string> {
		const proc = Bun.spawn(["curl", "-sSL", "--max-time", "30", "-H", `User-Agent: ${ua}`, url]);
		const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		if (code !== 0 || text.length === 0) throw new Error(`curl exit ${code} for ${url}`);
		return text;
	}
	return { getText, getJson: async <T>(url: string) => JSON.parse(await getText(url)) as T };
}

const http = process.env.LINUXHUB_INGEST_FETCH
	? createFetchClient({ siteOrigin: SITE })
	: curlClient();

const releases: Record<string, LiveRelease[]> = {};
const sources = new Set<string>();

for (const row of DISTRO_SOURCES) {
	if (row.release.kind !== "endoflife") continue;
	try {
		const result = await fetchReleaseCycles(http, row.release.product);
		releases[row.slug] = result.data;
		sources.add("https://endoflife.date/api (release cycles, dates, EOL)");
		console.log(`releases  ${row.slug}: ${result.data.length} cycles`);
	} catch (e) {
		console.warn(`releases  ${row.slug}: FAILED (${e})`);
	}
}

let archMirrors: LiveMirror[] = [];
let fedoraMirrors: LiveMirror[] = [];

try {
	const result = await fetchArchMirrors(http);
	archMirrors = result.data;
	sources.add("https://archlinux.org/mirrors/status/json/ (official Arch mirror health)");
	console.log(`mirrors   arch: ${archMirrors.length}`);
} catch (e) {
	console.warn(`mirrors   arch: FAILED (${e})`);
}

try {
	// The repo name tracks Fedora's newest cycle rather than being pinned, so
	// the mirror list does not quietly go stale one release after it was typed.
	const newestFedora = releases.fedora?.[0]?.cycle;
	if (!newestFedora) throw new Error("no Fedora cycle ingested, cannot pick a repo");
	const result = await fetchFedoraMirrors(http, `fedora-${newestFedora}`);
	fedoraMirrors = result.data;
	sources.add("https://mirrors.fedoraproject.org/mirrorlist (official Fedora mirrors)");
	console.log(`mirrors   fedora: ${fedoraMirrors.length}`);
} catch (e) {
	console.warn(`mirrors   fedora: FAILED (${e})`);
}

const snapshot = {
	fetched_at: new Date().toISOString(),
	sources: [...sources],
	releases,
	mirrors: { arch: archMirrors, fedora: fedoraMirrors },
};

await Bun.write(OUT, `${JSON.stringify(snapshot, null, "\t")}\n`);
console.log(`\nwrote ${OUT}`);
