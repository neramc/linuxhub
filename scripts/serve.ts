/**
 * Minimal static server for the production build in dist/ (local preview and
 * Playwright). `astro preview` is unavailable once the site has an on-demand
 * route with @astrojs/vercel. /api/geo is not served here: the download
 * wizard falls back to the browser's time zone, and e2e tests mock it.
 *
 * Usage: bun scripts/serve.ts [--port=4322] [--root=<dir>] [--config=<config.json>]
 * --root/--config serve a copied build (e.g. a snapshot of dist/client and
 * .vercel/output/config.json) instead of the current one.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve as resolvePath } from "node:path";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = Number(arg("port") ?? 4322);
// With an on-demand route the adapter puts static files in dist/client/.
const dist = join(import.meta.dir, "..", "dist");
const rootArg = arg("root");
const root = rootArg
  ? resolvePath(rootArg)
  : existsSync(join(dist, "client"))
    ? join(dist, "client")
    : dist;

// Emulate Vercel's per-route static headers (the CSP Astro computes per page).
const routeHeaders = new Map<string, Record<string, string>>();
const configArg = arg("config");
const configPath = configArg
  ? resolvePath(configArg)
  : join(import.meta.dir, "..", ".vercel", "output", "config.json");
if (existsSync(configPath)) {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    routes?: { src?: string; headers?: Record<string, string>; status?: number }[];
  };
  for (const route of config.routes ?? []) {
    if (
      route.src &&
      route.headers &&
      !route.status &&
      route.src.startsWith("/") &&
      !/[\^$()*?[\]]/.test(route.src)
    ) {
      routeHeaders.set(route.src, route.headers);
    }
  }
}

function resolve(pathname: string): string | null {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(root, safe);
  if (!candidate.startsWith(root)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const index = join(candidate, "index.html");
  if (existsSync(index)) return index;
  return null;
}

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    // Mirror Vercel's trailingSlash: "always" for page paths.
    if (
      !url.pathname.endsWith("/") &&
      !/\.[a-z0-9]+$/i.test(url.pathname) &&
      resolve(`${url.pathname}/`)
    ) {
      return Response.redirect(`${url.pathname}/${url.search}`, 308);
    }
    const file = resolve(url.pathname);
    if (file)
      return new Response(Bun.file(file), { headers: routeHeaders.get(url.pathname) ?? {} });
    const notFound = join(root, "404.html");
    return new Response(existsSync(notFound) ? Bun.file(notFound) : "Not found", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Serving dist/ on http://localhost:${port}`);
