/**
 * CentOS Stream.
 *
 * Official sources and what they are used for:
 * - www.centos.org/download/: the official download page. One tab per
 *   supported stream (10, 9) with the ISO link of every architecture, the
 *   cloud-image directory of every architecture, and the stream's end-of-life
 *   date. It decides which streams, architectures and images are listed.
 * - mirror.stream.centos.org (the project's origin): the per-ISO
 *   `<file>.SHA256SUM` for the `latest` alias the page links: SHA-256 and the
 *   exact size ("# <file>: N bytes").
 * - cloud.centos.org (the project's cloud-image server, linked from the page):
 *   the `CHECKSUM` file of each images directory (SHA-256, exact size) for the
 *   GenericCloud qcow2 and EC2 raw.xz images.
 * - mirrormanager.fedoraproject.org/mirrors/CentOS: the mirror list that
 *   www.centos.org/download/mirrors/ points to (country, host, the mirror's
 *   HTTPS root of its CentOS Stream tree). The per-stream pages of that
 *   MirrorManager timed out when checked, so the whole list is used.
 * - endoflife.date: only the stream's first release date.
 *
 * ISO downloads go through mirrors.centos.org, the project's MirrorManager
 * redirector (the links on the download page), and carry a mirror path.
 * Images are the moving `latest` aliases the page links (the dated composes
 * disappear from the mirrors when the next one is built), so a file's digest
 * changes with each compose and a mirror that has not synced yet can serve the
 * previous one; the version is the stream's major number.
 *
 * Excluded: boot.iso (on the servers, not offered on the download page),
 * RPM trees, container images (quay.io, oci.tar), Vagrant boxes, Azure
 * (.vhd.xz) and WSL images (not image formats the catalog schema knows), and
 * the older duplicate-named cloud files. CentOS publishes no signature or
 * torrent for these files (signatureUrl and torrentUrl are null).
 */

import type { Artifact, Edition, Release } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "../lib/checksums";
import { endOfLife } from "../lib/endoflife";
import { mirrorManagerMirrors } from "../lib/mirrormanager";
import { compareVersions } from "../lib/versions";
import { defineSource } from "../source";

const PAGE = "https://www.centos.org/download/";
const MIRROR_LIST = "https://mirrormanager.fedoraproject.org/mirrors/CentOS";
const ORIGIN = "https://mirror.stream.centos.org/";

const ARCHES: Record<string, Artifact["arch"]> = {
  x86_64: "x86_64",
  aarch64: "aarch64",
  ppc64le: "ppc64le",
  s390x: "s390x",
};

interface Pane {
  stream: string;
  eol: string | null;
  notes: string | null;
  /** arch → ISO file name on the mirrors (the `latest` alias). */
  isos: Map<string, string>;
  /** arch → cloud images directory URL (with a trailing slash). */
  cloud: Map<string, string>;
}

/** The stream tabs of the download page. */
function panes(html: string): Pane[] {
  const out: Pane[] = [];
  for (const body of html.split('<div class="tab-pane').slice(1)) {
    const isos = new Map<string, string>();
    let stream: string | undefined;
    for (const m of body.matchAll(
      /https:\/\/mirrors\.centos\.org\/mirrorlist\?path=\/(\d+)-stream\/BaseOS\/([a-z0-9_]+)\/iso\/([^&"]+)&amp;redirect=1&amp;protocol=https/g,
    )) {
      stream ??= m[1];
      if (m[1] === stream && m[2] && m[3]) isos.set(m[2], m[3]);
    }
    if (!stream) continue;
    const cloud = new Map<string, string>();
    for (const m of body.matchAll(
      new RegExp(
        `href="https://cloud\\.centos\\.org/centos/${stream}-stream/([a-z0-9_]+)/images/?"`,
        "g",
      ),
    ))
      if (m[1]) cloud.set(m[1], `https://cloud.centos.org/centos/${stream}-stream/${m[1]}/images/`);
    const eol = body.match(/End-of-life<\/th>[\s\S]*?<td>\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const notes = body.match(/href="([^"]+)"[^>]*>(?:<i[^>]*><\/i>)?\s*Release Notes/)?.[1];
    out.push({
      stream,
      eol,
      notes: notes ? new URL(notes, PAGE).href : null,
      isos,
      cloud,
    });
  }
  return out;
}

/** SHA-256 and exact size of `file` from a checksum file with "# <file>: N bytes" comments. */
function digest(text: string, file: string, where: string) {
  const sha256 = parseChecksums(text).get(file);
  const size = text.match(
    new RegExp(`^#\\s*${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(\\d+)\\s+bytes`, "m"),
  )?.[1];
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256))
    throw new Error(`${where}: no SHA-256 for ${file}`);
  return { sha256, size: size ? Number(size) : null };
}

