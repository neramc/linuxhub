/**
 * English UI strings. This file defines the dictionary shape; ko.ts must
 * provide exactly the same keys (enforced by its type annotation).
 */
export const en = {
  site: {
    name: "Linuxhub",
    tagline: "Find, download and install the right Linux",
    description:
      "A clean catalog of popular Linux distributions: short overviews, official downloads from the nearest mirror, and step-by-step install guides.",
  },
  nav: {
    home: "Home",
    distros: "Distributions",
    learn: "Linux Guide",
    finder: "Distro Finder",
    family: "Family Tree",
    releases: "Releases",
    compare: "Compare",
    about: "About",
    skipToContent: "Skip to content",
    mainMenu: "Main menu",
    primary: "Primary",
  },
  search: {
    open: "Search",
    placeholder: "Search distributions and guides",
    shortcut: "Ctrl K",
    close: "Close search",
    noResults: "No results for “{query}”",
    loading: "Searching…",
    hint: "Type a distro name, desktop or topic.",
    results: "{count} results",
  },
  theme: {
    label: "Appearance",
    system: "Follow system style",
    light: "Light style",
    dark: "Dark style",
  },
  language: {
    label: "Language",
  },
  footer: {
    about: "About Linuxhub",
    data: "Release data refreshes automatically from official sources.",
    trademarks:
      "Distribution names and logos are trademarks of their respective owners and are used only to identify the projects.",
    license: "Text is available under CC BY-SA 4.0; code under the MIT License.",
    rss: "Release feed (RSS)",
    source: "Source code",
  },
  common: {
    loading: "Loading…",
    copy: "Copy",
    copied: "Copied",
    close: "Close",
    more: "More",
    learnMore: "Learn more",
    officialSite: "Official website",
    externalLink: "(opens an external site)",
    lastChecked: "Checked {time}",
    updated: "Updated {date}",
    backToTop: "Back to top",
  },
  notFound: {
    title: "Page not found",
    description: "The page you’re looking for doesn’t exist or has moved.",
    home: "Go to the home page",
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type DictionaryShape = Widen<typeof en>;
