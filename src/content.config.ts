import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { releasesFileSchema } from "./lib/data-schemas";
import { distroSchema } from "./lib/schemas";

/** Hand-written catalog (src/content/distros/<slug>.yaml). */
const distros = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/distros" }),
  schema: distroSchema,
});

/** Machine-written release data (src/data/releases/<slug>.json, `bun run sync`). */
const releases = defineCollection({
  loader: glob({ pattern: "*.json", base: "./src/data/releases" }),
  schema: releasesFileSchema,
});

const docMeta = z.object({
  title: z.string(),
  description: z.string(),
  /** Official pages this document paraphrases (required, see docs/content-guide.md). */
  sources: z.array(z.url({ protocol: /^https$/ })).min(1),
  lastReviewed: z.preprocess(
    (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    z.iso.date(),
  ),
});

/**
 * Per-distro documents: src/content/distro-docs/<slug>/<locale>/{overview,install}.mdx
 * (entry id: "<slug>/<locale>/<doc>").
 */
const distroDocs = defineCollection({
  loader: glob({ pattern: "*/*/*.mdx", base: "./src/content/distro-docs" }),
  schema: docMeta,
});

/** Linux guide chapters: src/content/learn/<locale>/<chapter>.mdx (id: "<locale>/<chapter>"). */
const learn = defineCollection({
  loader: glob({ pattern: "*/*.mdx", base: "./src/content/learn" }),
  schema: docMeta.extend({
    order: z.number().int().positive(),
    /** Section of the guide the chapter belongs to (src/lib/learn.ts). */
    group: z.enum(["basics", "distros", "system", "install", "beyond"]),
    /** Short label for navigation. */
    navTitle: z.string(),
    icon: z.string().default("contents"),
    /** Catalog slugs worth visiting after this chapter. */
    related: z.array(z.string()).default([]),
  }),
});

export const collections = { distros, releases, distroDocs, learn };
