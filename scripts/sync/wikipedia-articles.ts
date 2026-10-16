/**
 * Editorial mapping: catalog slug → canonical English Wikipedia article for
 * the "popular today" ranking (ADR-0013). Titles use spaces and the article's
 * real title, never a redirect (the Pageviews API counts redirects
 * separately). `null` means there is no dedicated article; such distros are
 * never ranked. Do not point a distro at a broader article (its company, its
 * parent distro, a section of another page).
 *
 * Every catalog slug needs an entry (`bun run sync:validate` checks this).
 * Last verified 2026-10-04: each title is canonical on en.wikipedia.org/wiki/
 * (no "Redirected from") and returns daily data from the Pageviews API.
 */
export const WIKIPEDIA_ARTICLES: Readonly<Record<string, string | null>> = {
  almalinux: "AlmaLinux",
  "alpine-linux": "Alpine Linux",
  antix: "AntiX",
  arch: "Arch Linux",
  "artix-linux": "Artix Linux",
  // "Bazzite" alone is the mineral.
  bazzite: "Bazzite (operating system)",
  "bodhi-linux": "Bodhi Linux",
  cachyos: "CachyOS",
  "centos-stream": "CentOS Stream",
  debian: "Debian",
  deepin: "Deepin",
  devuan: "Devuan",
  "elementary-os": "Elementary OS",
  endeavouros: "EndeavourOS",
  fedora: "Fedora Linux",
  "garuda-linux": "Garuda Linux",
  gentoo: "Gentoo Linux",
  "kali-linux": "Kali Linux",
  "kde-neon": "KDE neon",
  kubuntu: "Kubuntu",
  "linux-lite": "Linux Lite",
  "linux-mint": "Linux Mint",
  lubuntu: "Lubuntu",
  mageia: "Mageia",
  manjaro: "Manjaro",
  "mx-linux": "MX Linux",
  nixos: "NixOS",
  nobara: "Nobara (operating system)",
  openmandriva: "OpenMandriva Lx",
  opensuse: "OpenSUSE",
  "oracle-linux": "Oracle Linux",
  "parrot-os": "Parrot OS",
  pclinuxos: "PCLinuxOS",
  "peppermint-os": "Peppermint OS",
  "pop-os": "Pop!_OS",
  "puppy-linux": "Puppy Linux",
  q4os: "Q4OS",
  "qubes-os": "Qubes OS",
  "raspberry-pi-os": "Raspberry Pi OS",
  "rocky-linux": "Rocky Linux",
  slackware: "Slackware",
  solus: "Solus (operating system)",
  sparkylinux: "SparkyLinux",
  tails: "Tails (operating system)",
  // "Tuxedo OS" redirects to a section of the "Tuxedo Computers" company article.
  "tuxedo-os": null,
  ubuntu: "Ubuntu",
  "ubuntu-mate": "Ubuntu MATE",
  // No English Wikipedia article.
  "vanilla-os": null,
  "void-linux": "Void Linux",
  xubuntu: "Xubuntu",
  "zorin-os": "Zorin OS",
};
