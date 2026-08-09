import { describe, expect, it } from "vitest";
import { normalizeMintArtifacts, parseIsoName } from "./mint-artifacts";

// Verbatim from
// https://mirrors.edge.kernel.org/linuxmint/stable/22.2/sha256sum.txt
// on 2026-08-09.
const SUMS_22_2 = `759c9b5a2ad26eb9844b24f7da1696c705ff5fe07924a749f385f435176c2306 *linuxmint-22.2-cinnamon-64bit.iso
21f5a5f7be652c60b20ba7996328098b14e979b1ef8bf7f6c9d4a2a579504a65 *linuxmint-22.2-mate-64bit.iso
dea13e523dca28e3aa48d90167a6368c63e1b3251492115417fdbf648551558f *linuxmint-22.2-xfce-64bit.iso`;

describe("parseIsoName", () => {
	it("reads version, desktop environment and architecture", () => {
		expect(parseIsoName("linuxmint-22.2-cinnamon-64bit.iso")).toEqual({
			version: "22.2",
			edition: { name: "Cinnamon", desktop: "cinnamon", kind: "desktop" },
			arch: "x86_64",
		});
	});

	it("maps Mint's bit-width names to architectures", () => {
		expect(parseIsoName("linuxmint-21.3-xfce-32bit.iso")?.arch).toBe("i686");
	});

	it("skips what it cannot name", () => {
		expect(parseIsoName("linuxmint-22.2-kde-64bit.iso")).toBeNull(); // Mint dropped KDE
		expect(parseIsoName("linuxmint-22.2-cinnamon-128bit.iso")).toBeNull();
		expect(parseIsoName("sha256sum.txt")).toBeNull();
	});
});

describe("normalizeMintArtifacts", () => {
	const catalog = normalizeMintArtifacts("22.2", SUMS_22_2);

	it("records the desktop environment, because here the edition IS one", () => {
		// The carve-out the Fedora/Ubuntu rule anticipated: Ubuntu's "desktop"
		// and Fedora's "Workstation" name no environment, so they set none.
		// Cinnamon, MATE and Xfce are the entire difference between these images.
		expect(catalog.editions.map((e) => [e.name, e.desktop])).toEqual([
			["Cinnamon", "cinnamon"],
			["MATE", "mate"],
			["Xfce", "xfce"],
		]);
	});

	it("stores mirror-relative paths under the version directory", () => {
		expect(catalog.artifacts[0]?.path).toBe("22.2/linuxmint-22.2-cinnamon-64bit.iso");
	});

	it("carries the published checksum and claims no size", () => {
		expect(catalog.artifacts[0]?.sha256).toBe(
			"759c9b5a2ad26eb9844b24f7da1696c705ff5fe07924a749f385f435176c2306",
		);
		expect(catalog.artifacts[0]?.size).toBeUndefined();
	});

	it("skips an entry naming a different version than its directory", () => {
		const stray = `${"a".repeat(64)} *linuxmint-21.3-cinnamon-64bit.iso`;
		expect(normalizeMintArtifacts("22.2", stray).artifacts).toEqual([]);
	});

	it("reports no releases — those come from endoflife.date", () => {
		expect(catalog.releases).toEqual([]);
	});
});
