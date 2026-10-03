// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import { defineConfig, fontProviders } from "astro/config";
import pagefind from "astro-pagefind";

/**
 * The canonical origin. Set SITE_URL in Vercel once a custom domain exists;
 * until then the production deployment URL Vercel exposes at build time is
 * used, and local builds fall back to the dev server origin.
 */
const site =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:4321");

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  adapter: vercel({
    imageService: false,
    maxDuration: 10,
    staticHeaders: true,
  }),
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: "ko", locales: { ko: "ko-KR", en: "en-US" } },
    }),
    pagefind(),
  ],
  i18n: {
    locales: ["ko", "en"],
    defaultLocale: "ko",
    routing: { prefixDefaultLocale: false },
  },
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Adwaita Sans",
      cssVariable: "--font-adwaita-sans",
      // Adwaita Sans has no Hangul: Korean text falls through to system fonts.
      fallbacks: [
        "Apple SD Gothic Neo",
        "Malgun Gothic",
        "Noto Sans KR",
        "Noto Sans CJK KR",
        "system-ui",
        "sans-serif",
      ],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/AdwaitaSans-latin.woff2"],
            weight: "400 800",
            style: "normal",
            display: "swap",
          },
          {
            src: ["./src/assets/fonts/AdwaitaSans-Italic-latin.woff2"],
            weight: "400 700",
            style: "italic",
            display: "swap",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Adwaita Mono",
      cssVariable: "--font-adwaita-mono",
      fallbacks: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/AdwaitaMono-latin.woff2"],
            weight: "400",
            style: "normal",
            display: "swap",
          },
          {
            src: ["./src/assets/fonts/AdwaitaMono-Bold-latin.woff2"],
            weight: "700",
            style: "normal",
            display: "swap",
          },
        ],
      },
    },
  ],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  build: { inlineStylesheets: "always", format: "directory" },
  markdown: { syntaxHighlight: "prism" },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // Pagefind compiles its search index with WebAssembly.
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
});
