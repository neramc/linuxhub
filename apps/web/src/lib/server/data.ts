// Mock catalog data serving the BFF until Phase 5 lands the Hono/D1 backend.
// Shapes follow .ai/api.md; the BFF routes wrap these in the shared envelope,
// so swapping to the real Worker later only changes the fetch target.

export type Distro = {
	slug: string;
	name: string;
	summary: string;
	family: string;
	familyLine: string;
	color: string;
	initials: string;
	downloads: string;
	rank: number;
	trend: number;
	categories: string[];
};

export const DISTROS: Distro[] = [
	{
		slug: "ubuntu",
		name: "Ubuntu",
		summary: "Predictable LTS releases and a huge software ecosystem",
		family: "debian",
		familyLine: "Debian family",
		color: "#e95420",
		initials: "U",
		downloads: "1.2M",
		rank: 1,
		trend: 0,
		categories: ["desktop", "beginners", "server"],
	},
	{
		slug: "fedora",
		name: "Fedora",
		summary: "The newest stable GNOME and kernel, twice a year",
		family: "rpm",
		familyLine: "RPM family",
		color: "#51a2da",
		initials: "F",
		downloads: "842K",
		rank: 2,
		trend: 1,
		categories: ["desktop"],
	},
	{
		slug: "linux-mint",
		name: "Linux Mint",
		summary: "A gentle landing for Windows switchers",
		family: "debian",
		familyLine: "Debian family · Ubuntu-based",
		color: "#69b53f",
		initials: "M",
		downloads: "731K",
		rank: 3,
		trend: -1,
		categories: ["desktop", "beginners"],
	},
	{
		slug: "arch",
		name: "Arch Linux",
		summary: "A rolling release you assemble yourself",
		family: "arch",
		familyLine: "Arch family",
		color: "#1793d1",
		initials: "A",
		downloads: "689K",
		rank: 4,
		trend: 0,
		categories: ["diy"],
	},
	{
		slug: "debian",
		name: "Debian",
		summary: "The universal operating system",
		family: "debian",
		familyLine: "Debian family · root",
		color: "#a81d33",
		initials: "D",
		downloads: "577K",
		rank: 5,
		trend: 0,
		categories: ["desktop", "server"],
	},
	{
		slug: "opensuse",
		name: "openSUSE",
		summary: "Leap for stability, Tumbleweed for rolling",
		family: "suse",
		familyLine: "SUSE family",
		color: "#73ba25",
		initials: "oS",
		downloads: "412K",
		rank: 6,
		trend: 0,
		categories: ["desktop", "server"],
	},
	{
		slug: "manjaro",
		name: "Manjaro",
		summary: "Arch's power with curated updates",
		family: "arch",
		familyLine: "Arch family",
		color: "#35bf5c",
		initials: "Mj",
		downloads: "398K",
		rank: 7,
		trend: -2,
		categories: ["desktop"],
	},
	{
		slug: "pop-os",
		name: "Pop!_OS",
		summary: "Developer-focused desktop with tiling windows",
		family: "debian",
		familyLine: "Debian family · Ubuntu-based",
		color: "#48b9c7",
		initials: "P!",
		downloads: "355K",
		rank: 8,
		trend: 1,
		categories: ["desktop"],
	},
	{
		slug: "nixos",
		name: "NixOS",
		summary: "Declarative, reproducible system configuration with rollbacks",
		family: "independent",
		familyLine: "Independent",
		color: "#5277c3",
		initials: "N",
		downloads: "287K",
		rank: 9,
		trend: 3,
		categories: ["diy"],
	},
	{
		slug: "zorin",
		name: "Zorin OS",
		summary: "A familiar desktop for Windows and macOS switchers",
		family: "debian",
		familyLine: "Debian family · Ubuntu-based",
		color: "#15a6f0",
		initials: "Z",
		downloads: "244K",
		rank: 10,
		trend: 2,
		categories: ["desktop", "beginners"],
	},
	{
		slug: "elementary",
		name: "elementary OS",
		summary: "A thoughtful, design-first desktop",
		family: "debian",
		familyLine: "Debian family · Ubuntu-based",
		color: "#64baff",
		initials: "e",
		downloads: "201K",
		rank: 11,
		trend: 0,
		categories: ["desktop", "beginners"],
	},
	{
		slug: "endeavouros",
		name: "EndeavourOS",
		summary: "Arch with a friendly installer and community",
		family: "arch",
		familyLine: "Arch family",
		color: "#7f3fbf",
		initials: "E",
		downloads: "176K",
		rank: 12,
		trend: 5,
		categories: ["diy", "desktop"],
	},
];

