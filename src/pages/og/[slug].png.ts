/** Build-time Open Graph images: /og/default.png, /og/learn.png and /og/<distro>.png. */
import type { APIRoute, GetStaticPaths } from "astro";
import { getDistros } from "~/lib/catalog";
import { readLogo, renderOg } from "~/lib/og";

export const getStaticPaths: GetStaticPaths = async () => [
  {
    params: { slug: "default" },
    props: {
      title: "Linuxhub",
      subtitle:
        "Find, download and install the right Linux — official mirrors, step-by-step guides.",
    },
  },
  {
    params: { slug: "learn" },
    props: {
      title: "The Linux Guide",
      subtitle: "Everything you need to understand and use Linux, from the kernel to everyday use.",
    },
  },
  ...(await getDistros()).map((d) => ({
    params: { slug: d.id },
    props: { title: d.data.name, subtitle: d.data.tagline.en, logo: d.data.logo.file },
  })),
];

export const GET: APIRoute = ({ props }) => {
  const png = renderOg({
    title: props.title as string,
    subtitle: props.subtitle as string,
    ...(props.logo ? { logo: readLogo(props.logo as string) } : {}),
  });
  return new Response(new Blob([new Uint8Array(png)], { type: "image/png" }));
};
