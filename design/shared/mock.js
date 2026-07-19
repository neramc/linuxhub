/*
 * Linuxhub design comps — shared chrome + review controls (ADR-0012/0013).
 * Flathub-style shell: wordmark · wide search entry · nav links · locale ·
 * theme, plus the dark footer. Injected into every comp page; wires the
 * review-only interactions (theme, RTL, tabs, dialog, drawer, popover).
 * Not production code.
 */

/* ------------------------------------------------------------------ icons */

const ICONS = `
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
	<symbol id="i-logo" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2 2.5 19.5a1 1 0 0 0 .87 1.5h17.26a1 1 0 0 0 .87-1.5L12 2Zm0 5.2 5.9 10.8H6.1L12 7.2Z"/></symbol>
	<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.5-4.5"/></symbol>
	<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
	<symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
	<symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"/></symbol>
	<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
	<symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></symbol>
	<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16"/></symbol>
	<symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
	<symbol id="i-chevron-end" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
	<symbol id="i-arrow-end" viewBox="0 0 24 24"><path d="M4 12h16m0 0-6-6m6 6-6 6"/></symbol>
	<symbol id="i-arrow-start" viewBox="0 0 24 24"><path d="M20 12H4m0 0 6-6m-6 6 6 6"/></symbol>
	<symbol id="i-check" viewBox="0 0 24 24"><path d="m4.5 12.5 5 5 10-11"/></symbol>
	<symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></symbol>
	<symbol id="i-external" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></symbol>
	<symbol id="i-filter" viewBox="0 0 24 24"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/></symbol>
	<symbol id="i-dice" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1" fill="currentColor" stroke="none"/></symbol>
	<symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4m0 3v.5"/></symbol>
	<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.5"/></symbol>
	<symbol id="i-inbox" viewBox="0 0 24 24"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z"/></symbol>
	<symbol id="i-rtl" viewBox="0 0 24 24"><path d="M8 5h8M8 9h8M8 13h5"/><path d="M3 20h18"/></symbol>
	<symbol id="i-cpu" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></symbol>
	<symbol id="i-monitor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6m-3-4v4"/></symbol>
	<symbol id="i-server" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.5M7 16.5h.5"/></symbol>
	<symbol id="i-sliders" viewBox="0 0 24 24"><path d="M5 4v7m0 4v5m7-16v3m0 4v9m7-16v11m0 4v1"/><circle cx="5" cy="13" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="17" r="2"/></symbol>
</svg>`;

/* ------------------------------------------------------------------ chrome */

const NAV_ITEMS = [
	["explore", "Explore"],
	["rankings", "Rankings"],
	["hall-of-fame", "Hall of Fame"],
	["quiz", "Quiz"],
];

const LOCALES = [
	["English", "en"],
	["한국어", "ko"],
	["日本語", "ja"],
	["简体中文", "zh-Hans"],
	["Deutsch", "de"],
	["español", "es"],
	["français", "fr"],
	["português (Brasil)", "pt-BR"],
	["русский", "ru"],
	["العربية", "ar"],
	["עברית", "he"],
	["Türkçe", "tr"],
];