export const BANNERS = [
	{
		slug: "fedora",
		kicker: "home_distro_of_day",
		tagline: "The newest stable GNOME, kernel, and toolchains — reliable enough for every day.",
	},
	{
		slug: "linux-mint",
		kicker: "home_editors_pick",
		tagline: "The friendliest way off Windows — Cinnamon keeps everything where you expect it.",
	},
	{
		slug: "nixos",
		kicker: "home_rising",
		tagline: "Describe your whole system in one file — and roll back when you change your mind.",
	},
] as const;

export const RECENT_RELEASES = [
	{ slug: "nixos", title: "NixOS 26.05", subtitle: "Stable release", date: "May 31" },
	{
		slug: "ubuntu",
		title: "Ubuntu 26.04 LTS",
		subtitle: "Long-term support release",
		date: "Apr 23",
	},
	{ slug: "fedora", title: "Fedora 42", subtitle: "Stable release", date: "Apr 22" },
	{ slug: "opensuse", title: "openSUSE Leap 16.0", subtitle: "Stable release", date: "Apr 2" },
] as const;

export type Version = {
	version: string;
	channel: "release" | "beta" | "eol";
	line: string;
	note: string;
	date: string;
	size: string;
	downloads: string;
};

// Per-distro detail payloads. Only fedora carries full content in the mock;
// other slugs fall back to a generated stub so every card links somewhere.
export const FEDORA_DETAIL = {
	summary: "Fast-moving, polished, sponsored by Red Hat",
	badges: { family: "RPM family", active: true, translated: false },
	meta: [
		{ icon: "download", value: "842K", labelKey: "detail_downloads" },
		{ icon: "calendar", value: "42", label: "Latest · Apr 2026" },
		{ icon: "disk", value: "2.1 GB", label: "Workstation ISO" },
		{ icon: "chart", value: "#2", labelKey: "detail_rank_month" },
		{ icon: "cpu", value: "x86_64 +2", labelKey: "detail_architectures" },
	],
	description: [
		"Fedora is where much of the Linux desktop's future ships first. Backed by Red Hat and built by a large community, it delivers a new release roughly every six months with the latest stable GNOME, kernel, and developer toolchains — while staying reliable enough for daily work.",
	],
	editions: [
		"Workstation (GNOME)",
		"KDE Plasma spin",
		"Xfce spin",
		"Server",
		"Silverblue (Atomic)",
	],
	architectures: ["x86_64", "aarch64"],
	formats: [".iso", ".iso.torrent", "Magnet link", "Checksum", "GPG signature"],
	versions: [
		{
			version: "Fedora 42",
			channel: "release",
			line: "Workstation · x86_64 · .iso",
			note: "supported until May 2027",
			date: "2026-04-22",
			size: "2.1 GB",
			downloads: "412K",
		},
		{
			version: "Fedora 41",
			channel: "release",
			line: "Workstation · x86_64 · .iso",
			note: "end of life Nov 2026",
			date: "2025-10-29",
			size: "2.0 GB",
			downloads: "1.1M",
		},
		{
			version: "Fedora 43 Beta",
			channel: "beta",
			line: "Workstation · x86_64 · .iso",
			note: "pre-release — for testing only",
			date: "2026-09-16",
			size: "2.2 GB",
			downloads: "18K",
		},
		{
			version: "Fedora 40",
			channel: "eol",
			line: "Workstation · x86_64 · .iso",
			note: "no security updates — not recommended",
			date: "2025-04-23",
			size: "2.0 GB",
			downloads: "2.3M",
		},
	] satisfies Version[],
	mirrors: [
		{
			flag: null,
			name: "Automatic — nearest mirror",
			note: "currently KAIST, Korea",
			healthy: true,
			auto: true,
		},
		{ flag: "KR", name: "KAIST Mirror", note: "sponsored by KAIST", healthy: true, auto: false },
		{ flag: "JP", name: "JAIST Mirror", note: "sponsored by JAIST", healthy: true, auto: false },
		{ flag: "DE", name: "RWTH Aachen", note: "unhealthy · 2 h ago", healthy: false, auto: false },
	],
	sha256: "a1b6f4de8c2e4b0f6c9d3a5e7f8091b2c3d4e5f60718293a4b5c6d7e8f901a2b",
	requirements: [
		{ row: "Processor", min: "2 GHz dual-core", rec: "Quad-core" },
		{ row: "Memory", min: "2 GB", rec: "8 GB" },
		{ row: "Storage", min: "15 GB", rec: "40 GB SSD" },
		{ row: "Firmware", min: "UEFI or BIOS", rec: "UEFI + Secure Boot" },
	],
	related: ["opensuse", "debian", "nixos"],
};

