import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { motionDuration } from "./motion";
import { breakpoints, contentMaxWidth, gridStagger, motionDurations } from "./tokens";

describe("tokens", () => {
	it("breakpoints ascend mobile → wide", () => {
		const values = [breakpoints.mobile, breakpoints.tablet, breakpoints.desktop, breakpoints.wide];
		expect([...values].sort((a, b) => a - b)).toEqual(values);
		expect(breakpoints.mobile).toBe(0);
	});

	it("motion durations ascend fast → slow", () => {
		expect(motionDurations.fast).toBeLessThan(motionDurations.base);
		expect(motionDurations.base).toBeLessThan(motionDurations.slow);
	});

	it("stagger caps at 12 cards", () => {
		expect(gridStagger.maxCards).toBe(12);
	});

	it("motionDuration passes through outside a browser", () => {
		// No window in the test env → helper must not throw and returns input.
		expect(motionDuration(200)).toBe(200);
	});
});

describe("tokens.css contract", () => {
	const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

	function block(pattern: RegExp): Record<string, string> {
		const match = css.match(pattern);
		if (!match) throw new Error(`token block not found: ${pattern}`);
		return Object.fromEntries(
			[...match[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]),
		);
	}

	const root = block(/:root \{([\s\S]*?)\n\}/);
	const dark = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
	const fallback = block(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n\t\}/);

	it("keeps the dark block and the no-JS fallback identical", () => {
		// Two hand-maintained copies; drift here silently breaks first paint.
		expect(fallback).toEqual(dark);
	});

	it("mirrors the CSS motion durations in the JS tokens", () => {
		expect(root["--motion-fast"]).toBe(`${motionDurations.fast}ms`);
		expect(root["--motion-base"]).toBe(`${motionDurations.base}ms`);
		expect(root["--motion-slow"]).toBe(`${motionDurations.slow}ms`);
	});

	it("mirrors the CSS content width in the JS tokens", () => {
		expect(root["--content-max-width"]).toBe(`${contentMaxWidth}px`);
	});

	it("layers surfaces above the Mica base in both themes (ADR-0017)", () => {
		// Fluent reads depth by lightness: cards sit *above* the page.
		expect(root["--color-bg"]).toBe("#f3f3f3");
		expect(root["--color-surface"]).toBe("#ffffff");
		expect(dark["--color-bg"]).toBe("#202020");
		expect(dark["--color-surface"]).toBe("#2b2b2b");
	});

	it("resolves the accent fill per theme so components never branch", () => {
		expect(root["--color-accent-fill"]).toBe("var(--color-accent-dark2)");
		expect(root["--color-on-accent"]).toBe("#ffffff");
		// WinUI dark: light accent fill carrying near-black text
		expect(dark["--color-accent-fill"]).toBe("var(--color-accent-light1)");
		expect(dark["--color-on-accent"]).not.toBe("#ffffff");
	});
});