function icon(name, cls = "icon") {
	return `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

function headerHtml(page) {
	const nav = NAV_ITEMS.map(
		([id, label]) =>
			`<a href="./${id}.html"${page === id ? ' aria-current="page"' : ""}>${label}</a>`,
	).join("");
	const locales = LOCALES.map(
		([label, code]) =>
			`<button type="button" class="locale-option" role="option" aria-selected="${code === "en"}" dir="auto">
				${icon("i-check", "icon icon--sm")}<span>${label}</span><span class="code">${code}</span>
			</button>`,
	).join("");
	return `
	<a class="visually-hidden" href="#main">Skip to content</a>
	<header class="app-header">
		<div class="container app-header__inner">
			<button type="button" class="icon-btn hamburger" aria-label="Menu" aria-expanded="false" data-drawer-open>
				${icon("i-menu")}
			</button>
			<a class="wordmark" href="./home.html">${icon("i-logo")}<span>Linuxhub</span></a>
			<div class="search">
				${icon("i-search", "icon icon--sm")}
				<input class="search__input" type="search" placeholder="Search distributions" aria-label="Search distributions" />
			</div>
			<nav class="app-nav" aria-label="Primary">${nav}</nav>
			<div class="header-actions">
				<div class="popover-anchor">
					<button type="button" class="icon-btn locale-btn" aria-haspopup="listbox" aria-expanded="false" data-toggle="#locale-popover">
						${icon("i-globe", "icon icon--sm")}<span>EN</span>
					</button>
					<div class="locale-popover" id="locale-popover">
						<div class="locale-popover__search">
							<input class="input" type="search" placeholder="Find a language" aria-label="Find a language" />
						</div>
						<div class="locale-popover__list" role="listbox" aria-label="Language">${locales}</div>
						<div class="locale-popover__foot">Missing your language? <a href="#top">Help translate</a></div>
					</div>
				</div>
				<button type="button" class="icon-btn" aria-label="Switch theme" data-theme-toggle>${icon("i-sun")}</button>
			</div>
		</div>
	</header>`;
}

function footerHtml() {
	return `
	<footer class="app-footer">
		<div class="container app-footer__inner">
			<div>
				<a class="wordmark" href="./home.html">${icon("i-logo")}<span>Linuxhub</span></a>
				<p style="margin-block-start: var(--space-3); max-inline-size: 32ch;">
					A catalog of Linux distributions with downloads from official mirrors.
				</p>
			</div>
			<div class="footer-cols">
				<div><h3>Browse</h3><ul>
					<li><a href="./explore.html">Explore</a></li>
					<li><a href="./rankings.html">Rankings</a></li>
					<li><a href="./hall-of-fame.html">Hall of Fame</a></li>
					<li><a href="./compare.html">Compare</a></li>
					<li><a href="./quiz.html">Distro finder</a></li>
				</ul></div>
				<div><h3>Project</h3><ul>
					<li><a href="./about.html">About</a></li>
					<li><a href="./contribute.html">Contribute</a></li>
					<li><a href="./about.html">Crawler policy</a></li>
					<li><a href="./about.html">Data sources</a></li>
				</ul></div>
				<div><h3>Feeds</h3><ul>
					<li><a href="./home.html">Releases RSS</a></li>
					<li><a href="./home.html">Releases Atom</a></li>
					<li><a href="./home.html">Badges</a></li>
				</ul></div>
			</div>
		</div>
	</footer>`;
}

function drawerHtml(page) {
	const nav = [
		...NAV_ITEMS,
		["compare", "Compare"],
		["about", "About"],
		["contribute", "Contribute"],
	]
		.map(
			([id, label]) =>
				`<a href="./${id}.html"${page === id ? ' aria-current="page"' : ""}>${label}</a>`,
		)
		.join("");
	return `
	<div class="drawer-scrim" data-drawer-close></div>
	<nav class="drawer" aria-label="Menu">
		<div class="drawer__head">
			<a class="wordmark" href="./home.html">${icon("i-logo")}<span>Linuxhub</span></a>
			<button type="button" class="icon-btn" aria-label="Close menu" data-drawer-close>${icon("i-close")}</button>
		</div>
		<div class="drawer__nav">
			${nav}
			<hr class="drawer__divider" />
			<button type="button" class="drawer__utility" data-theme-toggle>
				<span>Theme</span>${icon("i-sun", "icon icon--sm")}
			</button>
			<button type="button" class="drawer__utility">
				<span>Language · English</span>${icon("i-chevron-down", "icon icon--sm")}
			</button>
		</div>
		<div class="drawer__foot"><span>RSS</span><span>GitHub</span><span>Official sources</span></div>
	</nav>`;
}

function toolbarHtml() {
	return `
	<div class="mock-toolbar" aria-label="Review controls (not part of the design)">
		<button type="button" class="icon-btn" title="Toggle theme (review)" data-theme-toggle>${icon("i-moon", "icon icon--sm")}</button>
		<button type="button" class="icon-btn" title="Toggle RTL (review)" data-rtl-toggle>${icon("i-rtl", "icon icon--sm")}</button>
	</div>`;
}

/* ------------------------------------------------------------ interactions */

function applyTheme(theme) {
	document.documentElement.dataset.theme = theme;
	try {
		localStorage.setItem("lh-comp-theme", theme);
	} catch {
		/* ignore */
	}
}

function init() {
	const page = document.body.dataset.page || "";
	document.body.insertAdjacentHTML("afterbegin", ICONS);
	if (!document.body.hasAttribute("data-no-chrome")) {
		document.body.insertAdjacentHTML("afterbegin", headerHtml(page));
		document.body.insertAdjacentHTML("beforeend", footerHtml());
		document.body.insertAdjacentHTML("beforeend", drawerHtml(page));
	}
	document.body.insertAdjacentHTML("beforeend", toolbarHtml());

	if (location.search.includes("bare")) document.body.classList.add("bare");
	if (location.search.includes("dark")) applyTheme("dark");
	else if (location.search.includes("light")) applyTheme("light");
	else {
		try {
			const saved = localStorage.getItem("lh-comp-theme");
			if (saved) applyTheme(saved);
		} catch {
			/* ignore */
		}
	}
	if (location.search.includes("rtl")) document.documentElement.dir = "rtl";

	document.addEventListener("click", (e) => {
		const t = e.target instanceof Element ? e.target : null;
		if (!t) return;

		const themeBtn = t.closest("[data-theme-toggle]");
		if (themeBtn) {
			const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
			applyTheme(cur);
			return;
		}

		if (t.closest("[data-rtl-toggle]")) {
			const html = document.documentElement;
			html.dir = html.dir === "rtl" ? "ltr" : "rtl";
			return;
		}

		if (t.closest("[data-drawer-open]")) {
			document.body.classList.add("drawer-open");
			return;
		}
		if (t.closest("[data-drawer-close]")) {
			document.body.classList.remove("drawer-open");
			return;
		}

		const toggle = t.closest("[data-toggle]");
		if (toggle) {
			const target = document.querySelector(toggle.getAttribute("data-toggle"));
			if (target) {
				const open = target.classList.toggle("is-open");
				toggle.setAttribute("aria-expanded", String(open));
			}
			return;
		}

		const opener = t.closest("[data-open-modal]");
		if (opener) {
			const modal = document.querySelector(opener.getAttribute("data-open-modal"));
			if (modal) modal.classList.add("is-open");
			return;
		}
		if (t.closest("[data-close-modal]")) {
			t.closest(".modal-scrim")?.classList.remove("is-open");
			return;
		}

		const group = t.closest("[data-collapse]");
		if (group) {
			const open = group.getAttribute("aria-expanded") !== "false";
			group.setAttribute("aria-expanded", String(!open));
			return;
		}

		const tab = t.closest('[role="tab"]');
		if (tab) {
			const list = tab.closest('[role="tablist"]');
			for (const other of list.querySelectorAll('[role="tab"]')) {
				const selected = other === tab;
				other.setAttribute("aria-selected", String(selected));
				const panel = document.getElementById(other.getAttribute("aria-controls") || "");
				if (panel) panel.hidden = !selected;
			}
			return;
		}

		const radio = t.closest('[role="radio"]');
		if (radio && !radio.disabled) {
			const scope = radio.closest('[role="radiogroup"]');
			for (const other of scope.querySelectorAll('[role="radio"]')) {
				other.setAttribute("aria-checked", String(other === radio));
			}
		}
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			document.body.classList.remove("drawer-open");
			for (const el of document.querySelectorAll(".is-open")) el.classList.remove("is-open");
		}
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
