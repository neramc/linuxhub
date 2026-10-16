import { describe, expect, it } from "vitest";
import type { PopularityFile } from "../../src/lib/data-schemas";
import {
  type ArticleViews,
  addDays,
  dailyViews,
  isCurrent,
  latestCompleteDay,
  movement,
  newestDay,
  PAGEVIEWS_API,
  pageviewsUrl,
  popularityProblems,
  rankingDay,
  rankPopularity,
  rerank,
  wikipediaUrl,
} from "../../src/lib/popularity";
import { WIKIPEDIA_ARTICLES } from "./wikipedia-articles";

const series = (slug: string, views: Record<string, number>): ArticleViews => ({
  slug,
  article: slug.toUpperCase(),
  views,
});

const file = (day: string, items: PopularityFile["items"]): PopularityFile => ({
  source: PAGEVIEWS_API,
  project: "en.wikipedia",
  day,
  items,
});

describe("dates", () => {
  it("uses the UTC day before as the latest complete day, across month and year ends", () => {
    expect(latestCompleteDay("2026-10-04")).toBe("2026-10-03");
    expect(latestCompleteDay("2026-03-01")).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds a 9-day per-article URL ending on the latest day", () => {
    expect(pageviewsUrl("Fedora Linux", "2026-10-03")).toBe(
      `${PAGEVIEWS_API}Fedora_Linux/daily/20260925/20261003`,
    );
    expect(pageviewsUrl("Tails (operating system)", "2026-10-03", 2)).toBe(
      `${PAGEVIEWS_API}Tails_(operating_system)/daily/20261002/20261003`,
    );
    expect(wikipediaUrl("Pop!_OS")).toBe("https://en.wikipedia.org/wiki/Pop!_OS");
  });
});

describe("dailyViews / newestDay", () => {
  it("keys API items by ISO day and finds the newest day not after the latest", () => {
    const views = dailyViews([
      { timestamp: "2026100200", views: 10 },
      { timestamp: "2026100300", views: 12 },
      { timestamp: "garbage", views: 1 },
    ]);
    expect(views).toEqual({ "2026-10-02": 10, "2026-10-03": 12 });
    expect(newestDay([series("a", views)], "2026-10-03")).toBe("2026-10-03");
    expect(newestDay([series("a", views)], "2026-10-02")).toBe("2026-10-02");
    expect(newestDay([series("a", {})], "2026-10-03")).toBeNull();
  });
});

describe("rankingDay", () => {
  const day = "2026-10-03";
  const prev = "2026-10-02";

  it("falls back to the day before while Wikimedia has only partly published the latest day", () => {
    const partial = [
      series("ubuntu", { [prev]: 900, [day]: 1000 }),
      series("debian", { [prev]: 800 }),
      series("fedora", { [prev]: 700 }),
    ];
    expect(newestDay(partial, day)).toBe(day);
    expect(rankingDay(partial, day)).toBe(prev);
    expect(rankPopularity(partial, rankingDay(partial, day) ?? "").map((i) => i.slug)).toEqual([
      "ubuntu",
      "debian",
      "fedora",
    ]);
  });

  it("ranks the latest day once most articles have it, and ignores days after it", () => {
    const most = [
      series("ubuntu", { [prev]: 900, [day]: 1000, "2026-10-04": 5 }),
      series("debian", { [prev]: 800, [day]: 700 }),
      series("fedora", { [prev]: 700 }),
    ];
    expect(rankingDay(most, day)).toBe(day);
    expect(rankingDay([], day)).toBeNull();
  });
});

