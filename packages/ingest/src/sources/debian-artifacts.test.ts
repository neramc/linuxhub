import { describe, expect, it } from "vitest";
import {
	normalizeDebianArtifacts,
	parseChecksums,
	parseIsoName,
	releaseVersionOf,
} from "./debian-artifacts";

// Verbatim from
// https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/SHA256SUMS
// on 2026-08-09. Note the two spaces: Debian writes text mode, Ubuntu binary.
const SUMS_AMD64 = `65273beed27b2df543b68b65630ba525cfbad8df2b12035732b2dff87d6664e7  debian-13.6.0-amd64-netinst.iso
bf893e365330f94e10a263131797c266017f8ca6c8adef85149959e66daa445c  debian-edu-13.6.0-amd64-netinst.iso
d25a26e33fc7af4868baae426b30bed902a1d70ce84e1e73e96fc5386a179e33  debian-mac-13.6.0-amd64-netinst.iso`;

describe("parseChecksums", () => {
	it("reads text mode, where two spaces replace the asterisk", () => {
		expect(parseChecksums(SUMS_AMD64)).toHaveLength(3);
	});
});

describe("parseIsoName", () => {
	it("reads the plain netinst", () => {
		expect(parseIsoName("debian-13.6.0-amd64-netinst.iso")).toEqual({
			point: "13.6.0",
			edition: { name: "Netinst", kind: "minimal" },
			arch: "x86_64",
		});
	});

	it("keeps the published flavours apart instead of folding them together", () => {
		expect(parseIsoName("debian-edu-13.6.0-amd64-netinst.iso")?.edition.name).toBe("Edu netinst");
		expect(parseIsoName("debian-mac-13.6.0-arm64-netinst.iso")?.edition.name).toBe("Mac netinst");
	});

	it("skips what it cannot name", () => {
		expect(parseIsoName("debian-13.6.0-sparc-netinst.iso")).toBeNull();
		expect(parseIsoName("debian-mystery-13.6.0-amd64-netinst.iso")).toBeNull();
		expect(parseIsoName("SHA256SUMS")).toBeNull();
	});
});

describe("releaseVersionOf", () => {
	it("maps a point release to the cycle endoflife.date reports", () => {
		// `releases.version` holds "13"; the file is named 13.6.0. Getting this
		// backwards orphans every artifact.
		expect(releaseVersionOf("13.6.0")).toBe("13");
		expect(releaseVersionOf("12.15.0")).toBe("12");
	});
});

describe("normalizeDebianArtifacts", () => {
	const catalog = normalizeDebianArtifacts("amd64", SUMS_AMD64);

	it("stores the versioned path, never `current`", () => {
		// `current` is a symlink that moves on every point release; a path under
		// it would serve 13.7.0 against a checksum taken from 13.6.0.
		expect(catalog.artifacts[0]?.path).toBe("13.6.0/amd64/iso-cd/debian-13.6.0-amd64-netinst.iso");
		expect(catalog.artifacts.every((a) => !a.path.includes("current"))).toBe(true);
	});

	it("claims no size, because robots.txt forbids requesting the ISO", () => {
		// `Disallow: /*.iso$` binds our UA. A size here would mean we fetched
		// something we were told not to.
		expect(catalog.artifacts.every((a) => a.size === undefined)).toBe(true);
	});

	it("files everything under the release cycle", () => {
		expect(catalog.artifacts.every((a) => a.version === "13")).toBe(true);
		expect(catalog.editions.every((e) => e.version === "13")).toBe(true);
	});

	it("emits one edition per published flavour", () => {
		expect(catalog.editions.map((e) => e.name).sort()).toEqual([
			"Edu netinst",
			"Mac netinst",
			"Netinst",
		]);
	});

	it("ignores a row for a different architecture than the file's", () => {
		// Each SHA256SUMS is per-arch; a stray entry must not be filed under the
		// directory we happen to be reading.
		const mixed = `${"a".repeat(64)}  debian-13.6.0-arm64-netinst.iso`;
		expect(normalizeDebianArtifacts("amd64", mixed).artifacts).toEqual([]);
	});

	it("reports no releases — those come from endoflife.date", () => {
		expect(catalog.releases).toEqual([]);
	});
});
