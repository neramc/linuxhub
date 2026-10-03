/**
 * Semantic checks on top of the Zod schemas, shared by run.ts (before
 * writing) and validate.ts (in CI). Returns human-readable problems.
 */
import type { MirrorsFile, ReleasesFile } from "../../src/lib/data-schemas";
import { type DistroSource, hostAllowed } from "./source";

export function checkReleases(file: ReleasesFile, source: DistroSource): string[] {
  const problems: string[] = [];
  const seenVersions = new Set<string>();
  for (const release of file.releases) {
    const key = `${release.channel}:${release.version}`;
    if (seenVersions.has(key)) problems.push(`duplicate release ${key}`);
    seenVersions.add(key);
    const editionIds = new Set<string>();
    for (const edition of release.editions) {
      if (editionIds.has(edition.id))
        problems.push(`${release.version}: duplicate edition ${edition.id}`);
      editionIds.add(edition.id);
      const files = new Set<string>();
      for (const a of edition.artifacts) {
        const where = `${release.version}/${edition.id}/${a.arch}/${a.file}`;
        if (files.has(`${a.arch}/${a.file}`)) problems.push(`${where}: duplicate artifact`);
        files.add(`${a.arch}/${a.file}`);
        for (const [label, url] of [
          ["url", a.url],
          ["checksum", a.checksum?.url],
          ["signature", a.signatureUrl],
          ["torrent", a.torrentUrl],
        ] as const) {
          if (url && !hostAllowed(url, source.hosts))
            problems.push(`${where}: ${label} host not allowlisted (${url})`);
        }
        if (a.checksum) {
          const expected = { md5: 32, sha1: 40, sha256: 64, sha512: 128, b2: 128 }[a.checksum.type];
          if (a.checksum.value.length !== expected)
            problems.push(`${where}: ${a.checksum.type} has wrong length`);
        }
        if (a.path?.startsWith("/")) problems.push(`${where}: path must be relative`);
      }
    }
  }
  return problems;
}

export function checkMirrors(file: MirrorsFile): string[] {
  const problems: string[] = [];
  const urls = new Set<string>();
  for (const m of file.mirrors) {
    if (urls.has(m.url)) problems.push(`duplicate mirror ${m.url}`);
    urls.add(m.url);
  }
  return problems;
}
