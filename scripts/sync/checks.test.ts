import { describe, expect, it } from "vitest";
import type { ReleasesFile } from "../../src/lib/data-schemas";
import { checkReleases } from "./checks";
import { defineSource, hostAllowed } from "./source";

const source = defineSource({ slug: "demo", hosts: ["example.org"] });

function file(url: string): ReleasesFile {
  return {
    slug: "demo",
    sources: ["https://example.org/"],
    updated: "2026-10-03",
    releases: [
      {
        version: "1.0",
        channel: "stable",
        codename: null,
        releaseDate: null,
        eol: null,
        notesUrl: null,
        editions: [
          {
            id: "desktop",
            name: "Desktop",
            desktop: "gnome",
            kind: "desktop",
            artifacts: [
              {
                arch: "x86_64",
                format: "iso",
                file: "demo.iso",
                path: "demo/demo.iso",
                url,
                size: 1,
                checksum: { type: "sha256", value: "a".repeat(64), url: null },
                signatureUrl: null,
                torrentUrl: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("host allowlist", () => {
  it("matches exact hosts and subdomains only", () => {
    expect(hostAllowed("https://example.org/x", ["example.org"])).toBe(true);
    expect(hostAllowed("https://dl.example.org/x", ["example.org"])).toBe(true);
    expect(hostAllowed("https://evil-example.org/x", ["example.org"])).toBe(false);
    expect(hostAllowed("https://example.org.evil.com/x", ["example.org"])).toBe(false);
  });

  it("rejects artifacts on non-official hosts", () => {
    expect(checkReleases(file("https://cdn.example.org/demo.iso"), source)).toEqual([]);
    expect(checkReleases(file("https://mirror.evil.test/demo.iso"), source)[0]).toMatch(
      /not allowlisted/,
    );
  });
});
