// Theme before first paint: stored choice wins, then system preference.
//
// A separate file rather than an inline <script> in app.html, because CSP is
// on (.ai/security.md) and SvelteKit only adds its nonce to the scripts it
// injects itself — an inline script here would be blocked, and the page would
// paint light before hydration corrected it. `script-src 'self'` covers this.
//
// Loaded without defer/async on purpose: it has to run before the first paint,
// which is the whole point of it.
try {
	let theme = localStorage.getItem("lh-theme");
	if (!theme) {
		theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}
	document.documentElement.dataset.theme = theme;
} catch {}
