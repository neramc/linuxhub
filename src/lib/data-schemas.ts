/**
 * Schemas for the machine-written data in src/data/ (produced by
 * `bun run sync`, consumed by the site). Shared by the sync scripts and the
 * Astro content collections so both sides agree on one shape.
 */
import { z } from "astro/zod";
import { ARCHITECTURES, DESKTOPS, keysOf } from "./taxonomy";

const httpsUrl = z.url({ protocol: /^https$/ });
const isoDate = z.iso.date();

export const CHANNELS = ["stable", "lts", "rolling", "beta", "testing"] as const;
export const EDITION_KINDS = [
  "desktop",
  "server",
  "minimal",
  "netinst",
  "live",
  "cloud",
  "other",
] as const;
export const FORMATS = [
  "iso",
  "img",
  "img.xz",
  "img.gz",
  "raw.xz",
  "qcow2",
  "tar.xz",
  "zip",
] as const;

export const checksumSchema = z.object({
  type: z.enum(["sha256", "sha512", "sha1", "md5", "b2"]),
  value: z.string().regex(/^[0-9a-f]+$/),
  /** The official checksum file (always on the project's origin host). */
  url: httpsUrl.nullable(),
});

export const artifactSchema = z.object({
  arch: z.enum(keysOf(ARCHITECTURES)),
  format: z.enum(FORMATS),
  file: z.string().min(1),
  /** Path relative to a mirror root; null when the file is only on the official host/CDN. */
  path: z.string().nullable(),
  /** Canonical official URL (origin host or the project's geo-redirector/CDN). */
  url: httpsUrl,
  size: z.number().int().positive().nullable(),
  checksum: checksumSchema.nullable(),
  signatureUrl: httpsUrl.nullable(),
  torrentUrl: httpsUrl.nullable(),
});

export const editionSchema = z.object({
  /** Stable id within the release, e.g. "workstation", "kde", "netinst". */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Display name as the project spells it (not translated). */
  name: z.string().min(1),
  desktop: z.enum(keysOf(DESKTOPS)).nullable(),
  kind: z.enum(EDITION_KINDS),
  artifacts: z.array(artifactSchema).min(1),
});

export const releaseSchema = z.object({
  version: z.string().min(1),
  channel: z.enum(CHANNELS),
  codename: z.string().nullable(),
  releaseDate: isoDate.nullable(),
  /** End of (security) support; null when unknown or for rolling releases. */
  eol: isoDate.nullable(),
  notesUrl: httpsUrl.nullable(),
  editions: z.array(editionSchema),
});

export const releasesFileSchema = z.object({
  slug: z.string(),
  /** Where the facts came from (official endpoints/pages). */
  sources: z.array(httpsUrl).min(1),
  /** Date the data last changed (not when it was last checked). */
  updated: isoDate,
  releases: z.array(releaseSchema).min(1),
});

export const mirrorSchema = z.object({
  /** Mirror root for the distro's tree, always ending with "/". */
  url: httpsUrl.refine((u) => u.endsWith("/"), "mirror url must end with /"),
  /** ISO 3166-1 alpha-2, or null when the official list doesn't say. */
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  name: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  /** Upstream quality score where the project publishes one (lower is better for Arch). */
  score: z.number().nullable(),
});

export const mirrorsFileSchema = z.object({
  slug: z.string(),
  sources: z.array(httpsUrl).min(1),
  updated: isoDate,
  mirrors: z.array(mirrorSchema),
});

export const historyEntrySchema = z.object({
  slug: z.string(),
  version: z.string(),
  channel: z.enum(CHANNELS),
  /** Official release date when known, else the date we first saw it. */
  date: isoDate,
  /** Date our sync first recorded it. */
  detected: isoDate,
});

export const historyFileSchema = z.array(historyEntrySchema);

export const statusEntrySchema = z.object({
  releases: z
    .object({
      failingSince: isoDate.nullable(),
      lastError: z.string().nullable(),
    })
    .optional(),
  mirrors: z
    .object({
      failingSince: isoDate.nullable(),
      lastError: z.string().nullable(),
    })
    .optional(),
});

export const statusFileSchema = z.record(z.string(), statusEntrySchema);

/** One distro in the "popular today" ranking (ADR-0013). */
export const popularityItemSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Canonical English Wikipedia article title, with spaces (e.g. "Fedora Linux"). */
  article: z.string().min(1),
  /** Pageviews by people (agent=user, all-access) on `day`. */
  views: z.number().int().nonnegative(),
  /** 1 = most viewed on `day`. */
  rank: z.number().int().positive(),
  /** Rank among the same articles on the day before; null when that day has no data. */
  prevRank: z.number().int().positive().nullable(),
});

/** src/data/popularity.json: Wikipedia pageview ranking of the catalog (ADR-0013). */
export const popularityFileSchema = z.object({
  /** Wikimedia Pageviews REST API endpoint the numbers came from (data is CC0). */
  source: httpsUrl,
  project: z.literal("en.wikipedia"),
  /** The complete UTC day the ranking describes (normally yesterday). */
  day: isoDate,
  /** Sorted by views (desc), ties by slug; ranks are 1..n. */
  items: z.array(popularityItemSchema),
});

export type Checksum = z.infer<typeof checksumSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Edition = z.infer<typeof editionSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleasesFile = z.infer<typeof releasesFileSchema>;
export type Mirror = z.infer<typeof mirrorSchema>;
export type MirrorsFile = z.infer<typeof mirrorsFileSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type StatusFile = z.infer<typeof statusFileSchema>;
export type PopularityItem = z.infer<typeof popularityItemSchema>;
export type PopularityFile = z.infer<typeof popularityFileSchema>;
