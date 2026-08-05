import { describe, expect, it } from "vitest";
import { normalizeArchReleases, SNAPSHOT_LIMIT } from "./arch-releases";
import { editionFor, FEDORA_REDIRECTOR, normalizeFedoraArtifacts } from "./fedora-artifacts";

const archRelease = (over: Record<string, unknown> = {}) => ({
	version: "2026.08.01",
	release_date: "2026-08-01",
	available: true,
	sha256_sum: "abc123",
	iso_url: "/iso/2026.08.01/archlinux-2026.08.01-x86_64.iso",
	torrent_url: "/releng/releases/2026.08.01/torrent/",
	magnet_uri: "magnet:?xt=urn:btih:deadbeef",
	...over,
});

describe("arch release snapshots", () => {
	it("turns a snapshot into a rolling release with its three artifacts", () => {
		const c = normalizeArchReleases([archRelease()]);

		expect(c.releases).toEqual([
			{ cycle: "2026.08.01", releaseDate: "2026-08-01", lts: false, supported: true },
		]);
		expect(c.editions).toEqual([{ version: "2026.08.01", name: "ISO", kind: "minimal" }]);
		expect(c.artifacts.map((a) => a.format)).toEqual(["iso", "torrent", "magnet"]);
	});

	it("stores the ISO mirror-relative and the torrent and magnet absolute", () => {
		const [iso, torrent, magnet] = normalizeArchReleases([archRelease()]).artifacts;

		// A mirror base URL ends at the archlinux root, so the leading slash goes.
		expect(iso?.path).toBe("iso/2026.08.01/archlinux-2026.08.01-x86_64.iso");
		expect(iso?.sha256).toBe("abc123");
		// Neither of these is served by a mirror, so both keep their origin.
		expect(torrent?.path).toBe("https://archlinux.org/releng/releases/2026.08.01/torrent/");
		expect(magnet?.path).toBe("magnet:?xt=urn:btih:deadbeef");
	});

	it("is supported rather than EOL — a rolling snapshot is superseded, not expired", () => {
		expect(normalizeArchReleases([archRelease()]).releases[0]?.supported).toBe(true);
	});

	it("skips snapshots upstream marks unavailable, and caps the rest", () => {
		const many = Array.from({ length: 20 }, (_, i) =>
			archRelease({ version: `2026.${i}`, available: i !== 0 }),
		);
		const c = normalizeArchReleases(many);
		expect(c.releases).toHaveLength(SNAPSHOT_LIMIT);
		expect(c.releases.map((r) => r.cycle)).not.toContain("2026.0");
	});

	it("omits an artifact the snapshot has no URL for", () => {
		const c = normalizeArchReleases([archRelease({ torrent_url: null, magnet_uri: null })]);
		expect(c.artifacts.map((a) => a.format)).toEqual(["iso"]);
	});
});

const fedoraEntry = (over: Record<string, unknown> = {}) => ({
	version: "44",
	arch: "x86_64",
	link: `${FEDORA_REDIRECTOR}pub/fedora/linux/releases/44/Workstation/x86_64/iso/Fedora-44.iso`,
	variant: "Workstation",
	subvariant: "Workstation",
	sha256: "deadbeef",
	size: "2299832320",
	...over,
});

describe("fedora artifact index", () => {
	it("stores the path relative to the redirector, with size and checksum", () => {
		const c = normalizeFedoraArtifacts([fedoraEntry()], ["44"]);

		expect(c.artifacts).toHaveLength(1);
		expect(c.artifacts[0]).toMatchObject({
			version: "44",
			edition: "Workstation",
			arch: "x86_64",
			format: "iso",
			path: "pub/fedora/linux/releases/44/Workstation/x86_64/iso/Fedora-44.iso",
			size: 2299832320,
			sha256: "deadbeef",
		});
	});

	it("ignores versions the catalog has no release row for", () => {
		const c = normalizeFedoraArtifacts([fedoraEntry({ version: "39" })], ["44"]);
		expect(c.artifacts).toEqual([]);
	});

	it("keeps ISOs only — cloud and container images are not what the selector offers", () => {
		const c = normalizeFedoraArtifacts(
			[
				fedoraEntry(),
				fedoraEntry({ link: `${FEDORA_REDIRECTOR}pub/x.ociarchive`, variant: "Container" }),
				fedoraEntry({ link: `${FEDORA_REDIRECTOR}pub/x.raw.xz`, variant: "Cloud" }),
			],
			["44"],
		);
		expect(c.artifacts).toHaveLength(1);
	});

	it("emits one edition per variant even across many arches", () => {
		const c = normalizeFedoraArtifacts([fedoraEntry(), fedoraEntry({ arch: "aarch64" })], ["44"]);
		expect(c.editions).toHaveLength(1);
		expect(c.artifacts).toHaveLength(2);
	});
});

describe("fedora edition classification", () => {
	it("reads a desktop off the variant name only when the name says one", () => {
		expect(editionFor("KDE")).toEqual({ name: "KDE", desktop: "kde", kind: "desktop" });
		// Workstation ships GNOME, but the index never says so — claiming it would
		// be a fact we cannot cite.
		expect(editionFor("Workstation")).toEqual({ name: "Workstation", kind: "desktop" });
	});

	it("classifies servers and non-product images", () => {
		expect(editionFor("Server").kind).toBe("server");
		expect(editionFor("Cloud").kind).toBe("other");
		expect(editionFor("Everything").kind).toBe("other");
		expect(editionFor("Silverblue").kind).toBe("desktop");
	});
});
