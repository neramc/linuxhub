import { type CollectionEntry, getCollection } from "astro:content";
import type { Locale } from "~/i18n";

export type Chapter = CollectionEntry<"learn">;
export const GROUPS = ["basics", "distros", "system", "install", "beyond"] as const;

/** Chapters of one locale in reading order; the slug is the file name without locale. */
export async function getChapters(locale: Locale): Promise<(Chapter & { slug: string })[]> {
  return (await getCollection("learn", (e) => e.id.startsWith(`${locale}/`)))
    .map((e) => Object.assign(e, { slug: e.id.slice(locale.length + 1) }))
    .sort((a, b) => a.data.order - b.data.order);
}

/** Rough reading time: ~500 Korean characters or ~220 English words per minute. */
export function readingMinutes(body: string | undefined, locale: Locale): number {
  const text = (body ?? "").replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>/g, "");
  const units =
    locale === "ko" ? text.replace(/\s/g, "").length / 500 : text.split(/\s+/).length / 220;
  return Math.max(1, Math.round(units));
}
