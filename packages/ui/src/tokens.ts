// JS-side mirror of the tokens needed outside CSS.
// Source of truth: .ai/design-system.md + tokens.css — keep all three in sync.

export const breakpoints = {
	mobile: 0,
	tablet: 640,
	desktop: 1024,
	wide: 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Milliseconds — pair with motionDuration() so reduced-motion zeroes them. */
export const motionDurations = {
	fast: 120,
	base: 200,
	slow: 320,
} as const;

/** Staggered grid reveal: 30ms per card, first 12 cards only. */
export const gridStagger = { perCardMs: 30, maxCards: 12 } as const;

export const contentMaxWidth = 1176;
