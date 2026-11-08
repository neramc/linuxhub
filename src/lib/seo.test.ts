import { describe, expect, it } from "vitest";
import {
  daumRobotsLine,
  distroLabel,
  newest,
  notAfter,
  sitemapIndexXml,
  sitemapXml,
  verificationToken,
} from "./seo";

describe("verificationToken", () => {
  it("keeps a bare token", () => {
    expect(verificationToken(" abc_DEF-123 ")).toBe("abc_DEF-123");
  });

  it("takes the content of a pasted meta tag", () => {
    expect(
      verificationToken('<meta name="naver-site-verification" content="0123456789abcdef" />'),
    ).toBe("0123456789abcdef");
  });

  it("is undefined when unset, empty or not a token", () => {
    expect(verificationToken(undefined)).toBeUndefined();
    expect(verificationToken("  ")).toBeUndefined();
    expect(verificationToken('"><script>')).toBeUndefined();
  });
});

describe("daumRobotsLine", () => {
  it("adds the prefix once", () => {
    expect(daumRobotsLine("abc123:XYZ")).toBe("#DaumWebMasterTool:abc123:XYZ");
    expect(daumRobotsLine("#DaumWebMasterTool:abc123:XYZ")).toBe("#DaumWebMasterTool:abc123:XYZ");
  });

  it("keeps a base64 id with padding", () => {
    const value =
      "b4b5128b81100cda5fe5bbf7e724c28c09e79d77601e39039e16ee41f5d2b071:8eDCqJCqTZrYCvf1G9zNRA==";
    expect(daumRobotsLine(value)).toBe(`#DaumWebMasterTool:${value}`);
    expect(daumRobotsLine(`#DaumWebMasterTool:${value}`)).toBe(`#DaumWebMasterTool:${value}`);
  });

  it("is undefined when unset or malformed", () => {
    expect(daumRobotsLine(undefined)).toBeUndefined();
    expect(daumRobotsLine("a b\nUser-agent: *")).toBeUndefined();
  });
});

describe("distroLabel", () => {
  it("leads with the Hangul name on Korean pages", () => {
    expect(distroLabel("Ubuntu", "우분투", "ko")).toBe("우분투(Ubuntu)");
    expect(distroLabel("Ubuntu", "우분투", "en")).toBe("Ubuntu");
    expect(distroLabel("KDE neon", undefined, "ko")).toBe("KDE neon");
  });
});

describe("newest", () => {
  it("returns the latest day, ignoring missing dates and times", () => {
    expect(newest("2026-10-01", undefined, "2026-11-03T10:00:00Z", null)).toBe("2026-11-03");
    expect(newest()).toBeUndefined();
  });
});

describe("sitemapXml", () => {
  it("writes escaped locs, lastmod and hreflang alternates", () => {
    const xml = sitemapXml([
      {
        loc: "https://example.org/a?b=1&c=2",
        lastmod: "2026-11-01",
        alternates: { ko: "https://example.org/a/", "x-default": "https://example.org/a/" },
      },
      { loc: "https://example.org/b/", alternates: {} },
    ]);
    expect(xml).toContain("<loc>https://example.org/a?b=1&amp;c=2</loc>");
    expect(xml).toContain("<lastmod>2026-11-01</lastmod>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.org/a/"/>',
    );
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });
});

describe("sitemapIndexXml", () => {
  it("lists each sitemap with its lastmod", () => {
    const xml = sitemapIndexXml([
      { loc: "https://example.org/sitemap.xml", lastmod: "2026-11-07" },
    ]);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://example.org/sitemap.xml</loc>");
    expect(xml).toContain("<lastmod>2026-11-07</lastmod>");
  });
});

describe("notAfter", () => {
  it("caps a date at today", () => {
    expect(notAfter("2026-12-01", "2026-11-08")).toBe("2026-11-08");
    expect(notAfter("2026-11-01", "2026-11-08")).toBe("2026-11-01");
    expect(notAfter(undefined, "2026-11-08")).toBeUndefined();
  });
});
