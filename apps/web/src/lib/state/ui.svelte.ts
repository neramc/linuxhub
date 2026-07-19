// Cross-cutting client UI state (.ai/frontend-rules.md): kept minimal —
// the server is the source of truth for data.

export const ui = $state({
	drawerOpen: false,
	localeOpen: false,
	paletteOpen: false,
});

export function toggleTheme() {
	const html = document.documentElement;
	const next = html.dataset.theme === "dark" ? "light" : "dark";
	html.dataset.theme = next;
	try {
		localStorage.setItem("lh-theme", next);
	} catch {
		// private mode etc. — theme still applies for this page
	}
}