export function getDistro(slug: string) {
	return DISTROS.find((d) => d.slug === slug);
}

// Compare specs per distro (.ai/api.md #46) — mock until Phase 5.
export const SPECS: Record<
	string,
	{ releaseModel: string; latest: string; desktop: string; pkg: string; minMem: string }
> = {
	ubuntu: {
		releaseModel: "Fixed — LTS every 2 years",
		latest: "26.04 LTS · Apr 2026",
		desktop: "GNOME",
		pkg: "apt + snap",
		minMem: "4 GB",
	},
	fedora: {
		releaseModel: "Fixed — every 6 months",
		latest: "42 · Apr 2026",
		desktop: "GNOME",
		pkg: "dnf + Flatpak",
		minMem: "2 GB",
	},
	"linux-mint": {
		releaseModel: "Fixed — tracks Ubuntu LTS",
		latest: "22.2 · Jan 2026",
		desktop: "Cinnamon",
		pkg: "apt + Flatpak",
		minMem: "2 GB",
	},
	arch: {
		releaseModel: "Rolling",
		latest: "rolling · daily",
		desktop: "none — you choose",
		pkg: "pacman + AUR",
		minMem: "512 MB",
	},
	debian: {
		releaseModel: "Fixed — ~2 years",
		latest: "13 · Aug 2025",
		desktop: "GNOME",
		pkg: "apt",
		minMem: "1 GB",
	},
	opensuse: {
		releaseModel: "Fixed (Leap) / Rolling (Tumbleweed)",
		latest: "Leap 16.0 · Apr 2026",
		desktop: "KDE Plasma",
		pkg: "zypper + Flatpak",
		minMem: "2 GB",
	},
	manjaro: {
		releaseModel: "Rolling — curated",
		latest: "rolling · batched",
		desktop: "KDE Plasma",
		pkg: "pacman + AUR",
		minMem: "2 GB",
	},
	"pop-os": {
		releaseModel: "Fixed — tracks Ubuntu",
		latest: "24.04 · 2024",
		desktop: "COSMIC",
		pkg: "apt + Flatpak",
		minMem: "4 GB",
	},
	nixos: {
		releaseModel: "Fixed — every 6 months",
		latest: "26.05 · May 2026",
		desktop: "none — you choose",
		pkg: "nix",
		minMem: "2 GB",
	},
	zorin: {
		releaseModel: "Fixed — tracks Ubuntu LTS",
		latest: "18 · 2026",
		desktop: "Zorin (GNOME)",
		pkg: "apt + Flatpak",
		minMem: "2 GB",
	},
	elementary: {
		releaseModel: "Fixed — tracks Ubuntu LTS",
		latest: "8 · 2025",
		desktop: "Pantheon",
		pkg: "apt + Flatpak",
		minMem: "4 GB",
	},
	endeavouros: {
		releaseModel: "Rolling",
		latest: "rolling · daily",
		desktop: "KDE Plasma (default)",
		pkg: "pacman + AUR",
		minMem: "2 GB",
	},
};

