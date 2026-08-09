import { describe, expect, it } from "vitest";
import type { HttpClient } from "../http";
import {
	fetchPopOsArtifacts,
	normalizePopBuild,
	POP_OS_CHANNELS,
	type PopBuild,
} from "./pop-os-artifacts";

// Verbatim from https://api.pop-os.org/builds/24.04/intel on 2026-08-09.
const BUILD_24_04: PopBuild = {
	version: "24.04",
	url: "https://iso.pop-os.org/24.04/amd64/intel/20/pop-os_24.04_amd64_intel_20.iso",
	size: 2955067392,
	sha_sum: "a0e1c5e391062c79dc611ce383c2a709fecac36798ebd81444a734fd41252608e",
	channel: "intel",
	build: "20",
};

const INTEL = POP_OS_CHANNELS[0]?.edition as { name: string; kind: "desktop" };

describe("normalizePopBuild", () => {
	const catalog = normalizePopBuild("24.04", INTEL, BUILD_24_04);

	it("stores the url relative to the ISO host, not as an absolute reference", () => {
		// An absolute path is exempt from mirror linking (isAbsoluteRef), which
		// would leave this artifact unable to resolve at all.
		expect(catalog.artifacts[0]?.path).toBe("24.04/amd64/intel/20/pop-os_24.04_amd64_intel_20.iso");
		expect(catalog.artifacts[0]?.path.startsWith("http")).toBe(false);
	});

	it("takes the size and checksum the API already provides", () => {
		expect(catalog.artifacts[0]?.size).toBe(2955067392);
		expect(catalog.artifacts[0]?.sha256).toBe(BUILD_24_04.sha_sum);
	});

	it("names the channel for what it is — a driver build, not an architecture", () => {
		// "Intel" alone would read as a CPU next to x86_64 in the selector.
		expect(catalog.editions[0]?.name).toBe("Desktop (Intel/AMD graphics)");
		expect(catalog.artifacts[0]?.arch).toBe("x86_64");
	});

	it("skips a url from an unexpected host rather than storing it absolute", () => {
		const elsewhere = { ...BUILD_24_04, url: "https://example.test/pop.iso" };
		expect(normalizePopBuild("24.04", INTEL, elsewhere).artifacts).toEqual([]);
	});

	it("reports no releases — those come from endoflife.date", () => {
		expect(catalog.releases).toEqual([]);
	});
});

describe("fetchPopOsArtifacts", () => {
	function stub(responses: Record<string, unknown>): HttpClient {
		return {
			async getText() {
				throw new Error("unused");
			},
			async getJson<T>(url: string) {
				const key = Object.keys(responses).find((k) => url.includes(k));
				if (key === undefined) throw new Error(`no stub for ${url}`);
				return responses[key] as T;
			},
			async head() {
				return null;
			},
		};
	}

	it("skips a channel a version does not publish", async () => {
		// 22.04 has no raspi build; the API answers with an empty body.
		const result = await fetchPopOsArtifacts(stub({ "24.04/intel": BUILD_24_04 }), ["24.04"]);
		expect(result.data.artifacts).toHaveLength(1);
		expect(result.data.editions).toHaveLength(1);
	});

	it("throws when no combination could be read at all", async () => {
		// An empty catalog would be logged `ok` with nothing written, which is
		// the shape of a silent failure.
		await expect(fetchPopOsArtifacts(stub({}), ["24.04"])).rejects.toThrow(
			/no build could be read/,
		);
	});

	it("does not throw when asked for nothing", async () => {
		const result = await fetchPopOsArtifacts(stub({}), []);
		expect(result.data.artifacts).toEqual([]);
	});
});
