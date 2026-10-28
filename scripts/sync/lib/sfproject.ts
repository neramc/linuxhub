/**
 * Reading a SourceForge-hosted project the way its download page links it
 * (lib/sourceforge.ts reads one files page; this ties a page's links to the
 * files pages). Two projects that only publish on SourceForge use it: the
 * download page links `https://sourceforge.net/projects/<p>/files/<path>/download`
 * (or without `/download` for torrents); `<path>` is the file's place below the
 * downloads.sourceforge.net/project/<p>/ mirror root.
 */
import { type SfEntry, sourceforgeFolder } from "./sourceforge";

/**
 * The path below the project's files root that a download page link points to
 * ("lxqt/sparkylinux-8.4-x86_64-lxqt.iso" for ".../files/lxqt/sparkylinux-8.4-x86_64-lxqt.iso/download"),
 * or null for any other link (another host, another project, a folder).
 */
export function sourceforgeLinkPath(project: string, href: string): string | null {
  const m = href.match(
    new RegExp(`^https://sourceforge\\.net/projects/${project}/files/(.+?)(?:/download)?$`),
  );
  const path = m?.[1];
  return path && !path.endsWith("/") ? path : null;
}

export interface SourceforgeTree {
  /** The file at `path` below the project's files root, or null when its folder does not list it. */
  entry(path: string): Promise<SfEntry | null>;
}

/**
 * A project's files pages, each folder read once however many files are asked
 * for (one request per folder, paced by the HTTP client).
 */
export function sourceforgeTree(project: string): SourceforgeTree {
  const folders = new Map<string, Promise<Map<string, SfEntry>>>();
  return {
    async entry(path) {
      const at = path.lastIndexOf("/");
      const folder = at < 0 ? "" : path.slice(0, at);
      let listing = folders.get(folder);
      if (!listing) {
        listing = sourceforgeFolder(project, folder).then(
          (entries) => new Map(entries.map((e) => [e.name, e])),
        );
        folders.set(folder, listing);
      }
      const entry = (await listing).get(path.slice(at + 1));
      return entry?.type === "file" ? entry : null;
    },
  };
}
