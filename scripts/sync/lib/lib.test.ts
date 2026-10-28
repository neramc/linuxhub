import { describe, expect, it } from "vitest";
import { checksumType, parseChecksums } from "./checksums";
import { parseMirrorlist, parseMirrorstats } from "./mirrorbits";
import { originAsMirror } from "./mirrors";
import { parseSourceforgeFolder, sourceforgeFolderUrl, sourceforgeRoot } from "./sourceforge";
import { compareVersions, isoDay, latest, periodEnd } from "./versions";

describe("parseChecksums", () => {
  it("reads GNU coreutils lines (text and binary mode)", () => {
    const text = [
      "684ded26c63240ff4a41e8c25ee84ea6da233f557364821f13d12c2b0a9059a5  archlinux-2026.10.01-x86_64.iso",
      "AA2D1A3F0C6A6E4F2B1BDC1F7C5F7C33B6C0B7A0D3E9F7C0C2E1B2A3D4E5F6A7 *ubuntu-24.04.3-desktop-amd64.iso",
    ].join("\n");
    const sums = parseChecksums(text);
    expect(sums.get("archlinux-2026.10.01-x86_64.iso")).toBe(
      "684ded26c63240ff4a41e8c25ee84ea6da233f557364821f13d12c2b0a9059a5",
    );
    expect(sums.get("ubuntu-24.04.3-desktop-amd64.iso")).toMatch(/^aa2d1a3f/);
  });

  it("reads BSD-tagged lines inside a PGP-signed CHECKSUM file", () => {
    const text = `-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA256

# Fedora-Workstation-Live-43-1.6.x86_64.iso: 2742190080 bytes
SHA256 (Fedora-Workstation-Live-43-1.6.x86_64.iso) = 0d2b6f1c09a3e8d3a5b6c7d8e9f00112233445566778899aabbccddeeff0011
-----BEGIN PGP SIGNATURE-----
abc
-----END PGP SIGNATURE-----`;
    const sums = parseChecksums(text);
    expect([...sums.keys()]).toEqual(["Fedora-Workstation-Live-43-1.6.x86_64.iso"]);
  });

  it("strips directories from file names", () => {
    const sums = parseChecksums("0123456789abcdef0123456789abcdef  ./iso/file.iso");
    expect(sums.get("file.iso")).toBe("0123456789abcdef0123456789abcdef");
  });

  it("infers algorithms from digest length", () => {
    expect(checksumType("a".repeat(32))).toBe("md5");
    expect(checksumType("a".repeat(64))).toBe("sha256");
    expect(checksumType("a".repeat(128))).toBe("sha512");
  });
});

describe("versions", () => {
  it("compares naturally", () => {
    expect(compareVersions("10.2", "9.10")).toBeGreaterThan(0);
    expect(compareVersions("24.04.3", "24.04")).toBeGreaterThan(0);
    expect(compareVersions("2026.10.01", "2026.09.01")).toBeGreaterThan(0);
    expect(compareVersions("13.1", "13.1")).toBe(0);
    expect(latest(["22.04", "24.04", "24.10", "25.04"])).toBe("25.04");
  });

  it("normalizes dates", () => {
    expect(isoDay("2025-10-28T12:00:00Z")).toBe("2025-10-28");
    expect(isoDay("nope")).toBeNull();
    expect(isoDay(undefined)).toBeNull();
  });
});

describe("periodEnd", () => {
  it("ends a month-only or year-only EOL on its last day, the same for every distro", () => {
    expect(periodEnd("June 2029")).toBe("2029-06-30");
    expect(periodEnd("Jun 2029")).toBe("2029-06-30");
    expect(periodEnd("Sept 2030")).toBe("2030-09-30");
    expect(periodEnd("2029-06")).toBe("2029-06-30");
    expect(periodEnd("February 2028")).toBe("2028-02-29");
    expect(periodEnd("2031")).toBe("2031-12-31");
    expect(periodEnd("soon")).toBeNull();
    expect(periodEnd("2029-13")).toBeNull();
  });
});

describe("originAsMirror", () => {
  it("gives a single official origin the same mirror shape as any list entry", () => {
    expect(originAsMirror("https://os.example.org", "Example origin")).toEqual({
      url: "https://os.example.org/",
      country: null,
      name: "Example origin",
      lat: null,
      lon: null,
      score: null,
    });
  });
});

