/** Shared lookups for MDX data components (build time). */
import { defaultArtifact, featuredRelease, getDistro, getReleases } from "~/lib/catalog";

export async function lookup(slug: string) {
  const distro = await getDistro(slug);
  if (!distro) throw new Error(`MDX data component: unknown distro "${slug}"`);
  const releases = await getReleases(slug);
  const release = featuredRelease(releases);
  const choice = defaultArtifact(release);
  return { distro, releases, release, edition: choice?.edition, artifact: choice?.artifact };
}
