import { describe, expect, it } from "vitest";
import { BRAND_COLOR, brandColor, flagEmoji, initials } from "./brand";

// The twelve the catalog ships, with the initials they rendered before
// ADR-0020 moved this out of the API payload. Pinning them here is the point
// of the test: the rule may be rewritten, but the tiles must not silently
// change under users.
const CATALOG: Array<[slug: string, name: string, expected: string]> = [
	["ubuntu", "Ubuntu", "U"],
	["fedora", "Fedora", "F"],
	["linux-mint", "Linux Mint", "M"],
	["arch", "Arch Linux", "A"],
	["debian", "Debian", "D"],
	["opensuse", "openSUSE", "oS"],
	["manjaro", "Manjaro", "Mj"],
	["pop-os", "Pop!_OS", "P!"],
	["nixos", "NixOS", "N"],
	["zorin", "Zorin OS", "Z"],
	["elementary", "elementary OS", "e"],
	["endeavouros", "EndeavourOS", "E"],
];

describe("initials", () => {
	for (const [slug, name, expected] of CATALOG) {
		it(`${slug}: "${name}" → "${expected}"`, () => {
			expect(initials(name)).toBe(expected);
		});
	}

	it("falls back to a question mark rather than an empty tile", () => {
		expect(initials("")).toBe("?");
		expect(initials("   ")).toBe("?");
	});

	it("derives something sensible for a distro nobody has added yet", () => {
		expect(initials("Void Linux")).toBe("V");
		expect(initials("Linux Lite")).toBe("L");
		expect(initials("garuda")).toBe("g");
	});
});

describe("brandColor", () => {
	it("covers every distro in the catalog", () => {
		for (const [slug] of CATALOG) {
			expect(BRAND_COLOR[slug], slug).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it("falls back to a theme token, never a literal colour", () => {
		expect(brandColor("not-a-distro")).toMatch(/^var\(--/);
	});
});

describe("flagEmoji", () => {
	it("builds a regional indicator pair", () => {
		expect(flagEmoji("SE")).toBe("🇸🇪");
		expect(flagEmoji("de")).toBe("🇩🇪");
	});

	it("returns null when the source published no country", () => {
		expect(flagEmoji("")).toBeNull();
		expect(flagEmoji(null)).toBeNull();
		expect(flagEmoji(undefined)).toBeNull();
		expect(flagEmoji("XYZ")).toBeNull();
	});
});
