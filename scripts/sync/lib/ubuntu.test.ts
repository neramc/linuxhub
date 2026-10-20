import { describe, expect, it } from "vitest";
import {
  anchors,
  currentLines,
  type ImageDir,
  imageArtifact,
  imagesMentioned,
  newestBy,
  parseDate,
  parseImageName,
  parseReleaseList,
} from "./ubuntu";

const row = (cells: string[]) => `<tr><td><p>${cells.join("</p></td><td><p>")}</p></td></tr>`;
const table = (rows: string[]) => `<h2>List of current releases</h2>
<table><thead><tr><th><p>Version</p></th><th><p>Code name</p></th><th><p>Docs</p></th>
<th><p>Release</p></th><th><p>End of Standard Support</p></th><th><p>End of Life</p></th></tr></thead>
<tbody>${rows.join("\n")}</tbody></table><h2>Future releases</h2>`;
const notes = (url: string) => `<a class="reference external" href="${url}">Release Notes</a>`;
const released = (day: string) => `<a href="https://lists.ubuntu.com/x">${day}</a>`;

const HTML = table([
  row([
    "Ubuntu 26.10",
    "Stonking Stingray",
    notes("https://documentation.ubuntu.com/release-notes/26.10/"),
    released("Oct 15, 2026"),
    "Jul 2027",
    "Jul 2027",
  ]),
  row([
    "Ubuntu 26.04.1 LTS",
    "Resolute Raccoon",
    notes("https://documentation.ubuntu.com/release-notes/26.04/1/?a=1&amp;b=2"),
    released("Aug 27, 2026"),
    "May 2031",
    "Apr 2041",
  ]),
  row([
    "Ubuntu 26.04 LTS",
    "Resolute Raccoon",
    "",
    released("Apr 23, 2026"),
    "May 2031",
    "Apr 2041",
  ]),
  row(["Ubuntu 24.04.5 LTS", "Noble Numbat", "", released("Sep 10, 2026"), "Jun 2029", "Apr 2039"]),
  row(["Ubuntu 20.04.6 LTS", "Focal Fossa", "", released("Mar 23, 2023"), "May 2025", "Apr 2035"]),
  row(["Ubuntu 8.04 LTS", "Hardy Heron", "", released("Apr 24, 2008"), "TBD", "TBD"]),
]);

describe("parseDate", () => {
  it("reads month-name dates without time zone surprises", () => {
    expect(parseDate("Oct 15, 2026")).toBe("2026-10-15");
    expect(parseDate("April 26, 2029")).toBe("2029-04-26");
    expect(parseDate("15 October 2026")).toBe("2026-10-15");
  });

  it("rejects what is not a full date", () => {
    expect(parseDate("Jun 2029")).toBeNull();
    expect(parseDate("TBD")).toBeNull();
    expect(parseDate("Feb 31, 2026")).toBeNull();
    expect(parseDate("Foo 5, 2026")).toBeNull();
  });
});

describe("parseReleaseList", () => {
  it("reads versions, dates, end of standard support and release notes", () => {
    const rows = parseReleaseList(HTML);
    expect(rows.map((r) => r.version)).toEqual([
      "26.10",
      "26.04.1",
      "26.04",
      "24.04.5",
      "20.04.6",
      "8.04",
    ]);
    expect(rows[0]).toEqual({
      version: "26.10",
      line: "26.10",
      lts: false,
      codename: "Stonking Stingray",
      date: "2026-10-15",
      eol: "2027-07-31",
      notesUrl: "https://documentation.ubuntu.com/release-notes/26.10/",
    });
    expect(rows[1]).toMatchObject({
      line: "26.04",
      lts: true,
      eol: "2031-05-31",
      date: "2026-08-27",
    });
    expect(rows[1]?.notesUrl).toBe(
      "https://documentation.ubuntu.com/release-notes/26.04/1/?a=1&b=2",
    );
    expect(rows[2]?.notesUrl).toBeNull();
    expect(rows[5]?.eol).toBeNull();
  });

  it("fails closed when the table or its columns change", () => {
    expect(() => parseReleaseList("<p>nothing here</p>")).toThrow(/table is gone/);
    expect(() => parseReleaseList(HTML.replace("End of Standard Support", "Support"))).toThrow(
      /unexpected columns/,
    );
    expect(() => parseReleaseList(table([]))).toThrow(/no release rows/);
  });
});

