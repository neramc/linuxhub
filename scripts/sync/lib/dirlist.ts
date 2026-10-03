/**
 * Reads an Apache/nginx/lighttpd autoindex page and returns entry names
 * (files and directories, directories with a trailing "/"). Only used on
 * official download hosts whose robots.txt allows the listing.
 */
import { getText } from "../http";

export async function listDirectory(url: string): Promise<string[]> {
  const base = url.endsWith("/") ? url : `${url}/`;
  const html = await getText(base, { accept: "text/html" });
  const names = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*"([^"?#]+)"/gi)) {
    const href = match[1];
    if (!href || href.startsWith("/") || href.startsWith("..") || /^[a-z]+:/i.test(href)) continue;
    names.add(decodeURIComponent(href.replace(/^\.\//, "")));
  }
  return [...names];
}
