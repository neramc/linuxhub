import { describe, expect, it } from "vitest";
import { checksumType, parseChecksums } from "./checksums";
import { compareVersions, isoDay, latest } from "./versions";

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
