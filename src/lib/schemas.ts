import { z } from "astro/zod";
import {
  ARCHITECTURES,
  DESKTOPS,
  DIFFICULTIES,
  DOWNLOAD_STRATEGIES,
  FAMILIES,
  INSTALLERS,
  keysOf,
  RELEASE_MODELS,
  SECURE_BOOT,
  USE_CASES,
} from "./taxonomy";

const url = z.url({ protocol: /^https$/ });
const localized = z.object({ ko: z.string().min(1), en: z.string().min(1) });
/** YAML turns bare dates into Date objects and bare years into numbers. */
const asDateString = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? String(v) : v;
/** YYYY, YYYY-MM or YYYY-MM-DD */
const partialDate = z.preprocess(asDateString, z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/));

/**
 * Editorial catalog: one YAML file per distro in src/content/distros/.
 * Facts here are hand-researched from official sources (listed in `sources`).
 * Anything that changes with releases (versions, files, checksums, mirrors)
 * lives in src/data/ and is written by `bun run sync`, never here.
 */
export const distroSchema = z.object({
  name: z.string(),
  /** Editorial "recommended" order, 1 = shown first. Unique. */
  order: z.number().int().positive(),
  family: z.enum(keysOf(FAMILIES)),
  /** Slug of the catalog distro this one is directly based on, if any. */
  basedOn: z.string().nullable(),
  /** Human-readable upstream when it is not in the catalog (e.g. "Red Hat Enterprise Linux"). */
  upstream: z.string().optional(),
  status: z.enum(["active", "discontinued"]).default("active"),
  releaseModel: z.enum(keysOf(RELEASE_MODELS)),
  /** First entry is the default/flagship desktop. */
  desktops: z.array(z.enum(keysOf(DESKTOPS))).min(1),
  packageManagers: z.array(z.string()).min(1),
  initSystem: z.string(),
  installer: z.enum(keysOf(INSTALLERS)),
  useCases: z.array(z.enum(keysOf(USE_CASES))).min(1),
  difficulty: z.enum(keysOf(DIFFICULTIES)),
  architectures: z.array(z.enum(keysOf(ARCHITECTURES))).min(1),
  secureBoot: z.enum(keysOf(SECURE_BOOT)),
  immutable: z.boolean().default(false),
  origin: z.object({
    /** ISO 3166-1 alpha-2, or "INT" for a distributed international community. */
    country: z.string().regex(/^([A-Z]{2}|INT)$/),
    firstRelease: partialDate,
  }),
  requirements: z.object({
    ramGB: z.number().positive(),
    diskGB: z.number().positive(),
    note: localized.optional(),
  }),
  links: z.object({
    home: url,
    download: url,
    docs: url.optional(),
    installGuide: url.optional(),
    forum: url.optional(),
    releaseNotes: url.optional(),
    source: url.optional(),
  }),
  tagline: localized,
  /** Search aliases: romanizations, Hangul spellings, abbreviations. */
  aliases: z.array(z.string()).default([]),
  logo: z.object({
    /**
     * File name in src/assets/logos/. SVG unless the project publishes its
     * logo only as a raster image (ADR-0012).
     */
    file: z.string().regex(/^[a-z0-9-]+\.(svg|png)$/),
    source: url,
    license: z.string(),
    trademark: url.optional(),
  }),
  download: z.object({
    strategy: z.enum(keysOf(DOWNLOAD_STRATEGIES)),
  }),
  /** Official pages the facts above were taken from. */
  sources: z.array(url).min(1),
  lastReviewed: z.preprocess(asDateString, z.iso.date()),
});

export type DistroData = z.infer<typeof distroSchema>;
