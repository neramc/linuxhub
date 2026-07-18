// @linuxhub/ui — design tokens + shared Svelte components.
//
// Phase 2: tokens implemented from .ai/design-system.md (tokens.css is the
// CSS source; tokens.ts mirrors JS-needed values; motion.ts guards reduced
// motion). Components land in Phase 4 from the approved Stitch design only.
//
// CSS import for apps: `import "@linuxhub/ui/tokens.css";`

export { motionDuration, prefersReducedMotion } from "./motion";
export {
	type Breakpoint,
	breakpoints,
	contentMaxWidth,
	gridStagger,
	motionDurations,
} from "./tokens";

export const UI_VERSION = "0.1.0";
