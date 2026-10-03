import { en } from "./en";
import { ko } from "./ko";

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

export const LOCALE_META: Record<Locale, { label: string; htmlLang: string; ogLocale: string }> = {
  ko: { label: "한국어", htmlLang: "ko", ogLocale: "ko_KR" },
  en: { label: "English", htmlLang: "en", ogLocale: "en_US" },
};

const dictionaries = { ko, en } as const;
export type Dictionary = typeof en;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The `[...locale]` route param for a locale: undefined for the default (no prefix). */
export function localeParam(locale: Locale): string | undefined {
  return locale === DEFAULT_LOCALE ? undefined : locale;
}

/** Resolves the locale from a `[...locale]` param value. */
export function localeFromParam(param: string | undefined): Locale {
  return isLocale(param) ? param : DEFAULT_LOCALE;
}

/** getStaticPaths() entries for a page that exists once per locale. */
export function localePaths() {
  return LOCALES.map((locale) => ({ params: { locale: localeParam(locale) }, props: { locale } }));
}

/** Removes a leading /en from a pathname; always returns a path starting with "/". */
export function stripLocale(pathname: string): string {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}` || pathname === `/${locale}/`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname || "/";
}

/** Builds a site-absolute path for `path` (written without a locale prefix) in `locale`. */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}/` : `/${locale}${clean}`;
}

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string
  ? never
  : {
      [K in keyof T]: K extends string ? (T[K] extends string ? K : Join<K, Paths<T[K]>>) : never;
    }[keyof T];
export type MessageKey = Paths<Dictionary>;

/**
 * Returns a translator for `locale`. Keys are dot paths into the dictionary;
 * `{name}` placeholders are replaced from `vars`.
 */
export function useTranslations(locale: Locale) {
  const dict = dictionaries[locale] as unknown as Record<string, unknown>;
  return function t(key: MessageKey, vars?: Record<string, string | number>): string {
    let value: unknown = dict;
    for (const part of key.split("."))
      value = (value as Record<string, unknown> | undefined)?.[part];
    if (typeof value !== "string") throw new Error(`Missing i18n key "${key}" for ${locale}`);
    return vars
      ? value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
      : value;
  };
}

/** Picks the right side of a `{ ko, en }` object. */
export function pick<T>(value: Record<Locale, T>, locale: Locale): T {
  return value[locale];
}
