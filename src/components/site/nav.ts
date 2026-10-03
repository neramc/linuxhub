import { type Locale, localizePath, stripLocale, useTranslations } from "~/i18n";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  current: boolean;
}

/** Primary destinations shown in the header (desktop) and bottom bar (mobile). */
export function primaryNav(locale: Locale, pathname: string): NavItem[] {
  const t = useTranslations(locale);
  const path = stripLocale(pathname);
  const item = (base: string, label: string, icon: string): NavItem => ({
    href: localizePath(base, locale),
    label,
    icon,
    current: path === base || path.startsWith(base),
  });
  return [
    item("/distros/", t("nav.distros"), "app-grid"),
    item("/learn/", t("nav.learn"), "contents"),
    item("/finder/", t("nav.finder"), "star"),
    item("/family/", t("nav.family"), "community"),
  ];
}
