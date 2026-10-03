import type { UseCase } from "./taxonomy";

/** Adwaita symbolic icon per use case (src/assets/icons). */
export const USE_ICONS: Record<UseCase, string> = {
  beginner: "star",
  desktop: "display",
  gaming: "gaming",
  developer: "terminal",
  server: "server",
  security: "security",
  privacy: "privacy",
  lightweight: "computer",
  creative: "graphics",
  education: "science",
  enterprise: "engineering",
  tinkerer: "settings",
};
