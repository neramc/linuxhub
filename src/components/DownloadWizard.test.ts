import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import type { ReleasesFile } from "~/lib/data-schemas";
import DownloadWizard from "./DownloadWizard.astro";

const container = await AstroContainer.create();
/** Rendered HTML without the dev-only source-location attributes. */
const render = async (...args: Parameters<typeof container.renderToString>) =>
  (await container.renderToString(...args)).replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, "");

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
  mirrors: null as { country: string | null }[] | null,
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
    // The copy script and its strings and icons come with the wizard.
    expect(html).toContain("data-copy-assets");
    expect(html).toMatch(/<h2 id="download-title"/);
  });

  it("asks each choice in a combo row, the server default selected", async () => {
    const html = await render(DownloadWizard, { props });
    expect(html.match(/<label class="adw-action-row adw-combo-row">/g)).toHaveLength(4);
    for (const name of ["version", "edition", "arch", "format"])
      expect(html).toContain(`<select name="${name}" class="combo-select">`);
    expect(html).toMatch(/<option value="44" selected>/);
    expect(html).toMatch(/<option value="desktop" selected>/);
    // One file type: the format row stays hidden until another one exists.
    expect(html).toMatch(/<li class="adw-row-item" hidden[^>]*data-format-row/);
    // No mirror list: the server is a fixed value, not a control.
    expect(html).not.toContain('name="mirror"');
    expect(html).toMatch(/data-mirror-label[^>]*>\s*자동 — 가장 가까운 공식 서버\s*</);
  });

  it("keeps the mirror select hidden until the island has ranked the mirrors", async () => {
    const withPath = structuredClone(releases);
    const artifact = withPath.releases[0]?.editions[0]?.artifacts[0];
    if (artifact) artifact.path = "/44/Example-44-x86_64.iso";
    const html = await render(DownloadWizard, {
      props: {
        ...props,
        strategy: "mirrors",
        mirrors: [{ country: "KR" }, { country: "DE" }],
        releases: withPath,
      },
    });
    expect(html).toContain('data-mirrors="/data/mirrors/example.json"');
    // The mirror groups' country names come from the server, not the browser's Intl.
    expect(html).toMatch(
      /data-countries="\{&quot;DE&quot;:&quot;독일&quot;,&quot;KR&quot;:&quot;대한민국&quot;\}"/,
    );
    expect(html).toMatch(/<select name="mirror" class="combo-select" hidden>/);
    // True without JS: the link serves the official server, and so does "".
    expect(html).toMatch(/<span data-mirror-label[^>]*>공식 서버<\/span>/);
    expect(html).toMatch(/<option value>공식 서버<\/option>/);
    expect(html).not.toContain("★");
    // The spinner, the time-zone note and the failure row wait for the island.
    expect(html).toMatch(/<span class="adw-spinner"[^>]*data-mirror-spinner hidden/);
    expect(html).toMatch(/data-geo-fallback hidden[^>]*>위치를 알 수 없어 시간대로 골랐습니다</);
    expect(html).toMatch(/<li class="adw-row-item" hidden data-mirror-error/);
    expect(html).toMatch(/role="status"[^>]*>미러 목록을 불러오지 못했습니다\./);
  });

  it("offers the mirror choice for every strategy with mirror data, the redirector first", async () => {
    const withPath = structuredClone(releases);
    const artifact = withPath.releases[0]?.editions[0]?.artifacts[0];
    if (artifact) artifact.path = "/44/Example-44-x86_64.iso";
    for (const strategy of ["redirector", "sourceforge", "mirrors"] as const) {
      const html = await render(DownloadWizard, {
        props: {
          ...props,
          strategy,
          mirrors: [{ country: "KR" }, { country: "DE" }],
          releases: withPath,
        },
      });
      expect(html).toContain('data-mirrors="/data/mirrors/example.json"');
      const official = strategy === "mirrors" ? "공식 서버" : "자동 — 가장 가까운 공식 서버";
      expect(html).toContain(`<option value>${official}</option>`);
      expect(html).toMatch(new RegExp(`<span data-mirror-label[^>]*>${official}</span>`));
    }
  });

  it("offers no server menu when the official list is the project's one server", async () => {
    const withPath = structuredClone(releases);
    const artifact = withPath.releases[0]?.editions[0]?.artifacts[0];
    if (artifact) artifact.path = "/44/Example-44-x86_64.iso";
    const html = await render(DownloadWizard, {
      props: { ...props, mirrors: [{ country: "US" }], releases: withPath },
    });
    expect(html).not.toContain("data-mirrors=");
    expect(html).not.toContain('name="mirror"');
    expect(html).toMatch(/data-mirror-label[^>]*>\s*자동 — 가장 가까운 공식 서버\s*</);
  });

  it("gives the island the default file's mirror path, so a mirror needs no release data", async () => {
    const withPath = structuredClone(releases);
    const artifact = withPath.releases[0]?.editions[0]?.artifacts[0];
    if (artifact) artifact.path = "/44/Example-44-x86_64.iso";
    const mirrored = await render(DownloadWizard, {
      props: {
        ...props,
        strategy: "mirrors",
        mirrors: [{ country: "KR" }, { country: "DE" }],
        releases: withPath,
      },
    });
    expect(mirrored).toContain('data-path="/44/Example-44-x86_64.iso"');
    expect(await render(DownloadWizard, { props })).not.toContain("data-path=");
  });

  it("announces from an empty live region outside the busy card", async () => {
    const html = await render(DownloadWizard, { props });
    expect(html).toMatch(/<p class="visually-hidden" role="status" data-wizard-status[^>]*><\/p>/);
    // After the card (and its aria-busy), not inside it.
    expect(html.indexOf("data-wizard-status")).toBeGreaterThan(html.indexOf("next-step"));
    const official = await render(DownloadWizard, {
      props: { ...props, strategy: "official-page" },
    });
    expect(official).not.toContain("data-wizard-status");
  });

  it("renders its loading, error and no-file states hidden, with every sentence", async () => {
    const html = await render(DownloadWizard, { props });
    // Error: an alert row with [Try again], in the list of choices.
    expect(html).toMatch(/<li class="adw-row-item" hidden data-wizard-error/);
    expect(html).toMatch(/<div class="adw-action-row error">/);
    expect(html).toMatch(/role="alert"[^>]*>다른 버전 정보를 불러오지 못했습니다\./);
    expect(html).toMatch(/<button type="button"[^>]*data-wizard-retry[^>]*>.*다시 시도/);
    // Loading: a spinner and its sentence, in place of the file line.
    expect(html).toMatch(
      /<p class="download-loading caption dim-label" data-loading hidden[^>]*><span class="adw-spinner" aria-hidden="true"[^>]*><\/span>\s*파일 정보를 불러오는 중…/,
    );
    expect(html).toMatch(/data-no-files hidden[^>]*>이 조합에 해당하는 파일이 없습니다\.</);
    // Copy: an empty status line right after the checksum box (copy-code.ts).
    expect(html).toMatch(
      /data-copy-checksum[^>]*>[\s\S]*?<\/button>\s*<\/div>\s*<p class="copy-status caption" role="status" data-copy-status[^>]*><\/p>/,
    );
    // Strings the island needs no longer travel as JSON.
    expect(html).not.toContain("noFiles");
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
