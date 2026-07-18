import { describe, expect, it } from "vitest";
import { motionDuration } from "./motion";
import { breakpoints, gridStagger, motionDurations } from "./tokens";

describe("tokens", () => {
	it("breakpoints ascend mobile → wide", () => {
		const values = [
			breakpoints.mobile,
			breakpoints.tablet,
			breakpoints.desktop,
			breakpoints.wide,
		];
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