export default defineSource({
  slug: "centos-stream",
  hosts: ["mirrors.centos.org", "mirror.stream.centos.org", "cloud.centos.org"],
  async releases(ctx) {
    const [html, eol] = await Promise.all([
      getText(PAGE, { accept: "text/html" }),
      endOfLife("centos-stream"),
    ]);
    const found = panes(html);
    if (!found.length) throw new Error(`no CentOS Stream tabs on ${PAGE}`);
    const cycles = new Map(eol.cycles.map((c) => [c.name, c]));

    const releases: Release[] = [];
    for (const pane of found.sort((a, b) => compareVersions(b.stream, a.stream))) {
      if (!pane.isos.size) throw new Error(`CentOS Stream ${pane.stream}: no ISO links`);
      if (!pane.eol)
        throw new Error(`CentOS Stream ${pane.stream}: no end-of-life date on ${PAGE}`);
      if (pane.eol < ctx.today) continue;

      const dvd: Artifact[] = [];
      for (const [arch, file] of pane.isos) {
        if (!ARCHES[arch]) {
          ctx.log(`CentOS Stream ${pane.stream}: unknown architecture ${arch} skipped`);
          continue;
        }
        const dir = `${ORIGIN}${pane.stream}-stream/BaseOS/${arch}/iso/`;
        const sumUrl = `${dir}${file}.SHA256SUM`;
        const { sha256, size } = digest(await getText(sumUrl), file, sumUrl);
        dvd.push({
          arch: ARCHES[arch] as Artifact["arch"],
          format: "iso",
          file,
          path: `${pane.stream}-stream/BaseOS/${arch}/iso/${file}`,
          url: `https://mirrors.centos.org/mirrorlist?path=/${pane.stream}-stream/BaseOS/${arch}/iso/${file}&redirect=1&protocol=https`,
          size,
          checksum: { type: "sha256", value: sha256, url: sumUrl },
          signatureUrl: null,
          torrentUrl: null,
        });
      }

      const generic: Artifact[] = [];
      const ec2: Artifact[] = [];
      for (const [arch, dir] of pane.cloud) {
        if (!ARCHES[arch]) continue;
        const sumUrl = `${dir}CHECKSUM`;
        const text = await getText(sumUrl);
        const image = (file: string, format: Artifact["format"]): Artifact => {
          const { sha256, size } = digest(text, file, sumUrl);
          return {
            arch: ARCHES[arch] as Artifact["arch"],
            format,
            file,
            path: null,
            url: `${dir}${file}`,
            size,
            checksum: { type: "sha256", value: sha256, url: sumUrl },
            signatureUrl: null,
            torrentUrl: null,
          };
        };
        generic.push(
          image(`CentOS-Stream-GenericCloud-${pane.stream}-latest.${arch}.qcow2`, "qcow2"),
        );
        // The EC2 image exists for x86_64 and aarch64 only.
        const ec2File = `CentOS-Stream-ec2-${pane.stream}-latest.${arch}.raw.xz`;
        if (parseChecksums(text).has(ec2File)) ec2.push(image(ec2File, "raw.xz"));
      }

      const all: Edition[] = [
        { id: "dvd", name: "DVD", desktop: null, kind: "server", artifacts: dvd },
        {
          id: "generic-cloud",
          name: "GenericCloud",
          desktop: null,
          kind: "cloud",
          artifacts: generic,
        },
        { id: "ec2", name: "Amazon EC2", desktop: null, kind: "cloud", artifacts: ec2 },
      ];
      const editions = all.filter((e) => e.artifacts.length);
      if (!editions.some((e) => e.id === "dvd"))
        throw new Error(`CentOS Stream ${pane.stream}: no DVD ISO`);

      releases.push({
        version: pane.stream,
        channel: "stable",
        codename: null,
        releaseDate: cycles.get(pane.stream)?.releaseDate ?? null,
        eol: pane.eol,
        notesUrl: pane.notes,
        editions,
      });
    }
    if (!releases.length)
      throw new Error("no supported CentOS Stream release on the download page");
    return { sources: [PAGE, eol.url], releases };
  },

  async mirrors() {
    // The "CentOS" entry is the mirror's copy of the CentOS Stream tree (10-stream/, 9-stream/, …).
    const { source, mirrors } = await mirrorManagerMirrors(MIRROR_LIST, "CentOS");
    return { sources: [source], mirrors };
  },
});
