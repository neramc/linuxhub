import { describe, expect, it } from "vitest";
import { sourceforgeLinkPath } from "./sfproject";

describe("sourceforgeLinkPath", () => {
  const link = (path: string) => `https://sourceforge.net/projects/sparkylinux/files/${path}`;

  it("returns the file path below the project's files root", () => {
    expect(
      sourceforgeLinkPath("sparkylinux", link("lxqt/sparkylinux-8.4-x86_64-lxqt.iso/download")),
    ).toBe("lxqt/sparkylinux-8.4-x86_64-lxqt.iso");
    expect(sourceforgeLinkPath("sparkylinux", link("README.md/download"))).toBe("README.md");
  });

  it("accepts torrent links that omit /download", () => {
    expect(
      sourceforgeLinkPath(
        "sparkylinux",
        link("torrents/sparkylinux-2026.09-x86_64-kde.iso.torrent"),
      ),
    ).toBe("torrents/sparkylinux-2026.09-x86_64-kde.iso.torrent");
  });

  it("rejects other projects, hosts and folders", () => {
    expect(
      sourceforgeLinkPath("bodhilinux", link("lxqt/sparkylinux-8.4-x86_64-lxqt.iso/download")),
    ).toBeNull();
    expect(
      sourceforgeLinkPath("sparkylinux", "https://distrowatch.com/dwres/torrents/a.iso.torrent"),
    ).toBeNull();
    expect(sourceforgeLinkPath("sparkylinux", link("lxqt/"))).toBeNull();
  });
});