describe("mirrorbits", () => {
  const file = "https://files.kde.org/neon/images/desk/user/current/neon-user-desk-current.iso";
  const page = `<div>The file <b>/neon/images/desk/user/20261016-0658/neon-user-desk-20261016-0658.iso</b> has a size of 3.1 GB (3376414720 bytes) and was last modified on Fri, 16 Oct 2026 07:19:37 UTC.</div>
<tr><td><a href="/neon/images/desk/user/20261016-0658/neon-user-desk-20261016-0658.iso.sha256">SHA256</a></td><td style="font-family: monospace;">B1F69005B3DF23BFA434F399CB4378EB80928411318600DAA778EE8F360637F2</td></tr>
<tr>
  <td style="text-align: right;">1.</td><td>&#34;Open Computing Facility</td><td style="text-align: right;"><a href="https://mirrors.ocf.berkeley.edu/kde-applicationdata/neon/images/desk/user/20261016-0658/neon-user-desk-20261016-0658.iso">https://mirrors.ocf.berkeley.edu/kde-applicationdata/</a></td><td>US</td>
</tr>
<tr style="color: grey;">
  <td style="text-align: right;">22.</td><td>sakura-tokyo.mirrors.kde.org</td><td><a href="https://sakura-tokyo.mirrors.kde.org/kde/files/neon/images/desk/user/20261016-0658/neon-user-desk-20261016-0658.iso">https://sakura-tokyo.mirrors.kde.org/kde/files/</a></td><td>JP</td>
</tr>
<tr><td><a href="http://insecure.example.org/neon/images/desk/user/20261016-0658/neon-user-desk-20261016-0658.iso">x</a></td><td>DE</td></tr>`;

  it("reads size, hashes and every HTTPS mirror root of the resolved file", () => {
    expect(parseMirrorlist(page, file)).toEqual({
      size: 3376414720,
      sha256: "b1f69005b3df23bfa434f399cb4378eb80928411318600daa778ee8f360637f2",
      sha1: null,
      md5: null,
      mirrors: [
        { root: "https://mirrors.ocf.berkeley.edu/kde-applicationdata/", country: "US" },
        { root: "https://sakura-tokyo.mirrors.kde.org/kde/files/", country: "JP" },
      ],
    });
  });

  it("reads coordinates and health from ?mirrorstats", () => {
    const stats = parseMirrorstats(`var mirrors = { "rows" : [
  { "lat" : 52.3891 , "lon" : 4.6563 , "id" : "mirrors.xtom.nl", "enabled": true ,
    "URL" : "https:\\/\\/mirrors.xtom.nl\\/kde-application\\/", "httpUp" : false , "httpsUp" : true , },
  ]}`);
    expect(stats.get("https://mirrors.xtom.nl/kde-application/")).toEqual({
      lat: 52.3891,
      lon: 4.6563,
      enabled: true,
      httpsUp: true,
    });
  });
});

describe("sourceforge", () => {
  it("reads entries, hashes and dates from a files page (no RSS: robots.txt disallows it)", () => {
    const html = `<tr title="MX-25.3_Xfce_x64.iso" class="file "> <th><span class="name">MX-25.3_Xfce_x64.iso</span></th> <td headers="files_date_h" class="opt"><abbr title="2026-09-20 16:26:39 UTC">2026-09-20</abbr></td> <td headers="files_size_h" class="opt">2.9 GB</td></tr>
<script>net.sf.files = {"MX-25.3_Xfce_x64.iso":{"name":"MX-25.3_Xfce_x64.iso","full_path":"Final/Xfce/MX-25.3_Xfce_x64.iso","type":"f","sha1":"1bb26e6f631c3eb33229ab293a985b3886efde76","md5":"bbd933a988ebcf69e2a46705864ccdab","sha256":"25B5CE20CAEEE1B0E50507291DF5AC8A8211B1B9999D8DD7416DA9B66ED9FBF9"},"Older":{"name":"Older","type":"d","sha256":""}};
net.sf.staging_days = 3;</script>`;
    expect(parseSourceforgeFolder(html, "Final/Xfce")).toEqual([
      {
        name: "MX-25.3_Xfce_x64.iso",
        path: "Final/Xfce/MX-25.3_Xfce_x64.iso",
        type: "file",
        date: "2026-09-20",
        sha256: "25b5ce20caeee1b0e50507291df5ac8a8211b1b9999d8dd7416da9b66ed9fbf9",
        sha1: "1bb26e6f631c3eb33229ab293a985b3886efde76",
        md5: "bbd933a988ebcf69e2a46705864ccdab",
      },
      {
        name: "Older",
        path: "Final/Xfce/Older/",
        type: "folder",
        date: null,
        sha256: null,
        sha1: null,
        md5: null,
      },
    ]);
    expect(sourceforgeRoot("mx-linux")).toBe("https://downloads.sourceforge.net/project/mx-linux/");
    expect(sourceforgeFolderUrl("mx-linux", "/Final/Xfce/")).toBe(
      "https://sourceforge.net/projects/mx-linux/files/Final/Xfce/",
    );
  });

  it("refuses a page without the embedded file data", () => {
    expect(() => parseSourceforgeFolder("<html></html>", "Final")).toThrow(/net\.sf\.files/);
  });
});

describe("http redirects", () => {
  it("follows a redirect only to an HTTPS URL that robots.txt allows", async () => {
    const { request, RedirectRefused, RobotsDisallowed, useFixtures } = await import("../http");
    const calls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/robots.txt"))
        return new Response(url.includes("blocked.example") ? "User-agent: *\nDisallow: /" : "", {
          status: 200,
        });
      const to: Record<string, string> = {
        "https://a.example/ok": "https://b.example/file",
        "https://a.example/plain": "http://b.example/file",
        "https://a.example/blocked": "https://blocked.example/file",
      };
      return to[url]
        ? new Response(null, { status: 302, headers: { location: to[url] as string } })
        : new Response("body", { status: 200 });
    }) as typeof fetch;
    try {
      useFixtures("off");
      const ok = await request("https://a.example/ok", { noCache: true, retries: 0 });
      expect(ok.finalUrl).toBe("https://b.example/file");
      await expect(
        request("https://a.example/plain", { noCache: true, retries: 0 }),
      ).rejects.toBeInstanceOf(RedirectRefused);
      await expect(
        request("https://a.example/blocked", { noCache: true, retries: 0 }),
      ).rejects.toBeInstanceOf(RobotsDisallowed);
      expect(calls).not.toContain("https://blocked.example/file");
      expect(calls).not.toContain("http://b.example/file");
    } finally {
      globalThis.fetch = real;
    }
  });
});
