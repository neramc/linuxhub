/**
 * The MX team's release infrastructure, shared by MX Linux and antiX (the two
 * projects publish through the same servers):
 *
 * - rsync-mxlinux.org: the master copy of the ISO tree that the official
 *   mirror network (MX's mirmon list, antiX's download page) rsyncs from.
 *   `MX/Final/<Edition>/` and `ANTIX/Final/<release>/` hold every image with
 *   its `<file>.sha256`, `.sig`, `.md5` and `.zsync`; a mirror root plus the
 *   same path is the same file. Plain autoindex pages, no robots.txt.
 * - l2.mxrepo.com/torrents/: the torrent files of the current images.
 * - SourceForge: both projects' headline download (sourceforge.net/projects/
 *   mx-linux and antix-linux, lib/sourceforge.ts).
 */
import type { Checksum } from "../../../src/lib/data-schemas";
import { getText } from "../http";
import { parseChecksums } from "./checksums";
import { listDirectory } from "./dirlist";
import type { SfEntry } from "./sourceforge";

/** Master of the MX ISO mirror tree; root + path below is the file on every mirror. */
export const MX_ISO_MASTER = "https://rsync-mxlinux.org/";
const TORRENTS = "https://l2.mxrepo.com/torrents/";

/** Entries of a master folder (folders end with "/"). `path` has no leading slash, e.g. "MX/Final/Xfce". */
export const masterFolder = (path: string): Promise<string[]> =>
  listDirectory(`${MX_ISO_MASTER}${path.replace(/\/$/, "")}/`);

/**
 * The SHA-256 the project publishes next to an image (`<file>.sha256`, GNU
 * format) on the master. Throws unless it names exactly that file.
 */
export async function masterSha256(path: string): Promise<string> {
  const file = path.split("/").pop() ?? path;
  const sums = parseChecksums(await getText(`${MX_ISO_MASTER}${path}.sha256`));
  const value = sums.get(file);
  if (sums.size !== 1 || !value || !/^[0-9a-f]{64}$/.test(value))
    throw new Error(`${MX_ISO_MASTER}${path}.sha256 is not a SHA-256 of ${file}`);
  return value;
}

/** Torrent URLs by file name: "<image>.torrent" in the MX torrent directory. */
export async function torrentUrls(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const name of await listDirectory(TORRENTS))
    if (name.endsWith(".torrent")) out.set(name.slice(0, -".torrent".length), `${TORRENTS}${name}`);
  if (!out.size) throw new Error(`no torrent files listed at ${TORRENTS}`);
  return out;
}

/** The link SourceForge's own pages and the projects' download pages use for a file. */
export const sourceforgeDownloadUrl = (project: string, path: string) =>
  `https://sourceforge.net/projects/${project}/files/${path.replace(/^\//, "")}/download`;

/**
 * The strongest hash SourceForge computed for a file (sha256 > sha1 > md5),
 * for files whose project publishes no checksum file; `url` is the files page
 * that shows it.
 */
export function sourceforgeChecksum(entry: SfEntry, url: string): Checksum | null {
  if (entry.sha256) return { type: "sha256", value: entry.sha256, url };
  if (entry.sha1) return { type: "sha1", value: entry.sha1, url };
  if (entry.md5) return { type: "md5", value: entry.md5, url };
  return null;
}

/**
 * A mirror root from a mirror's directory URL: everything before `tree`
 * ("ANTIX/Final/", "MX/Final/"), so that root + path is the file. Null when
 * the URL does not contain the tree (a mirror with its own layout).
 */
export function mirrorRoot(url: string, tree: string): string | null {
  const at = url.indexOf(`/${tree}`);
  return at < 0 ? null : url.slice(0, at + 1);
}
