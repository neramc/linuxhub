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
