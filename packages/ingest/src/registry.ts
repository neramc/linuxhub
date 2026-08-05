// Which upstream source serves which distro.
//
// This file holds POINTERS, never facts. A row says "Ubuntu's release data
// comes from the endoflife.date product `ubuntu`" — it never says what Ubuntu's
// version is. Every factual value is fetched and stored with its `source_url`
// and `fetched_at` (.ai/data-sources.md, binding).
//
// Identity — display name, homepage, summary, citations — is not here either:
// it comes from the authored, cited MDX frontmatter via `content-index.json`.
//
// Each row mirrors the per-distro table in .ai/data-sources.md. A distro is not
// added here until that table has its row with robots/ToS verified.

export type ReleaseSource =
	/** Fixed-cadence distro tracked by endoflife.date. */
	| { kind: "endoflife"; product: string }
	/** Rolling: there are no version cycles to fetch. The official ISO-snapshot
	 *  endpoints for these are identified but not yet verified, so no release
	 *  rows are written rather than inventing one (see .ai/data-sources.md). */
	| { kind: "rolling" }
	/** Fixed-cadence, but no machine-readable release source found yet. Distinct
	 *  from `rolling`: these DO have versions, we just cannot source them
	 *  honestly, so the catalog says nothing rather than something invented. */
	| { kind: "unsourced" };

export type MirrorSource = "arch" | "fedora";

/**
 * Whether a mirror source publishes base URLs our artifact paths are relative
 * to.
 *
 * Arch's status JSON lists mirror roots (`https://host/archlinux/`), which
 * `iso/2026.08.01/…iso` extends. Fedora's MirrorManager lists per-repo
 * directories (`…/releases/44/Everything/x86_64/os/`) — a real fact about who
 * mirrors Fedora, but not a base any artifact path extends. Fedora artifacts
 * are relative to the redirector instead, which is registered separately.
 */
export const MIRROR_SERVES_ARTIFACTS: Record<MirrorSource, boolean> = {
	arch: true,
	fedora: false,
};

export type DistroSourceRow = {
	slug: string;
	release: ReleaseSource;
	mirrors?: MirrorSource;
};

export const DISTRO_SOURCES: DistroSourceRow[] = [
	{ slug: "ubuntu", release: { kind: "endoflife", product: "ubuntu" } },
	{ slug: "fedora", release: { kind: "endoflife", product: "fedora" }, mirrors: "fedora" },
	{ slug: "linux-mint", release: { kind: "endoflife", product: "linuxmint" } },
	{ slug: "arch", release: { kind: "rolling" }, mirrors: "arch" },
	{ slug: "debian", release: { kind: "endoflife", product: "debian" } },
	{ slug: "opensuse", release: { kind: "endoflife", product: "opensuse" } },
	{ slug: "manjaro", release: { kind: "rolling" } },
	{ slug: "pop-os", release: { kind: "endoflife", product: "pop-os" } },
	{ slug: "nixos", release: { kind: "endoflife", product: "nixos" } },
	{ slug: "zorin", release: { kind: "unsourced" } },
	{ slug: "elementary", release: { kind: "unsourced" } },
	{ slug: "endeavouros", release: { kind: "rolling" } },
];

export function releaseSourcesFor(kind: ReleaseSource["kind"]): DistroSourceRow[] {
	return DISTRO_SOURCES.filter((row) => row.release.kind === kind);
}

export function mirrorSourcesFor(source: MirrorSource): DistroSourceRow[] {
	return DISTRO_SOURCES.filter((row) => row.mirrors === source);
}
