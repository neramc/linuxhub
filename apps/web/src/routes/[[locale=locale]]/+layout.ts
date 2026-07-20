import { BASE_LOCALE, setLocale } from "@linuxhub/i18n";
import type { LayoutLoad } from "./$types";

// Resolves the validated locale segment and primes the message runtime —
// on the server this mirrors the AsyncLocalStorage set in hooks.server.ts;
// in the browser it is the per-document locale.
export const load: LayoutLoad = ({ params }) => {
	const locale = params.locale ?? BASE_LOCALE;
	setLocale(locale);
	return { locale };
};
