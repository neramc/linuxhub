/**
 * Official SourceForge projects (only those the distro's own download page
 * links). Reads the project's files pages, /projects/<p>/files/<path>/, which
 * robots.txt allows for every bot, and the `net.sf.files` data embedded in
 * them: each entry's name, type and SourceForge's SHA-256, SHA-1 and MD5,
 * plus the upload date from the table.
 *
 * robots.txt disallows the project RSS feed, the mirror chooser and
 * downloads.sourceforge.net (the redirector that sends each visitor to a
 * nearby SourceForge mirror). So there are no HEAD sizes and no per-mirror
 * list: the redirector root is the distro's mirror entry (originAsMirror)
 * unless the project publishes its own mirror list, and sizes stay null
 * unless the project publishes them.
 */
import { getText } from "../http";
import { isoDay } from "./versions";

export interface SfEntry {
  name: string;
  /** Path below the project's files root, e.g. "Final/Xfce/MX-25.3_Xfce_x64.iso" (folders end with "/"). */
  path: string;
  type: "file" | "folder";
  /** Upload date (UTC day) from the files table, when shown. */
  date: string | null;
  sha256: string | null;
  sha1: string | null;
  md5: string | null;
}

interface SfData {
  name: string;
  full_path?: string;
  type?: string;
  sha256?: string;
  sha1?: string;
  md5?: string;
}

/** SourceForge's download redirector root for a project: root + entry.path is the file. */
export const sourceforgeRoot = (project: string) =>
  `https://downloads.sourceforge.net/project/${project}/`;

/** The project's files page for a folder (also the page users browse). */
export const sourceforgeFolderUrl = (project: string, path = "") =>
  `https://sourceforge.net/projects/${project}/files/${path.replace(/^\/|\/$/g, "")}${path.replace(/^\/|\/$/g, "") ? "/" : ""}`;

const hex = (v: string | undefined, length: number) =>
  v && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(v) ? v.toLowerCase() : null;

/** Reads a files page (exported for tests). */
export function parseSourceforgeFolder(html: string, folder: string): SfEntry[] {
  const json = html.match(/net\.sf\.files = (\{[\s\S]*?\});\s*\n/)?.[1];
  if (!json)
    throw new Error(`no net.sf.files data on the SourceForge files page for ${folder || "/"}`);
  const data = JSON.parse(json) as Record<string, SfData>;
  const dates = new Map<string, string | null>();
  for (const row of html.matchAll(
    /<tr title="([^"]+)" class="(?:file|folder)[^"]*">([\s\S]*?)<\/tr>/g,
  ))
    dates.set(
      row[1] ?? "",
      isoDay(row[2]?.match(/<abbr title="([^"]+)"/)?.[1]?.replace(" UTC", "Z")),
    );
  const base = folder.replace(/^\/|\/$/g, "");
  return Object.values(data).map((f) => {
    const type = f.type === "d" ? "folder" : "file";
    const path = f.full_path ?? `${base ? `${base}/` : ""}${f.name}`;
    return {
      name: f.name,
      path: type === "folder" && !path.endsWith("/") ? `${path}/` : path,
      type,
      date: dates.get(f.name) ?? null,
      sha256: hex(f.sha256, 64),
      sha1: hex(f.sha1, 40),
      md5: hex(f.md5, 32),
    };
  });
}

/** Entries of one folder of an official SourceForge project. */
export async function sourceforgeFolder(project: string, path = ""): Promise<SfEntry[]> {
  return parseSourceforgeFolder(
    await getText(sourceforgeFolderUrl(project, path), { accept: "text/html" }),
    path,
  );
}
