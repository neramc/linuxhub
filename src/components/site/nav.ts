import { type Locale, localizePath, stripLocale, useTranslations } from "~/i18n";

export interface NavItem {
  href: string;
  label: string;
  current: boolean;
}

function navItems(
  locale: Locale,
  pathname: string,
  items: [base: string, label: string][],
): NavItem[] {
  const path = stripLocale(pathname);
  return items.map(([base, label]) => ({
    href: localizePath(base, locale),
    label,
    current: path === base || path.startsWith(base),
  }));
}

/**
 * Primary destinations: in the header on wide screens, first in the main
 * menu on narrow ones.
 */
export function primaryNav(locale: Locale, pathname: string): NavItem[] {
  const t = useTranslations(locale);
  return navItems(locale, pathname, [
    ["/distros/", t("nav.distros")],
    ["/learn/", t("nav.learn")],
    ["/finder/", t("nav.finder")],
    ["/family/", t("nav.family")],
  ]);
}

/** Secondary destinations: in the main menu and the footer. */
export function secondaryNav(locale: Locale, pathname: string): NavItem[] {
  const t = useTranslations(locale);
  return navItems(locale, pathname, [
    ["/releases/", t("nav.releases")],
    ["/compare/", t("nav.compare")],
    ["/about/", t("nav.about")],
  ]);
}
