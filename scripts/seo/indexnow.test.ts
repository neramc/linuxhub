import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changedPages, KEY, pageUrls } from "./indexnow";

const files = new Set([
  "src/content/distros/fedora.yaml",
  "src/content/distros/ubuntu.yaml",
  "src/content/distro-docs/fedora/ko/install.mdx",
  "src/content/distro-docs/fedora/en/install.mdx",
]);
const exists = (f: string) => files.has(f);
const pages = (changed: string[]) =>
  Object.fromEntries(changedPages(changed, exists).map((p) => [p.path, p.locales.join(",")]));

describe("changedPages", () => {
  it("maps a release sync to the distro page and its written install guide", () => {
    expect(pages(["src/data/releases/fedora.json", "src/data/history.json"])).toEqual({
      "/distros/fedora/": "ko,en",
      "/distros/fedora/install/": "ko,en",
      "/": "ko,en",
      "/releases/": "ko,en",
    });
    expect(pages(["src/data/releases/ubuntu.json"])).toEqual({ "/distros/ubuntu/": "ko,en" });
  });

  it("keeps a document to its own locale", () => {
    expect(
      pages(["src/content/distro-docs/ubuntu/ko/overview.mdx", "src/content/learn/en/history.mdx"]),
    ).toEqual({ "/distros/ubuntu/": "ko", "/learn/history/": "en", "/learn/": "en" });
  });

  it("ignores mirror lists, sync status, unknown distros and non-site files", () => {
    expect(
      pages([
        "src/data/mirrors/fedora.json",
        "src/data/status.json",
        "src/data/releases/gone.json",
        "docs/seo.md",
        "scripts/sync/run.ts",
      ]),
    ).toEqual({});
  });

  it("sends a shared-code change to the hub pages", () => {
    expect(Object.keys(pages(["src/styles/base.css"]))).toEqual([
      "/",
      "/distros/",
      "/releases/",
      "/learn/",
    ]);
  });
});

describe("pageUrls", () => {
  it("puts English pages under /en", () => {
    expect(
      pageUrls([{ path: "/distros/fedora/", locales: ["ko", "en"] }], "https://linuxhub.kro.kr/"),
    ).toEqual([
      "https://linuxhub.kro.kr/distros/fedora/",
      "https://linuxhub.kro.kr/en/distros/fedora/",
    ]);
  });
});

it("publishes the key at the site root", () => {
  expect(readFileSync(`public/${KEY}.txt`, "utf8").trim()).toBe(KEY);
});
