/** Static release data per distro, fetched by the download wizard when the visitor changes a selection. */
import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";

export const getStaticPaths: GetStaticPaths = async () =>
  (await getCollection("releases")).map((entry) => ({
    params: { slug: entry.id },
    props: { data: entry.data },
  }));

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify(props.data.releases), {
    headers: { "content-type": "application/json" },
  });