describe("currentLines", () => {
  const rows = parseReleaseList(HTML);

  it("keeps the newest point release of each line still in standard support", () => {
    expect(currentLines(rows, "2026-10-20").map((r) => r.version)).toEqual([
      "26.10",
      "26.04.1",
      "24.04.5",
    ]);
  });

  it("drops a line the day after its support ends", () => {
    expect(currentLines(rows, "2027-07-31").map((r) => r.version)).toContain("26.10");
    expect(currentLines(rows, "2027-08-01").map((r) => r.version)).not.toContain("26.10");
  });

  it("fails when a recent release has no end of support", () => {
    const broken = parseReleaseList(
      table([row(["Ubuntu 27.04", "Tenacious T-Rex", "", released("Apr 22, 2027"), "TBD", "TBD"])]),
    );
    expect(() => currentLines(broken, "2027-05-01")).toThrow(/no end of support for 27.04/);
  });
});

describe("anchors", () => {
  it("reads quoted and unquoted attributes and strips tags from the text", () => {
    const html = `<ul><li><a href=http://a.example/x/ title=Free>France</a></li>
      <li><a class="m" title="Canonical Ltd." href="https://cdimages.ubuntu.com/xubuntu/">United <b>Kingdom</b></a></li>
      <li><a href='/blog/a?x=1&amp;y=2'>Release
        Notes</a></li><li><a name=top>no link</a></li></ul>`;
    expect(anchors(html)).toEqual([
      { href: "http://a.example/x/", title: "Free", text: "France" },
      {
        href: "https://cdimages.ubuntu.com/xubuntu/",
        title: "Canonical Ltd.",
        text: "United Kingdom",
      },
      { href: "/blog/a?x=1&y=2", title: null, text: "Release Notes" },
    ]);
  });
});

describe("parseImageName", () => {
  it("reads installer and preinstalled images", () => {
    expect(parseImageName("ubuntu-24.04.5.1-desktop-amd64.iso", "ubuntu")).toMatchObject({
      version: "24.04.5.1",
      line: "24.04",
      kind: "desktop",
      arch: "x86_64",
      variant: null,
      format: "iso",
    });
    expect(parseImageName("ubuntu-26.04.1-live-server-arm64+largemem.iso", "ubuntu")).toMatchObject(
      {
        kind: "live-server",
        arch: "aarch64",
        variant: "largemem",
      },
    );
    expect(
      parseImageName("ubuntu-24.04.5-preinstalled-server-riscv64+jh7110.img.xz", "ubuntu"),
    ).toMatchObject({ arch: "riscv64", variant: "jh7110", format: "img.xz" });
    expect(parseImageName("ubuntu-22.04.5-live-server-ppc64el.iso", "ubuntu")?.arch).toBe(
      "ppc64le",
    );
    expect(parseImageName("xubuntu-26.10-minimal-riscv64.iso", "xubuntu")?.kind).toBe("minimal");
    expect(parseImageName("ubuntu-mate-26.10-desktop-amd64.iso", "ubuntu-mate")?.line).toBe(
      "26.10",
    );
  });

  it("ignores what is not an install image", () => {
    for (const file of [
      "ubuntu-26.10-beta-desktop-amd64.iso",
      "ubuntu-26.10-desktop-amd64v3.iso",
      "ubuntu-26.04-wsl-arm64.wsl",
      "ubuntu-24.04.5-netboot-arm64.tar.gz",
      "ubuntu-26.04-desktop-amd64.iso.torrent",
      "ubuntu-26.04-desktop-amd64.manifest",
      "SHA256SUMS",
    ])
      expect(parseImageName(file, "ubuntu")).toBeNull();
    expect(parseImageName("ubuntu-mate-26.10-desktop-amd64.iso", "ubuntu")).toBeNull();
  });
});

