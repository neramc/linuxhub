/**
 * Static, compact official mirror list per distro for the download wizard
 * (fetched on demand in the browser, ranked client-side by src/lib/mirrors.ts).
 */
import type { APIRoute, GetStaticPaths } from "astro";
import countries from "~/data/geo/countries.json";
import { getMirrors, mirrorSlugs } from "~/lib/catalog";
import type { MirrorPayload } from "~/lib/mirrors";

export const getStaticPaths: GetStaticPaths = () =>
  mirrorSlugs().map((slug) => ({ params: { slug } }));

export const GET: APIRoute = ({ params }) => {
  const file = getMirrors(params.slug ?? "");
  if (!file) return new Response("Not found", { status: 404 });
  const centroids = countries as Record<string, { lat: number; lon: number }>;
  const payload: MirrorPayload = {
    mirrors: file.mirrors.map((m) => ({
      u: m.url,
      c: m.country,
      n: m.name,
      la: m.lat,
      lo: m.lon,
      s: m.score,
    })),
    countries: Object.fromEntries(
      [...new Set(file.mirrors.map((m) => m.country).filter((c): c is string => Boolean(c)))]
        .filter((cc) => centroids[cc])
        .map((cc) => [cc, [centroids[cc]?.lat ?? 0, centroids[cc]?.lon ?? 0]]),
    ),
  };
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
};
