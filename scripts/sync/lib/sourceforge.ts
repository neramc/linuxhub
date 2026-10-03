/**
 * SourceForge project file RSS (official projects only). Each item carries
 * the file path, size and an MD5 (SourceForge publishes no SHA-256 here; the
 * guides point users to the project's own SHA-256/signature files).
 */
import { getText } from "../http";

export interface SfFile {
  path: string;
  url: string;
  size: number | null;
  md5: string | null;
  date: string | null;
}

export async function sourceforgeFiles(
  project: string,
  path = "/",
  limit = 100,
): Promise<SfFile[]> {
  const url = `https://sourceforge.net/projects/${project}/rss?path=${encodeURIComponent(path)}&limit=${limit}`;
  const xml = await getText(url, { accept: "application/rss+xml" });
  const files: SfFile[] = [];
  for (const item of xml.split("<item>").slice(1)) {
    const title = item.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/)?.[1];
    const link = item.match(/<link>(.+?)<\/link>/)?.[1];
    if (!title || !link) continue;
    const size = item.match(/filesize="(\d+)"/)?.[1];
    const md5 = item.match(/<media:hash algo="md5">([0-9a-f]{32})<\/media:hash>/)?.[1];
    const date = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1];
    files.push({
      path: title,
      url: link.replace(/^http:/, "https:"),
      size: size ? Number(size) : null,
      md5: md5 ?? null,
      date: date ? new Date(date).toISOString().slice(0, 10) : null,
    });
  }
  return files;
}