describe("imagesMentioned", () => {
  it("finds file names however the page links them", () => {
    const page = `<a href=https://torrent.ubuntu.com/xubuntu/releases/stonking/release/desktop/xubuntu-26.10-desktop-amd64.iso.torrent>T</a>
      <a href="magnet:?dn=xubuntu-26.10-desktop-amd64.iso&tr=x">M</a>
      xubuntu-26.10-minimal-riscv64.iso xubuntu-26.04.1-desktop-amd64.iso kubuntu-26.10-desktop-amd64.iso`;
    expect(imagesMentioned(page, "xubuntu").map((i) => i.file)).toEqual([
      "xubuntu-26.04.1-desktop-amd64.iso",
      "xubuntu-26.10-desktop-amd64.iso",
      "xubuntu-26.10-minimal-riscv64.iso",
    ]);
  });
});

describe("imageArtifact", () => {
  const sha = "a".repeat(64);
  const dir: ImageDir = {
    url: "https://cdimage.ubuntu.com/ubuntu/releases/26.04.1/release/",
    sums: new Map([
      ["ubuntu-26.04.1-desktop-arm64.iso", sha],
      ["ubuntu-26.04.1-preinstalled-server-riscv64.img.xz", sha],
      ["ubuntu-26.04.1-desktop-riscv64.iso", sha],
    ]),
    names: new Set([
      "SHA256SUMS",
      "SHA256SUMS.gpg",
      "ubuntu-26.04.1-desktop-arm64.iso",
      "ubuntu-26.04.1-desktop-arm64.iso.torrent",
      "ubuntu-26.04.1-preinstalled-server-riscv64.img.xz",
    ]),
  };
  const image = (file: string) => {
    const parsed = parseImageName(file, "ubuntu");
    if (!parsed) throw new Error(file);
    return parsed;
  };

  it("builds the artifact with checksum, signature and torrent from the directory", () => {
    expect(imageArtifact(dir, image("ubuntu-26.04.1-desktop-arm64.iso"), null)).toEqual({
      arch: "aarch64",
      format: "iso",
      file: "ubuntu-26.04.1-desktop-arm64.iso",
      path: null,
      url: `${dir.url}ubuntu-26.04.1-desktop-arm64.iso`,
      size: null,
      checksum: { type: "sha256", value: sha, url: `${dir.url}SHA256SUMS` },
      signatureUrl: `${dir.url}SHA256SUMS.gpg`,
      torrentUrl: `${dir.url}ubuntu-26.04.1-desktop-arm64.iso.torrent`,
    });
    const img = imageArtifact(
      dir,
      image("ubuntu-26.04.1-preinstalled-server-riscv64.img.xz"),
      "x/y",
    );
    expect(img).toMatchObject({ format: "img.xz", path: "x/y", torrentUrl: null });
  });

  it("fails when the checksum or the file is missing", () => {
    expect(() => imageArtifact(dir, image("ubuntu-26.04.1-desktop-amd64.iso"), null)).toThrow(
      /no SHA-256/,
    );
    expect(() => imageArtifact(dir, image("ubuntu-26.04.1-desktop-riscv64.iso"), null)).toThrow(
      /does not list/,
    );
  });
});

describe("newestBy", () => {
  it("keeps the highest version per key", () => {
    const item = (file: string) => {
      const image = parseImageName(file, "ubuntu");
      if (!image) throw new Error(file);
      return { image };
    };
    const kept = newestBy(
      [
        item("ubuntu-24.04.3-desktop-arm64.iso"),
        item("ubuntu-24.04.5-desktop-arm64.iso"),
        item("ubuntu-24.04.5.1-desktop-amd64.iso"),
        item("ubuntu-24.04.5-desktop-amd64.iso"),
      ],
      (x) => x.image.arch,
    );
    expect(kept.map((x) => x.image.file)).toEqual([
      "ubuntu-24.04.5-desktop-arm64.iso",
      "ubuntu-24.04.5.1-desktop-amd64.iso",
    ]);
  });
});
