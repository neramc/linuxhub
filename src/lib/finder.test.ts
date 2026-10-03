import { describe, expect, it } from "vitest";
import { type FinderDistro, recommend, scoreDistro } from "./finder";

const base = { immutable: false, status: "active" as const };
const distros: FinderDistro[] = [
  {
    ...base,
    id: "mint",
    name: "Linux Mint",
    order: 1,
    difficulty: "beginner",
    useCases: ["beginner", "desktop"],
    desktops: ["cinnamon", "xfce", "mate"],
    releaseModel: "lts",
    ramGB: 4,
  },
  {
    ...base,
    id: "arch",
    name: "Arch",
    order: 11,
    difficulty: "advanced",
    useCases: ["tinkerer", "developer"],
    desktops: ["none"],
    releaseModel: "rolling",
    ramGB: 2,
  },
  {
    ...base,
    id: "bazzite",
    name: "Bazzite",
    order: 14,
    difficulty: "beginner",
    useCases: ["gaming", "desktop"],
    desktops: ["kde", "gnome"],
    releaseModel: "fixed",
    ramGB: 8,
  },
  {
    ...base,
    id: "antix",
    name: "antiX",
    order: 27,
    difficulty: "intermediate",
    useCases: ["lightweight"],
    desktops: ["icewm"],
    releaseModel: "fixed",
    ramGB: 1,
  },
  {
    ...base,
    id: "tails",
    name: "Tails",
    order: 32,
    difficulty: "intermediate",
    useCases: ["privacy", "security"],
    desktops: ["gnome"],
    releaseModel: "fixed",
    ramGB: 2,
  },
  {
    ...base,
    id: "old",
    name: "Gone",
    order: 99,
    difficulty: "beginner",
    useCases: ["beginner"],
    desktops: ["xfce"],
    releaseModel: "lts",
    ramGB: 1,
    status: "discontinued",
  },
];

describe("finder", () => {
  it("recommends a beginner-friendly Windows-like LTS distro to newcomers", () => {
    const [top] = recommend(distros, { experience: "new", look: "windows", updates: "stable" });
    expect(top?.distro.id).toBe("mint");
    expect(top?.reasons).toEqual(expect.arrayContaining(["experience", "look", "updates"]));
  });

  it("puts gaming distros first for gamers", () => {
    expect(recommend(distros, { experience: "some", uses: ["gaming"] })[0]?.distro.id).toBe(
      "bazzite",
    );
  });

  it("prefers lightweight distros on old hardware", () => {
    expect(recommend(distros, { hardware: "old" })[0]?.distro.id).toBe("antix");
  });

  it("keeps advanced distros away from newcomers and rewards experts who want the latest", () => {
    expect(scoreDistro(distros[1] as FinderDistro, { experience: "new" }).score).toBeLessThan(0);
    expect(
      recommend(distros, { experience: "expert", updates: "latest", uses: ["developer"] })[0]
        ?.distro.id,
    ).toBe("arch");
  });

  it("matches privacy needs", () => {
    expect(recommend(distros, { privacy: "yes", experience: "some" })[0]?.distro.id).toBe("tails");
  });

  it("never recommends discontinued distros", () => {
    expect(recommend(distros, { experience: "new" }, 10).some((r) => r.distro.id === "old")).toBe(
      false,
    );
  });
});
