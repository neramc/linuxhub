/**
 * Distro finder scoring (runs in the browser; pure and unit-tested).
 * Every point comes from a catalog attribute, so each recommendation can be
 * explained ("matches: beginner-friendly, gaming, Windows-like desktop").
 */

export interface FinderDistro {
  id: string;
  name: string;
  order: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  useCases: string[];
  desktops: string[];
  releaseModel: "fixed" | "lts" | "rolling" | "semi-rolling";
  ramGB: number;
  immutable: boolean;
  status: "active" | "discontinued";
}

export interface FinderAnswers {
  experience?: "new" | "some" | "expert" | undefined;
  uses?: string[] | undefined;
  hardware?: "modern" | "average" | "old" | undefined;
  look?: "windows" | "macos" | "gnome" | "any" | undefined;
  updates?: "stable" | "latest" | "any" | undefined;
  privacy?: "yes" | "no" | undefined;
}

export type Reason = "experience" | "use" | "hardware" | "look" | "updates" | "privacy";

export interface FinderResult {
  distro: FinderDistro;
  score: number;
  reasons: Reason[];
}

const LOOK_DESKTOPS: Record<Exclude<FinderAnswers["look"], undefined | "any">, string[]> = {
  windows: ["cinnamon", "kde", "xfce", "mate", "lxqt", "ukui", "trinity"],
  macos: ["pantheon", "budgie", "dde", "cosmic"],
  gnome: ["gnome"],
};

export function scoreDistro(d: FinderDistro, a: FinderAnswers): FinderResult {
  let score = 0;
  const reasons: Reason[] = [];
  const add = (points: number, reason: Reason) => {
    score += points;
    if (points > 0 && !reasons.includes(reason)) reasons.push(reason);
  };

  if (a.experience) {
    const fit = {
      new: { beginner: 6, intermediate: 1, advanced: -8 },
      some: { beginner: 3, intermediate: 4, advanced: -2 },
      expert: { beginner: 0, intermediate: 3, advanced: 4 },
    }[a.experience][d.difficulty];
    add(fit, "experience");
  }

  for (const use of a.uses ?? []) {
    if (d.useCases.includes(use)) add(use === "desktop" ? 2 : 5, "use");
    else if (use !== "desktop") score -= 1;
  }

  if (a.hardware === "old") {
    if (d.useCases.includes("lightweight")) add(6, "hardware");
    if (d.ramGB <= 2) add(3, "hardware");
    else if (d.ramGB >= 4) score -= 3;
  } else if (a.hardware === "average" && d.ramGB <= 4) add(1, "hardware");

  if (a.look && a.look !== "any") {
    const wanted = LOOK_DESKTOPS[a.look];
    if (wanted.includes(d.desktops[0] ?? "")) add(4, "look");
    else if (d.desktops.some((x) => wanted.includes(x))) add(2, "look");
  }

  if (a.updates === "stable") {
    if (d.releaseModel === "lts") add(4, "updates");
    else if (d.releaseModel === "fixed") add(2, "updates");
    else if (d.releaseModel === "rolling") score -= 3;
  } else if (a.updates === "latest") {
    if (d.releaseModel === "rolling") add(4, "updates");
    else if (d.releaseModel === "semi-rolling") add(3, "updates");
    else if (d.releaseModel === "fixed") add(1, "updates");
    else score -= 1;
  }

  if (a.privacy === "yes" && d.useCases.includes("privacy")) add(5, "privacy");

  // Server/security-only distros are rarely what a newcomer wants on a desktop.
  if (a.experience === "new" && (d.useCases.includes("security") || d.desktops[0] === "none"))
    score -= 4;

  // Tiny nudge toward editorial order so ties are stable and sensible.
  score -= d.order / 1000;
  return { distro: d, score, reasons };
}

export function recommend(
  distros: FinderDistro[],
  answers: FinderAnswers,
  limit = 3,
): FinderResult[] {
  return distros
    .filter((d) => d.status === "active")
    .map((d) => scoreDistro(d, answers))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
