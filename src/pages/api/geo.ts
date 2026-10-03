/**
 * The site's only server function. Returns the visitor's approximate location
 * from Vercel's edge headers (country + city-level coordinates) so the
 * download wizard can suggest the nearest official mirror.
 *
 * Privacy: nothing is logged or stored, and the response is never cached
 * (docs/decisions.md ADR-0004).
 */
import { geolocation } from "@vercel/functions";
import type { APIRoute } from "astro";

export const prerender = false;

const num = (v: string | undefined) => {
  const n = v === undefined ? Number.NaN : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

export const GET: APIRoute = ({ request }) => {
  const geo = geolocation(request);
  const cc = geo.country && /^[A-Z]{2}$/.test(geo.country) ? geo.country : null;
  return new Response(JSON.stringify({ cc, lat: num(geo.latitude), lon: num(geo.longitude) }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
};
