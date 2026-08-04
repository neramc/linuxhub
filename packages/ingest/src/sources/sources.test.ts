import { describe, expect, it } from "vitest";
import { normalizeArchMirrors } from "./arch-mirrors";
import { CYCLE_LIMIT, endoflifeUrl, normalizeCycles } from "./endoflife";
import { fedoraMirrorlistUrl, normalizeFedoraMirrors } from "./fedora-mirrors";

describe("endoflife normalizer", () => {
	const today = "2026-08-04";

	it("treats eol: false as supported — that is how upstream says 'no EOL announced'", () => {
		const [row] = normalizeCycles([{ cycle: "rolling", eol: false }], today);
		expect(row).toMatchObject({ supported: true, eol: undefined });
	});

	it("marks a cycle supported only while its eol date is still in the future", () => {
		const rows = normalizeCycles(
			[
				{ cycle: "future", eol: "2030-01-01" },
				{ cycle: "past", eol: "2020-01-01" },
			],
			today,
		);
		expect(rows.map((r) => r.supported)).toEqual([true, false]);
	});

	it("carries the lts flag through as a boolean, never as a channel", () => {
		const [lts, notLts] = normalizeCycles(
			[{ cycle: "26.04", lts: true }, { cycle: "25.10" }],
			today,
		);
		expect(lts?.lts).toBe(true);
		expect(notLts?.lts).toBe(false);
	});

	it("keeps only the newest cycles the version table shows", () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ cycle: String(i) }));
		expect(normalizeCycles(many, today)).toHaveLength(CYCLE_LIMIT);
	});

	it("builds the documented endpoint URL", () => {
		expect(endoflifeUrl("linuxmint")).toBe("https://endoflife.date/api/linuxmint.json");
	});
});

describe("arch mirror normalizer", () => {
	const mirror = (over: Record<string, unknown>) => ({
		url: "https://a.example/archlinux/",
		protocol: "https",
		country: "Sweden",
		country_code: "SE",
		score: 1,
		completion_pct: 1,
		active: true,
		...over,
	});

	it("drops mirrors that are inactive, incomplete, plaintext, or unscored", () => {
		const rows = normalizeArchMirrors([
			mirror({ url: "https://keep.example/", score: 3 }),
			mirror({ url: "https://inactive.example/", active: false }),
			mirror({ url: "https://partial.example/", completion_pct: 0.5 }),
			mirror({ url: "http://plain.example/", protocol: "http" }),
			mirror({ url: "https://unscored.example/", score: null }),
		]);
		expect(rows.map((r) => r.name)).toEqual(["keep.example"]);
	});

	it("orders by Arch's score, where lower is better", () => {
		const rows = normalizeArchMirrors([
			mirror({ url: "https://slow.example/", score: 9 }),
			mirror({ url: "https://fast.example/", score: 1 }),
		]);
		expect(rows.map((r) => r.name)).toEqual(["fast.example", "slow.example"]);
	});
});

describe("fedora mirrorlist normalizer", () => {
	it("skips the comment header and keeps one entry per host", () => {
		const rows = normalizeFedoraMirrors(
			[
				"# repo = fedora-44 arch = x86_64",
				"https://a.example/fedora/linux/releases/44/",
				"https://a.example/fedora/linux/releases/44/Everything/",
				"https://b.example/fedora/",
				"not a url",
			].join("\n"),
		);
		expect(rows.map((r) => r.name)).toEqual(["a.example", "b.example"]);
	});

	it("builds a repo-scoped mirrorlist URL", () => {
		expect(fedoraMirrorlistUrl("fedora-44")).toBe(
			"https://mirrors.fedoraproject.org/mirrorlist?repo=fedora-44&arch=x86_64",
		);
	});
});
