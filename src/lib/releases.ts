/**
 * Pure helpers over synced release data (src/data/releases/), shared by the
 * pages and the download wizard: which release and file to offer, and the
 * labels shown for them. Type-only imports, so a client script can import it
 * too (catalog.ts re-exports the release pickers for build-time code).
 */
import type { Artifact, Edition, Release } from "./data-schemas";

/** The release to feature: newest non-beta (stable/lts/rolling), else the first one. */
export function featuredRelease(
  file: { readonly releases: readonly Release[] } | undefined,
): Release | undefined {
  if (!file) return undefined;
  return (
    file.releases.find((r) => r.channel !== "beta" && r.channel !== "testing") ?? file.releases[0]
  );
}

/** The default edition + artifact to offer: first edition, prefer x86_64 ISO. */
export function defaultArtifact(
  release: Release | undefined,
): { edition: Edition; artifact: Artifact } | undefined {
  const edition = release?.editions[0];
  if (!edition) return undefined;
  const artifact =
    edition.artifacts.find((a) => a.arch === "x86_64" && a.format === "iso") ??
    edition.artifacts.find((a) => a.arch === "x86_64") ??
    edition.artifacts[0];
  return artifact ? { edition, artifact } : undefined;
}

/** "26.04 “Resolute Raccoon”", or the bare version when there is no codename. */
export function releaseName(release: Pick<Release, "version" | "codename">): string {
  return release.codename ? `${release.version} “${release.codename}”` : release.version;
}

export interface VersionLabels {
  latest: string;
  lts: string;
  channel: Record<Release["channel"], string>;
}

/**
 * A version option: its name plus tags, e.g. "44 (Latest)", "24.04 (LTS)",
 * "45 (Beta)". "Latest" marks the featured release (`featuredRelease`), the
 * same one the page shows as the latest version.
 */
export function versionLabel(
  release: Release,
  featured: Release | undefined,
  labels: VersionLabels,
): string {
  const tags: string[] = [];
  if (release.version === featured?.version) tags.push(labels.latest);
  if (release.channel === "beta" || release.channel === "testing")
    tags.push(labels.channel[release.channel]);
  if (release.channel === "lts") tags.push(labels.lts);
  const name = releaseName(release);
  return tags.length ? `${name} (${tags.join(", ")})` : name;
}

export interface ChecksumLabels {
  checksum: string;
  checksumMd5: string;
  checksumOther: string;
}

/** "SHA-256 checksum", "MD5 checksum", "SHA512 checksum". */
export function checksumLabel(sum: Artifact["checksum"], labels: ChecksumLabels): string {
  if (!sum) return labels.checksumOther;
  if (sum.type === "sha256") return labels.checksum;
  if (sum.type === "md5") return labels.checksumMd5;
  return `${sum.type.toUpperCase()} ${labels.checksumOther}`;
}

/**
 * The download button's label (SPEC §7): the `download.button` template
 * ("{format} 받기" / "Download {format}") with the file type, then the size
 * after a single middle dot when it is known: "ISO 받기 · 2.3 GB".
 */
export function downloadLabel(template: string, format: string, size: string | null): string {
  const label = template.replace("{format}", format.toUpperCase());
  return size ? `${label} · ${size}` : label;
}

/** About six months: an end of life this close is shown as a warning (SPEC §2). */
const EOL_SOON_DAYS = 183;

/**
 * Whether support for a release has ended ("passed") or ends within about
 * six months ("soon") on `today` (YYYY-MM-DD). The site is built when data
 * changes (ADR-0003), so the build day stands in for today (PLAN C23).
 */
export function eolStatus(eol: string | null, today: string): "passed" | "soon" | undefined {
  if (!eol) return undefined;
  if (eol < today) return "passed";
  const days = (Date.parse(eol) - Date.parse(today)) / 86_400_000;
  return days <= EOL_SOON_DAYS ? "soon" : undefined;
}
