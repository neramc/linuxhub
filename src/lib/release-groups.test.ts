import { describe, expect, it } from "vitest";
import {
  type Distro,
  editorialPicks,
  endingSupport,
  groupReleases,
  latestReleaseGroups,
  releaseSeries,
} from "./catalog";
import type { HistoryEntry, ReleasesFile } from "./data-schemas";

const distro = (id: string, order: number, basedOn: string | null): Distro =>
  ({
    id,
    data: { name: id[0]?.toUpperCase() + id.slice(1), order, basedOn, status: "active" },
  }) as unknown as Distro;

const catalog = [
  distro("debian", 3, null),
  distro("ubuntu", 2, "debian"),
  distro("kubuntu", 17, "ubuntu"),
  distro("xubuntu", 23, "ubuntu"),
  distro("lubuntu", 24, "ubuntu"),
  distro("mint", 1, "ubuntu"),
  distro("fedora", 4, null),
];

const entry = (slug: string, version: string, date: string): HistoryEntry => ({
  slug,
  version,
  date,
  channel: "stable",
  detected: date,
});

describe("releaseSeries", () => {
  it("drops the point release from three-part versions only", () => {
    expect(releaseSeries("26.04.1")).toBe("26.04");
    expect(releaseSeries("3.24.2")).toBe("3.24");
    expect(releaseSeries("26.04")).toBe("26.04");
    expect(releaseSeries("44")).toBe("44");
  });
});

describe("groupReleases", () => {
  const history = [
    entry("fedora", "44", "2026-04-28"),
    entry("kubuntu", "26.04.1", "2026-04-23"),
    entry("kubuntu", "26.04", "2026-04-23"),
    entry("lubuntu", "26.04.1", "2026-04-23"),
    entry("ubuntu", "26.04.1", "2026-04-23"),
    entry("ubuntu", "26.04", "2026-04-23"),
    entry("xubuntu", "26.04.1", "2026-04-23"),
    entry("mint", "22.3", "2026-01-11"),
    entry("debian", "13.2", "2025-11-15"),
    entry("debian", "12.13", "2025-11-15"),
    entry("fedora", "43", "2025-10-28"),
    entry("lubuntu", "20.04.5", "2020-04-23"),
    entry("ubuntu", "20.04.6", "2020-04-23"),
    entry("gone", "1.0", "2020-01-01"),
  ];
  const groups = groupReleases(history, catalog);
  const rows = groups.map((g) => [
    g.date,
    g.distro.id,
    g.versions.join(","),
    g.flavors.map((f) => f.id).join(","),
  ]);

  it("keeps the newest point release, groups flavors under the parent and same-day series", () => {
    expect(rows).toEqual([
      ["2026-04-28", "fedora", "44", ""],
      ["2026-04-23", "ubuntu", "26.04.1", "kubuntu,lubuntu,xubuntu"],
      ["2026-01-11", "mint", "22.3", ""],
      ["2025-11-15", "debian", "13.2,12.13", ""],
      ["2025-10-28", "fedora", "43", ""],
      ["2020-04-23", "ubuntu", "20.04.6", "lubuntu"],
    ]);
  });

  it("limits the home list to one row per distro", () => {
    expect(latestReleaseGroups(groups, 5).map((g) => g.distro.id)).toEqual([
      "fedora",
      "ubuntu",
      "mint",
      "debian",
    ]);
    expect(latestReleaseGroups(groups, 2)).toHaveLength(2);
  });
});

describe("editorialPicks (slider fallback before the first popularity sync)", () => {
  const day = (n: number) => new Date(n * 86_400_000 + 3_600_000);
  const ids = (n: number, limit = 5) => editorialPicks(catalog, limit, day(n)).map((d) => d.id);

  it("shows active distros in editorial order, the next ones each day", () => {
    const retired = {
      ...distro("old", 0, null),
      data: { ...distro("old", 0, null).data, status: "discontinued" },
    };
    const all = [...catalog, retired as unknown as Distro];
    expect(editorialPicks(all, 7, day(0)).map((d) => d.id)).not.toContain("old");
    expect(ids(0)).toEqual(["debian", "ubuntu", "kubuntu", "xubuntu", "lubuntu"]);
    expect(ids(1)).toEqual(["mint", "fedora", "debian", "ubuntu", "kubuntu"]);
    expect(ids(1)).toEqual(ids(1));
  });

  it("never repeats a distro and copes with a tiny catalog", () => {
    expect(new Set(ids(3)).size).toBe(5);
    expect(
      editorialPicks(catalog.slice(0, 2), 5, day(9))
        .map((d) => d.id)
        .sort(),
    ).toEqual(["debian", "ubuntu"]);
    expect(editorialPicks([], 5, day(0))).toEqual([]);
  });
});

describe("endingSupport (home: support ending within about six months)", () => {
  const file = (slug: string, ...releases: [string, string | null][]): ReleasesFile =>
    ({
      slug,
      releases: releases.map(([version, eol]) => ({ version, eol, channel: "stable" })),
    }) as unknown as ReleasesFile;
  const releases = new Map<string, ReleasesFile | undefined>([
    ["fedora", file("fedora", ["44", "2027-05-12"], ["43", "2026-12-02"])],
    ["ubuntu", file("ubuntu", ["26.04.1", "2031-05-31"], ["24.04.5", "2029-06-30"])],
    ["kubuntu", file("kubuntu", ["26.04.1", "2029-04-30"], ["24.04.5", "2027-04-30"])],
    ["lubuntu", file("lubuntu", ["26.04.1", "2029-04-30"], ["24.04.5", "2027-04-30"])],
    ["xubuntu", file("xubuntu", ["24.04.5", "2027-04-22"])],
    ["debian", file("debian", ["13.2", null], ["12.13", "2026-06-10"])],
    ["mint", file("mint", ["22.3", "2029-04-30"], ["21.3", "2027-04-30"])],
  ]);
  const rows = endingSupport(catalog, releases, "2026-10-29", 10);

  it("lists ends of life from today to about six months ahead, soonest first", () => {
    // Same day: editorial order (Mint 1, Kubuntu 17).
    expect(rows.map((r) => `${r.distro.id} ${r.series} ${r.eol}`)).toEqual([
      "fedora 43 2026-12-02",
      "xubuntu 24.04 2027-04-22",
      "mint 21.3 2027-04-30",
      "kubuntu 24.04 2027-04-30",
    ]);
  });

  it("joins a related distro's same series ending the same day, not another series", () => {
    const kubuntu = rows.find((r) => r.distro.id === "kubuntu");
    expect(kubuntu?.flavors.map((d) => d.id)).toEqual(["lubuntu"]);
    // Mint 21.3 ends the same day but is another series: its own row.
    expect(rows.find((r) => r.distro.id === "mint")?.flavors).toEqual([]);
  });

  it("names the newer version to move to, never the ending series itself", () => {
    expect(rows[0]?.latest).toBe("44");
    expect(rows.find((r) => r.distro.id === "xubuntu")?.latest).toBeUndefined();
  });

  it("stops at the limit; a flavor never takes the place of a row cut off", () => {
    expect(endingSupport(catalog, releases, "2026-10-29", 3).map((r) => r.distro.id)).toEqual([
      "fedora",
      "xubuntu",
      "mint",
    ]);
  });
});
