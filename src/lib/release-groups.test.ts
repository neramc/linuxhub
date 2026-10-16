import { describe, expect, it } from "vitest";
import {
  type Distro,
  editorialPicks,
  groupReleases,
  latestReleaseGroups,
  releaseSeries,
} from "./catalog";
import type { HistoryEntry } from "./data-schemas";

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
