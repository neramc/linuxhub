// Reduced-motion helper — every JS-driven animation goes through this so
// prefers-reduced-motion is always honored (.ai/design-system.md).

export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Returns 0 under reduced motion so transitions become instant. */
export function motionDuration(ms: number): number {
	return prefersReducedMotion() ? 0 : ms;
}
