import { describe, expect, it } from "vitest";
import { debianArch } from "./debarch";

describe("debianArch", () => {
  it("maps Debian names to the model's keys", () => {
    expect(debianArch("amd64", "x")).toBe("x86_64");
    expect(debianArch("arm64", "x")).toBe("aarch64");
    expect(debianArch("i386", "x")).toBe("i686");
    expect(debianArch("ppc64el", "x")).toBe("ppc64le");
  });

  it("returns null for ports the model has no key for", () => {
    expect(debianArch("armel", "x")).toBeNull();
    expect(debianArch("mips64el", "x")).toBeNull();
  });

  it("throws on an unknown name, naming the page", () => {
    expect(() => debianArch("loong64", "https://example.org/")).toThrow(
      'unknown architecture "loong64" on https://example.org/',
    );
    expect(() => debianArch("constructor", "x")).toThrow();
  });
});
