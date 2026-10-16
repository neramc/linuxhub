import { type Locale, localizePath, type MessageKey, stripLocale, useTranslations } from "~/i18n";

export interface NavItem {
  href: string;
  label: string;
  current: boolean;
}

/**
 * Every site destination, keyed by name. The header, the main menu and the
 * footer pick items by name, never by position (SPEC §10).
 */
const NAV = {
  distros: { path: "/distros/", label: "nav.distros" },
  learn: { path: "/learn/", label: "nav.learn" },
  finder: { path: "/finder/", label: "nav.finder" },
  compare: { path: "/compare/", label: "nav.compare" },
  releases: { path: "/releases/", label: "nav.releases" },
  family: { path: "/family/", label: "nav.family" },
  about: { path: "/about/", label: "nav.about" },
} as const satisfies Record<string, { path: string; label: MessageKey }>;

export type NavId = keyof typeof NAV;

/** One destination; `current` is true on the page and on every page below it. */
export function navItem(id: NavId, locale: Locale, pathname: string): NavItem {
  const { path, label } = NAV[id];
  return {
    href: localizePath(path, locale),
    label: useTranslations(locale)(label),
    current: stripLocale(pathname).startsWith(path),
  };
}

/**
 * Primary destinations: in the header from 768px, first in the main menu
 * below that.
 */
export function primaryNav(locale: Locale, pathname: string): NavItem[] {
  return (["distros", "learn", "finder", "compare"] as const).map((id) =>
    navItem(id, locale, pathname),
  );
}

/** Secondary destinations: in the main menu after the primary ones. */
export function secondaryNav(locale: Locale, pathname: string): NavItem[] {
  return (["releases", "family", "about"] as const).map((id) => navItem(id, locale, pathname));
}
