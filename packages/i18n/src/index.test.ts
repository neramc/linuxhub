import { describe, expect, it } from "vitest";
import {
	BASE_LOCALE,
	fallbackChain,
	isLocale,
	LOCALE_CODES,
	LOCALES,
	localeDir,
	RTL_LOCALES,
} from "./index";

describe("locale registry", () => {
	it("matches the registry in .ai/i18n.md (56 locales)", () => {
		expect(LOCALES.length).toBe(56);
		expect(new Set(LOCALE_CODES).size).toBe(LOCALES.length);
	});

	it("marks exactly ar, he, fa, ckb as RTL", () => {
		expect([...RTL_LOCALES].sort()).toEqual(["ar", "ckb", "fa", "he"]);
		expect(localeDir("ar")).toBe("rtl");
		expect(localeDir("ko")).toBe("ltr");
	});

	it("validates locale codes", () => {
		expect(isLocale("ko")).toBe(true);
		expect(isLocale("zz")).toBe(false);
	});

	it("builds fallback chains ending at the base locale", () => {
		expect(fallbackChain("pt-BR")).toEqual(["pt-BR", "pt", BASE_LOCALE]);
		expect(fallbackChain("ko")).toEqual(["ko", BASE_LOCALE]);
		expect(fallbackChain("en")).toEqual(["en"]);
	});
});

describe("message runtime", async () => {
	const { getLocale, localizeHref, m, setLocale, splitLocale } = await import("./runtime");
	const { detectLocale, localeFromAcceptLanguage } = await import("./geo");

	it("resolves messages in the active locale with English fallback", () => {
		setLocale("ko");
		expect(getLocale()).toBe("ko");
		expect(m.nav_explore).toBe("탐색");
		setLocale("de"); // no catalog yet → falls back to en
		expect(m.nav_explore).toBe("Explore");
		setLocale("en");
		expect(m.nav_explore).toBe("Explore");
	});

	it("localizes hrefs (en unprefixed)", () => {
		setLocale("en");
		expect(localizeHref("/explore")).toBe("/explore");
		setLocale("ko");
		expect(localizeHref("/explore")).toBe("/ko/explore");
		expect(localizeHref("/")).toBe("/ko");
		setLocale("en");
	});

	it("splits locale prefixes from pathnames", () => {
		expect(splitLocale("/ko/distro/fedora", isLocale)).toEqual(["ko", "/distro/fedora"]);
		expect(splitLocale("/explore", isLocale)).toEqual(["en", "/explore"]);
		expect(splitLocale("/ko", isLocale)).toEqual(["ko", "/"]);
	});

	it("detects locale from country then accept-language", () => {
		expect(detectLocale("KR", null)).toBe("ko");
		expect(detectLocale(null, "ko-KR,ko;q=0.9,en;q=0.5")).toBe("ko");
		expect(detectLocale(null, "pt-BR,pt;q=0.9")).toBe("pt-BR");
		expect(localeFromAcceptLanguage("fr-CA,fr;q=0.8")).toBe("fr");
		expect(detectLocale(null, null)).toBe("en");
		expect(detectLocale("XX", "zz")).toBe("en");
	});
});