describe("rankPopularity", () => {
  const day = "2026-10-03";
  const prev = "2026-10-02";
  const input = [
    series("debian", { [prev]: 900, [day]: 800 }),
    series("ubuntu", { [prev]: 700, [day]: 1000 }),
    series("fedora", { [prev]: 950, [day]: 800 }),
    series("nixos", { [day]: 50 }),
    series("gentoo", { [prev]: 400 }),
  ];

  it("sorts by views (desc), ties by slug, and keeps the previous day's rank", () => {
    expect(rankPopularity(input, day)).toEqual([
      { slug: "ubuntu", article: "UBUNTU", views: 1000, rank: 1, prevRank: 3 },
      { slug: "debian", article: "DEBIAN", views: 800, rank: 2, prevRank: 2 },
      { slug: "fedora", article: "FEDORA", views: 800, rank: 3, prevRank: 1 },
      { slug: "nixos", article: "NIXOS", views: 50, rank: 4, prevRank: null },
    ]);
  });

  it("produces files that pass the consistency check", () => {
    expect(popularityProblems(file(day, rankPopularity(input, day)))).toEqual([]);
  });

  it("re-ranks a subset the same way as ranking that subset from scratch", () => {
    const full = rankPopularity(input, day);
    const subset = rerank(full.filter((i) => i.slug !== "ubuntu"));
    expect(subset).toEqual(
      rankPopularity(
        input.filter((s) => s.slug !== "ubuntu"),
        day,
      ),
    );
  });

  it("describes movement since the day before", () => {
    const [ubuntu, debian, fedora, nixos] = rankPopularity(input, day);
    expect(ubuntu && movement(ubuntu)).toEqual({ movement: "up", delta: 2 });
    expect(debian && movement(debian)).toEqual({ movement: "same", delta: 0 });
    expect(fedora && movement(fedora)).toEqual({ movement: "down", delta: -2 });
    expect(nixos && movement(nixos)).toEqual({ movement: "new", delta: 0 });
  });
});

describe("isCurrent", () => {
  const targets = [
    { slug: "debian", article: "Debian" },
    { slug: "ubuntu", article: "Ubuntu" },
  ];
  const items = [
    { slug: "ubuntu", article: "Ubuntu", views: 2, rank: 1, prevRank: 1 },
    { slug: "debian", article: "Debian", views: 1, rank: 2, prevRank: 2 },
  ];

  it("skips only when the file ranks the latest day for exactly the current targets", () => {
    expect(isCurrent(file("2026-10-03", items), targets, "2026-10-03")).toBe(true);
    expect(isCurrent(file("2026-10-02", items), targets, "2026-10-03")).toBe(false);
    expect(isCurrent(undefined, targets, "2026-10-03")).toBe(false);
    // An article missing from the file (failed fetch, new distro) → fetch again.
    expect(isCurrent(file("2026-10-03", items.slice(0, 1)), targets, "2026-10-03")).toBe(false);
    // A changed mapping → fetch again.
    expect(
      isCurrent(
        file("2026-10-03", items),
        [
          { slug: "debian", article: "Debian" },
          { slug: "ubuntu", article: "Ubuntu (operating system)" },
        ],
        "2026-10-03",
      ),
    ).toBe(false);
  });
});

describe("popularityProblems", () => {
  it("flags gaps, order and duplicate slugs", () => {
    const bad = file("2026-10-03", [
      { slug: "a", article: "A", views: 1, rank: 1, prevRank: 2 },
      { slug: "b", article: "B", views: 5, rank: 3, prevRank: 2 },
      { slug: "a", article: "A", views: 0, rank: 3, prevRank: null },
    ]);
    const problems = popularityProblems(bad);
    expect(problems).toContain("a is listed twice");
    expect(problems).toContain("b has rank 3, expected 2");
    expect(problems).toContain("b is out of order (views desc, then slug)");
    expect(problems).toContain("prevRank values are not 1..n");
  });
});

describe("Wikipedia mapping", () => {
  it("uses article titles with spaces, never URL forms", () => {
    for (const title of Object.values(WIKIPEDIA_ARTICLES))
      if (title) expect(title).not.toMatch(/%|^\s|\s$|[A-Za-z]_[A-Za-z(]/);
  });

  it("maps every article to one distro only", () => {
    const titles = Object.values(WIKIPEDIA_ARTICLES).filter(Boolean);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
