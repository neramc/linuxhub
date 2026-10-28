import { describe, expect, it } from "vitest";
import { mirrorRoot, sourceforgeChecksum, sourceforgeDownloadUrl } from "./mxiso";
import type { SfEntry } from "./sourceforge";

const entry = (over: Partial<SfEntry>): SfEntry => ({
  name: "MX-25.3_Xfce_x64.iso",
  path: "Final/Xfce/MX-25.3_Xfce_x64.iso",
  type: "file",
  date: "2026-09-20",
  sha256: null,
  sha1: null,
  md5: null,
  ...over,
});

describe("mxiso", () => {
  it("builds the SourceForge download link the projects' pages use", () => {
    expect(sourceforgeDownloadUrl("antix-linux", "Final/antiX-26.1/antiX-26.1_x64-full.iso")).toBe(
      "https://sourceforge.net/projects/antix-linux/files/Final/antiX-26.1/antiX-26.1_x64-full.iso/download",
    );
  });

  it("takes the strongest hash SourceForge shows", () => {
    const url = "https://sourceforge.net/projects/mx-linux/files/Final/Xfce/";
    const sha256 = "a".repeat(64);
    const sha1 = "b".repeat(40);
    const md5 = "c".repeat(32);
    expect(sourceforgeChecksum(entry({ sha256, sha1, md5 }), url)).toEqual({
      type: "sha256",
      value: sha256,
      url,
    });
    expect(sourceforgeChecksum(entry({ sha1, md5 }), url)).toEqual({
      type: "sha1",
      value: sha1,
      url,
    });
    expect(sourceforgeChecksum(entry({ md5 }), url)).toEqual({ type: "md5", value: md5, url });
    expect(sourceforgeChecksum(entry({}), url)).toBeNull();
  });

  it("derives a mirror root from a release directory URL", () => {
    expect(
      mirrorRoot(
        "https://mirror.csclub.uwaterloo.ca/mxlinux-iso/ANTIX/Final/antiX-26.1/",
        "ANTIX/Final/",
      ),
    ).toBe("https://mirror.csclub.uwaterloo.ca/mxlinux-iso/");
    expect(
      mirrorRoot("https://mx-isos.ip-connect.vn.ua/ANTIX/Final/antiX-26.1/", "ANTIX/Final/"),
    ).toBe("https://mx-isos.ip-connect.vn.ua/");
    // A mirror with its own layout has no root of this tree.
    expect(mirrorRoot("http://mxrepo.com/Final/antiX-26.1/", "ANTIX/Final/")).toBeNull();
  });
});
