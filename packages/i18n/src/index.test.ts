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
