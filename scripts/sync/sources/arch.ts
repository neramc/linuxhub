/**
 * Arch Linux: the official release-engineering JSON (monthly ISO snapshots,
 * SHA-256, PGP signature, torrent, magnet) and the official mirror status
 * JSON (country, ISO availability, completion, score).
 */
import type { Mirror, Release } from "../../../src/lib/data-schemas";
import { getJson } from "../http";
import { defineSource } from "../source";

const RELENG = "https://archlinux.org/releng/releases/json/";
const MIRROR_STATUS = "https://archlinux.org/mirrors/status/json/";
/** Arch's official GeoDNS mirror: picks a nearby server automatically. */
const GEO = "https://geo.mirror.pkgbuild.com/";

interface RelengRelease {
  version: string;
  release_date: string;
  available: boolean;
  sha256_sum: string | null;
  iso_url: string;
  torrent_url: string | null;
  torrent?: { file_length?: number } | null;
}

interface MirrorStatus {
  urls: {
    url: string;
    protocol: string;
    active: boolean;
    isos: boolean;
    completion_pct: number | null;
    delay: number | null;
    score: number | null;
    country_code: string;
    details: string;
  }[];
}

export default defineSource({
  slug: "arch",
  hosts: ["archlinux.org", "geo.mirror.pkgbuild.com"],
  async releases() {
    const data = await getJson<{ releases: RelengRelease[] }>(RELENG);
    const available = data.releases.filter((r) => r.available && r.sha256_sum).slice(0, 2);
    const releases: Release[] = available.map((r) => {
      const path = r.iso_url.replace(/^\//, "");
      const file = path.split("/").pop() ?? path;
      const dir = path.slice(0, path.length - file.length);
      return {
        version: r.version,
        channel: "rolling",
        codename: null,
        releaseDate: r.release_date,
        eol: null,
        notesUrl: `https://archlinux.org/releng/releases/${r.version}/`,
        editions: [
          {
            id: "live",
            name: "Live ISO",
            desktop: "none",
            kind: "live",
            artifacts: [
              {
                arch: "x86_64",
                format: "iso",
                file,
                path,
                url: `${GEO}${path}`,
                size: r.torrent?.file_length ?? null,
                checksum: {
                  type: "sha256",
                  value: (r.sha256_sum ?? "").toLowerCase(),
                  url: `https://archlinux.org/${dir}sha256sums.txt`,
                },
                signatureUrl: `https://archlinux.org/${path}.sig`,
                torrentUrl: r.torrent_url ? `https://archlinux.org${r.torrent_url}` : null,
              },
            ],
          },
        ],
      };
    });
    return { sources: [RELENG], releases };
  },
  async mirrors() {
    const data = await getJson<MirrorStatus>(MIRROR_STATUS);
    const mirrors: Mirror[] = data.urls
      .filter(
        (m) =>
          m.protocol === "https" &&
          m.active &&
          m.isos &&
          m.completion_pct === 1 &&
          m.score !== null &&
          // 3 days: generous enough that the list doesn't flap between runs.
          (m.delay ?? Number.POSITIVE_INFINITY) < 3 * 86_400,
      )
      .map((m) => ({
        url: m.url.endsWith("/") ? m.url : `${m.url}/`,
        country: /^[A-Z]{2}$/.test(m.country_code) ? m.country_code : null,
        name: new URL(m.url).hostname,
        lat: null,
        lon: null,
        // Arch's score (lower = better) moves every check; keep coarse tiers so
        // the committed list only changes when a mirror meaningfully changes.
        score: Math.max(1, Math.ceil(m.score ?? 1)),
      }));
    return { sources: [MIRROR_STATUS], mirrors };
  },
});
