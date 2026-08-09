import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import {
	normalizeUbuntuArtifacts,
	parseChecksums,
	parseIsoName,
	withSizes,
} from "./ubuntu-artifacts";

// Verbatim from https://releases.ubuntu.com/24.04/SHA256SUMS on 2026-08-09 —
// two point releases in one file, plus a .wsl image that is not an ISO.
const SUMS_24_04 = `faabcf33ae53976d2b8207a001ff32f4e5daae013505ac7188c9ea63988f8328 *ubuntu-24.04.3-desktop-amd64.iso
c3514bf0056180d09376462a7a1b4f213c1d6e8ea67fae5c25099c6fd3d8274b *ubuntu-24.04.3-live-server-amd64.iso
c74833a55e525b1e99e1541509c566bb3e32bdb53bf27ea3347174364a57f47c *ubuntu-24.04.3-wsl-amd64.wsl
3a4c9877b483ab46d7c3fbe165a0db275e1ae3cfe56a5657e5a47c2f99a99d1e *ubuntu-24.04.4-desktop-amd64.iso
e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433 *ubuntu-24.04.4-live-server-amd64.iso
9b2f7730dc68227dd04a9f3e5eab86ad85caf556b8606ad94f1f29ff5c4fd3f5 *ubuntu-24.04.4-wsl-amd64.wsl`;

describe("parseChecksums", () => {
	it("reads the sha256sum format, binary marker and all", () => {
		const rows = parseChecksums(SUMS_24_04);
		expect(rows).toHaveLength(6);
		expect(rows[0]).toEqual({
			sha256: "faabcf33ae53976d2b8207a001ff32f4e5daae013505ac7188c9ea63988f8328",
			filename: "ubuntu-24.04.3-desktop-amd64.iso",
		});
	});

	it("accepts text mode, where a space replaces the asterisk", () => {
		const rows = parseChecksums(`${"a".repeat(64)}  ubuntu-26.04-desktop-amd64.iso`);
		expect(rows[0]?.filename).toBe("ubuntu-26.04-desktop-amd64.iso");
	});

	it("ignores anything that is not a checksum line", () => {
		expect(parseChecksums("# a comment\n\nnot a checksum")).toEqual([]);
	});
});

describe("parseIsoName", () => {
	it("splits point release, edition and architecture", () => {
		expect(parseIsoName("ubuntu-24.04.3-live-server-amd64.iso")).toEqual({
			point: "24.04.3",
			edition: { name: "Server", kind: "server" },
			arch: "x86_64",
		});
	});

	it("names no desktop environment for the desktop edition", () => {
		// The filename says "desktop", not "GNOME". Naming it would be
		// inference — the same rule that governs Fedora's Workstation.
		expect(parseIsoName("ubuntu-26.04-desktop-amd64.iso")?.edition).toEqual({
			name: "Desktop",
			kind: "desktop",
		});
	});

	it("skips what it cannot name rather than guessing", () => {
		expect(parseIsoName("ubuntu-24.04.3-wsl-amd64.wsl")).toBeNull(); // not an ISO
		expect(parseIsoName("ubuntu-26.04-desktop-sparc64.iso")).toBeNull(); // unmapped arch
		expect(parseIsoName("ubuntu-26.04-mystery-amd64.iso")).toBeNull(); // unmapped edition
		expect(parseIsoName("SHA256SUMS")).toBeNull();
	});
});

describe("normalizeUbuntuArtifacts", () => {
	const catalog = normalizeUbuntuArtifacts("24.04", SUMS_24_04);

	it("keeps only the newest point release of each edition and arch", () => {
		// artifacts is UNIQUE(edition, arch, format), and 24.04.4 is the one
		// anybody should be handed anyway.
		expect(catalog.artifacts).toHaveLength(2);
		expect(catalog.artifacts.every((a) => a.path.includes("24.04.4"))).toBe(true);
	});

	it("files them under the release version, not the point release", () => {
		// The release row from endoflife.date is "24.04"; the file is named
		// 24.04.4. Getting this backwards orphans every artifact.
		expect(catalog.artifacts.every((a) => a.version === "24.04")).toBe(true);
		expect(catalog.artifacts[0]?.path).toBe("24.04/ubuntu-24.04.4-desktop-amd64.iso");
	});

	it("emits one edition per name, carrying its release", () => {
		expect(catalog.editions).toEqual([
			{ name: "Desktop", kind: "desktop", version: "24.04" },
			{ name: "Server", kind: "server", version: "24.04" },
		]);
	});

	it("carries the checksum and claims no size", () => {
		// SHA256SUMS publishes no sizes; `withSizes` adds them separately.
		expect(catalog.artifacts[0]?.sha256).toBe(
			"3a4c9877b483ab46d7c3fbe165a0db275e1ae3cfe56a5657e5a47c2f99a99d1e",
		);
		expect(catalog.artifacts[0]?.size).toBeUndefined();
	});

	it("reports no releases — those come from endoflife.date", () => {
		expect(catalog.releases).toEqual([]);
	});

	it("orders point releases numerically, not lexically", () => {
		const sums = [
			`${"a".repeat(64)} *ubuntu-24.04.9-desktop-amd64.iso`,
			`${"b".repeat(64)} *ubuntu-24.04.10-desktop-amd64.iso`,
		].join("\n");
		// A string compare would pick .9 here.
		expect(normalizeUbuntuArtifacts("24.04", sums).artifacts[0]?.path).toContain("24.04.10");
	});
});

describe("withSizes", () => {
	function stub(sizes: Record<string, number | null>): HttpClient {
		return {
			async getText() {
				throw new Error("unused");
			},
			async getJson<T>() {
				throw new Error("unused") as never as T;
			},
			async head(url: string) {
				return sizes[url] ?? null;
			},
		};
	}

	it("attaches the size the upstream reports", async () => {
		const catalog = normalizeUbuntuArtifacts(
			"26.04",
			`${"a".repeat(64)} *ubuntu-26.04-desktop-amd64.iso`,
		);
		const sized = await withSizes(
			stub({ "https://releases.ubuntu.com/26.04/ubuntu-26.04-desktop-amd64.iso": 6518974464 }),
			catalog,
		);
		expect(sized.artifacts[0]?.size).toBe(6518974464);
	});

	it("leaves the size absent rather than inventing one", async () => {
		const catalog = normalizeUbuntuArtifacts(
			"26.04",
			`${"a".repeat(64)} *ubuntu-26.04-desktop-amd64.iso`,
		);
		const sized = await withSizes(stub({}), catalog);
		expect(sized.artifacts[0]?.size).toBeUndefined();
	});
});
