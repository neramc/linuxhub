import { describe, expect, it } from "vitest";
import { byPopularity, desktopGroups, type HomeDistro, useSections, weeklyRotation } from "./home";
import type { Desktop, UseCase } from "./taxonomy";

const distro = (
  id: string,
  useCases: UseCase[],
  desktops: Desktop[] = ["gnome"],
  status: "active" | "discontinued" = "active",
): HomeDistro => ({ id, data: { status, useCases, desktops } });

describe("byPopularity", () => {
  it("puts the most viewed first and keeps editorial order for the rest", () => {
    const list = ["a", "b", "c", "d"].map((id) => distro(id, ["desktop"]));
    const views = new Map([
      ["c", 10],
      ["b", 30],
    ]);
    expect(byPopularity(list, views).map((d) => d.id)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("useSections", () => {
  const list = [
    distro("ubuntu", ["beginner", "server"]),
    distro("mint", ["beginner"]),
    distro("zorin", ["beginner"]),
    distro("elementary", ["beginner"]),
    distro("debian", ["server"]),
    distro("alma", ["server", "enterprise"]),
    distro("rocky", ["server", "enterprise"]),
    distro("old", ["server"], ["gnome"], "discontinued"),
    distro("bazzite", ["gaming"]),
  ];

  it("never repeats a distro and skips those already shown", () => {
    const sections = useSections(list, ["beginner", "server"], ["mint"], 6, 3);
    expect(sections.map((s) => [s.use, s.total, s.distros.map((d) => d.id)])).toEqual([
      ["beginner", 4, ["ubuntu", "zorin", "elementary"]],
      ["server", 4, ["debian", "alma", "rocky"]],
    ]);
  });

  it("drops a section with too few distros left", () => {
    expect(useSections(list, ["gaming"], [], 6, 3)).toEqual([]);
  });

  it("caps each section", () => {
    const [section] = useSections(list, ["beginner"], [], 2, 1);
    expect(section?.distros.map((d) => d.id)).toEqual(["ubuntu", "mint"]);
  });
});

describe("weeklyRotation", () => {
  const items = [0, 1, 2, 3, 4, 5, 6];
  const week = 7 * 86_400_000;

  it("moves on by `count` each week and wraps around", () => {
    const now = new Date(week * 100);
    const first = weeklyRotation(items, 3, now);
    const next = weeklyRotation(items, 3, new Date(week * 101));
    expect(first).toHaveLength(3);
    expect(next[0]).toBe(((first[0] ?? 0) + 3) % items.length);
  });

  it("returns everything when there are no more items than asked", () => {
    expect(weeklyRotation([1, 2], 3, new Date())).toEqual([1, 2]);
  });
});

describe("desktopGroups", () => {
  it("counts active distros per desktop, largest first, without 'none'", () => {
    const list = [
      distro("a", [], ["gnome", "kde"]),
      distro("b", [], ["kde"]),
      distro("c", [], ["none"]),
      distro("d", [], ["xfce"], "discontinued"),
    ];
    expect(
      desktopGroups(list, ["gnome", "kde", "xfce", "none"]).map((g) => [
        g.id,
        g.members.map((m) => m.id),
      ]),
    ).toEqual([
      ["kde", ["b", "a"]],
      ["gnome", ["a"]],
    ]);
  });
});