// Hall of Fame — editorial content (.ai/api.md #35).
export const HALL_OF_FAME = [
	{
		name: "Slackware",
		color: "#4e4e4e",
		initials: "S",
		era: "1993 — present",
		discontinued: false,
		why: 'The oldest surviving distribution. Its insistence on simplicity and vanilla upstream software defined a whole philosophy of Linux — one still audible in every "keep it simple" argument today.',
		sources: "slackware.com · LWN retrospective (2023)",
	},
	{
		name: "Debian",
		color: "#a81d33",
		initials: "D",
		era: "1993 — present",
		discontinued: false,
		why: "The universal operating system and the root of the largest family tree in Linux. Its Social Contract and packaging culture became the backbone for hundreds of derivatives, Ubuntu included.",
		sources: "debian.org/social_contract · debian.org/history",
	},
	{
		name: "Red Hat Linux",
		color: "#cc0000",
		initials: "RH",
		era: "1995 — 2004",
		discontinued: true,
		why: "Proved that free software could carry an enterprise. RPM, Anaconda, and the support model it pioneered live on in RHEL, CentOS's successors, and Fedora.",
		sources: "redhat.com/history · Wikipedia (Red Hat Linux)",
	},
	{
		name: "Mandrake Linux",
		color: "#c78a00",
		initials: "Md",
		era: "1998 — 2011",
		discontinued: true,
		why: "The first distribution that treated desktop usability as the product. Graphical installers and friendly defaults that feel obvious today were Mandrake inventions first.",
		sources: "Wikipedia (Mandriva) · archive.org press coverage",
	},
	{
		name: "Gentoo",
		color: "#54487a",
		initials: "G",
		era: "2002 — present",
		discontinued: false,
		why: 'Source-based and endlessly configurable — the training ground for a generation of kernel and toolchain developers. Portage made "compile everything, your way" a coherent system.',
		sources: "gentoo.org · Gentoo Wiki history",
	},
	{
		name: "Ubuntu",
		color: "#e95420",
		initials: "U",
		era: "2004 — present",
		discontinued: false,
		why: '"Linux for human beings" — the release that took desktop Linux mainstream, shipped free CDs worldwide, and set the six-month cadence much of the ecosystem still keeps time by.',
		sources: "ubuntu.com/about · launch announcement (2004)",
	},
];

// Distro-finder question set (.ai/api.md #49) — answers carry per-slug weights.
export type QuizOption = { label: string; sub: string; icon: string; w: Record<string, number> };
export type QuizQuestion = { q: string; options: QuizOption[] };

