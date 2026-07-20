import { isLocale } from "@linuxhub/i18n";
import type { ParamMatcher } from "@sveltejs/kit";

// Validates the optional locale prefix against the registry (.ai/i18n.md);
// unknown prefixes fall through and 404.
export const match: ParamMatcher = (param) => isLocale(param);
