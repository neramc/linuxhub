import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import type { ReleasesFile } from "~/lib/data-schemas";
import DownloadWizard from "./DownloadWizard.astro";

const container = await AstroContainer.create();

const releases: ReleasesFile = {
  slug: "example",
  sources: ["https://example.org/releases"],
  updated: "2026-10-01",
  releases: [
    {
      version: "44",
      channel: "stable",
      codename: null,
      releaseDate: "2026-04-28",
      eol: null,
      notesUrl: null,
      editions: [
        {
          id: "desktop",
          name: "Desktop",
          desktop: null,
          kind: "desktop",
          artifacts: [
            {
              arch: "x86_64",
              format: "iso",
              file: "Example-44-x86_64.iso",
              path: null,
              url: "https://download.example.org/Example-44-x86_64.iso",
              size: 2.3e9,
              checksum: {
                type: "sha256",
                value: "ab".repeat(32),
                url: "https://example.org/CHECKSUM",
              },
              signatureUrl: null,
              torrentUrl: null,
            },
          ],
        },
      ],
    },
  ],
};

const props = {
  slug: "example",
  locale: "ko" as const,
  strategy: "redirector" as const,
  officialDownload: "https://example.org/download/",
  releases,
  hasMirrors: false,
  guide: undefined as string | undefined,
  officialGuide: "https://docs.example.org/install/",
};

const suggested = (html: string) => html.match(/class="adw-button suggested[^"]*"/g) ?? [];

describe("DownloadWizard", () => {
  it("ends in one suggested button named after the file, and the guide's USB step", async () => {
    const html = await container.renderToString(DownloadWizard, {
      props: { ...props, guide: "/distros/example/install/" },
    });
    expect(suggested(html)).toHaveLength(1);
    expect(html).toMatch(/data-download[^>]*>|<a [^>]*data-download/);
    expect(html).toContain("ISO 받기 · 2.3 GB");
    expect(html).toContain('href="/distros/example/install/#verify"');
    expect(html).toContain('href="/distros/example/install/#usb"');
    expect(html).toContain('aria-label="체크섬 복사"');
    expect(html).toMatch(/<h2 id="download-title"/);
  });

  it("points at the official install docs when the guide is not written", async () => {
    const html = await container.renderToString(DownloadWizard, { props });
    expect(html).not.toContain("#verify");
    expect(html).not.toContain("#usb");
    expect(html).toContain("다음 단계: 공식 설치 안내");
    expect(html).toMatch(/href="https:\/\/docs\.example\.org\/install\/" rel="noopener external"/);
  });

  it("gives the true reason when only the official page offers the download", async () => {
    const official = await container.renderToString(DownloadWizard, {
      props: { ...props, strategy: "official-page", locale: "en" },
    });
    expect(official).toContain("only offers downloads from its own website");
    // The latest version is the row's subtitle, from an i18n template.
    expect(official).toMatch(/<span class="adw-row-subtitle"[^>]*>Latest 44<\/span>/);
    expect(official).not.toContain("data-wizard");
    expect(suggested(official)).toHaveLength(1);

    const missing = await container.renderToString(DownloadWizard, {
      props: { ...props, releases: undefined, locale: "en" },
    });
    expect(missing).toContain("aren’t ready yet");
    // No release: no subtitle element at all (not an empty one).
    expect(missing).not.toContain("adw-row-subtitle");
    expect(missing).toContain('href="https://example.org/download/"');
  });
});