export const QUIZ: QuizQuestion[] = [
	{
		q: "How do you feel about updates?",
		options: [
			{
				label: "Set and forget",
				sub: "Update twice a year, quietly",
				icon: "check",
				w: { ubuntu: 3, "linux-mint": 3, debian: 2, zorin: 2 },
			},
			{
				label: "Fresh but stable",
				sub: "New features soon after release",
				icon: "calendar",
				w: { fedora: 3, opensuse: 2, "pop-os": 1 },
			},
			{
				label: "Always the latest",
				sub: "Rolling updates, every day",
				icon: "download",
				w: { arch: 3, endeavouros: 2, manjaro: 2 },
			},
			{
				label: "I'll manage it myself",
				sub: "Full manual control",
				icon: "sliders",
				w: { arch: 2, nixos: 3, debian: 1 },
			},
		],
	},
	{
		q: "Have you used Linux before?",
		options: [
			{
				label: "Never",
				sub: "First time",
				icon: "help",
				w: { "linux-mint": 3, zorin: 3, ubuntu: 2 },
			},
			{
				label: "A little",
				sub: "Tried a live USB or two",
				icon: "check",
				w: { ubuntu: 2, fedora: 2, "pop-os": 2 },
			},
			{
				label: "Comfortable",
				sub: "Daily driver material",
				icon: "monitor",
				w: { fedora: 2, opensuse: 2, debian: 2 },
			},
			{
				label: "Terminal is home",
				sub: "I read man pages for fun",
				icon: "cpu",
				w: { arch: 3, nixos: 3, endeavouros: 2 },
			},
		],
	},
	{
		q: "What's the machine?",
		options: [
			{
				label: "Modern laptop or desktop",
				sub: "Bought in the last few years",
				icon: "monitor",
				w: { fedora: 2, ubuntu: 2, "pop-os": 2 },
			},
			{
				label: "Older hardware",
				sub: "Give it a second life",
				icon: "cpu",
				w: { "linux-mint": 2, debian: 2, arch: 1 },
			},
			{
				label: "A server or homelab",
				sub: "Headless, always on",
				icon: "server",
				w: { debian: 3, ubuntu: 2, opensuse: 2, nixos: 2 },
			},
			{
				label: "Gaming rig",
				sub: "GPU matters",
				icon: "dice",
				w: { "pop-os": 3, manjaro: 2, fedora: 1 },
			},
		],
	},
	{
		q: "How should the desktop feel?",
		options: [
			{
				label: "Like Windows",
				sub: "Taskbar, start menu",
				icon: "monitor",
				w: { "linux-mint": 3, zorin: 3, manjaro: 1 },
			},
			{
				label: "Like macOS",
				sub: "Dock, clean lines",
				icon: "monitor",
				w: { elementary: 3, zorin: 2, "pop-os": 1 },
			},
			{
				label: "Modern GNOME",
				sub: "Gestures, activities",
				icon: "monitor",
				w: { fedora: 3, ubuntu: 2, debian: 1 },
			},
			{
				label: "I'll build my own",
				sub: "Window manager life",
				icon: "sliders",
				w: { arch: 3, nixos: 2, endeavouros: 2 },
			},
		],
	},
	{
		q: "How much tinkering do you enjoy?",
		options: [
			{
				label: "None — it should just work",
				sub: "",
				icon: "check",
				w: { "linux-mint": 3, zorin: 2, ubuntu: 2, "pop-os": 2 },
			},
			{
				label: "A weekend project is fun",
				sub: "",
				icon: "sliders",
				w: { fedora: 2, opensuse: 2, manjaro: 2 },
			},
			{
				label: "Tinkering is the point",
				sub: "",
				icon: "cpu",
				w: { arch: 3, nixos: 3, endeavouros: 2 },
			},
		],
	},
	{
		q: "How important is free (libre) software purity?",
		options: [
			{ label: "Very — as free as possible", sub: "", icon: "heart", w: { debian: 3, fedora: 2 } },
			{
				label: "Practical mix is fine",
				sub: "Codecs and drivers included",
				icon: "check",
				w: { "linux-mint": 2, ubuntu: 2, manjaro: 2, "pop-os": 2 },
			},
			{ label: "Haven't thought about it", sub: "", icon: "help", w: { zorin: 1, ubuntu: 1 } },
		],
	},
	{
		q: "If something breaks, you…",
		options: [
			{
				label: "Want it to never break",
				sub: "Stability first",
				icon: "check",
				w: { debian: 3, "linux-mint": 2, ubuntu: 2 },
			},
			{
				label: "Search forums and fix it",
				sub: "",
				icon: "search",
				w: { fedora: 2, manjaro: 2, endeavouros: 2 },
			},
			{ label: "Read the wiki and enjoy it", sub: "", icon: "info", w: { arch: 3, nixos: 2 } },
			{
				label: "Roll back and move on",
				sub: "Snapshots save lives",
				icon: "chart",
				w: { nixos: 3, opensuse: 2 },
			},
		],
	},
];
