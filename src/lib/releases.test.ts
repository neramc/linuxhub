import { describe, expect, it } from "vitest";
import type { Release } from "./data-schemas";
import {
  checksumLabel,
  defaultArtifact,
  downloadLabel,
  eolStatus,
  featuredRelease,
  releaseName,
  versionLabel,
} from "./releases";

const release = (version: string, channel: Release["channel"], codename: string | null = null) =>
  ({
    version,
    channel,
    codename,
    releaseDate: null,
    eol: null,
    notesUrl: null,
    editions: [],
  }) satisfies Release;

const labels = {
  latest: "Latest",
  lts: "LTS",
  channel: { stable: "Stable", lts: "LTS", rolling: "Rolling", beta: "Beta", testing: "Testing" },
  checksum: "SHA-256 checksum",
  checksumMd5: "MD5 checksum",
  checksumOther: "Checksum",
};

describe("featuredRelease", () => {
  it("skips betas and test builds, falling back to the first release", () => {
    const beta = release("45", "beta");
    const stable = release("44", "stable");
    expect(featuredRelease({ releases: [beta, stable] })).toBe(stable);
    expect(featuredRelease({ releases: [beta] })).toBe(beta);
    expect(featuredRelease(undefined)).toBeUndefined();
  });
});

describe("defaultArtifact", () => {
  it("prefers the x86_64 ISO of the first edition", () => {
    const artifact = (arch: "x86_64" | "aarch64", format: "iso" | "img.xz") => ({
      arch,
      format,
      file: `f.${format}`,
      path: null,
      url: `https://example.org/f.${format}`,
      size: null,
      checksum: null,
      signatureUrl: null,
      torrentUrl: null,
    });
    const iso = artifact("x86_64", "iso");
    const edition = {
      id: "desktop",
      name: "Desktop",
      desktop: null,
      kind: "desktop" as const,
      artifacts: [artifact("aarch64", "img.xz"), artifact("x86_64", "img.xz"), iso],
    };
    expect(defaultArtifact({ ...release("1", "stable"), editions: [edition] })?.artifact).toBe(iso);
    expect(defaultArtifact(release("1", "stable"))).toBeUndefined();
  });
});

describe("version and checksum labels", () => {
  it("tags the featured release as latest, plus LTS and pre-release channels", () => {
    const beta = release("26.10", "beta");
    const lts = release("26.04", "lts", "Resolute Raccoon");
    const featured = featuredRelease({ releases: [beta, lts] });
    expect(versionLabel(beta, featured, labels)).toBe("26.10 (Beta)");
    expect(versionLabel(lts, featured, labels)).toBe("26.04 “Resolute Raccoon” (Latest, LTS)");
    expect(versionLabel(release("25.10", "stable"), featured, labels)).toBe("25.10");
    expect(releaseName(lts)).toBe("26.04 “Resolute Raccoon”");
  });

  it("names the checksum type", () => {
    expect(checksumLabel({ type: "sha256", value: "ab", url: null }, labels)).toBe(
      "SHA-256 checksum",
    );
    expect(checksumLabel({ type: "md5", value: "ab", url: null }, labels)).toBe("MD5 checksum");
    expect(checksumLabel({ type: "sha512", value: "ab", url: null }, labels)).toBe(
      "SHA512 Checksum",
    );
    expect(checksumLabel(null, labels)).toBe("Checksum");
  });
});

describe("downloadLabel", () => {
  it("names the file type and adds the size after one middle dot", () => {
    expect(downloadLabel("{format} 받기", "iso", "2.3 GB")).toBe("ISO 받기 · 2.3 GB");
    expect(downloadLabel("Download {format}", "img.xz", null)).toBe("Download IMG.XZ");
  });
});

describe("eolStatus", () => {
  it("marks a past end of life and one within about six months", () => {
    expect(eolStatus("2026-10-06", "2026-10-07")).toBe("passed");
    expect(eolStatus("2026-10-07", "2026-10-07")).toBe("soon");
    expect(eolStatus("2027-04-08", "2026-10-07")).toBe("soon");
    expect(eolStatus("2027-04-09", "2026-10-07")).toBeUndefined();
    expect(eolStatus(null, "2026-10-07")).toBeUndefined();
  });
});
