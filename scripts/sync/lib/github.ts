/** GitHub Releases (official project repositories only). Uses GITHUB_TOKEN when present. */
import { getJson } from "../http";

export interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

export interface GhRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: GhAsset[];
}

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function githubReleases(repo: string, limit = 10): Promise<GhRelease[]> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=${limit}`;
  const releases = await getJson<GhRelease[]>(url, {
    headers: headers(),
    accept: "application/vnd.github+json",
  });
  return releases.filter((r) => !r.draft);
}

/** GitHub now reports "sha256:<hex>" digests for release assets. */
export function assetSha256(asset: GhAsset): string | null {
  const m = asset.digest?.match(/^sha256:([0-9a-f]{64})$/);
  return m?.[1] ?? null;
}
