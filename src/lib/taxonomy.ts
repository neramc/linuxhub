/**
 * Closed vocabularies used by the distro catalog. Every value has a Korean and
 * English label so pages never hardcode them. Adding a value here is the only
 * way to introduce a new facet value (the content schema validates against
 * these lists).
 */

type Labels = { ko: string; en: string };

export const FAMILIES = {
  debian: { ko: "Debian 계열", en: "Debian family" },
  ubuntu: { ko: "Ubuntu 계열", en: "Ubuntu family" },
  arch: { ko: "Arch 계열", en: "Arch family" },
  fedora: { ko: "Fedora 계열", en: "Fedora family" },
  rhel: { ko: "RHEL 계열", en: "RHEL family" },
  suse: { ko: "SUSE 계열", en: "SUSE family" },
  mandriva: { ko: "Mandriva 계열", en: "Mandriva family" },
  slackware: { ko: "Slackware 계열", en: "Slackware family" },
  gentoo: { ko: "Gentoo 계열", en: "Gentoo family" },
  independent: { ko: "독립 배포판", en: "Independent" },
} as const satisfies Record<string, Labels>;

export const RELEASE_MODELS = {
  fixed: { ko: "정기 릴리스", en: "Fixed release" },
  lts: { ko: "장기 지원(LTS)", en: "Long-term support" },
  rolling: { ko: "롤링 릴리스", en: "Rolling release" },
  "semi-rolling": { ko: "세미 롤링", en: "Semi-rolling" },
} as const satisfies Record<string, Labels>;

export const DESKTOPS = {
  gnome: { ko: "GNOME", en: "GNOME" },
  kde: { ko: "KDE Plasma", en: "KDE Plasma" },
  xfce: { ko: "Xfce", en: "Xfce" },
  cinnamon: { ko: "Cinnamon", en: "Cinnamon" },
  mate: { ko: "MATE", en: "MATE" },
  lxqt: { ko: "LXQt", en: "LXQt" },
  lxde: { ko: "LXDE", en: "LXDE" },
  budgie: { ko: "Budgie", en: "Budgie" },
  pantheon: { ko: "Pantheon", en: "Pantheon" },
  cosmic: { ko: "COSMIC", en: "COSMIC" },
  dde: { ko: "DDE", en: "DDE" },
  moksha: { ko: "Moksha", en: "Moksha" },
  trinity: { ko: "Trinity", en: "Trinity" },
  ukui: { ko: "UKUI", en: "UKUI" },
  icewm: { ko: "IceWM", en: "IceWM" },
  fluxbox: { ko: "Fluxbox", en: "Fluxbox" },
  jwm: { ko: "JWM", en: "JWM" },
  openbox: { ko: "Openbox", en: "Openbox" },
  i3: { ko: "i3", en: "i3" },
  sway: { ko: "Sway", en: "Sway" },
  hyprland: { ko: "Hyprland", en: "Hyprland" },
  niri: { ko: "niri", en: "niri" },
  none: { ko: "데스크톱 없음", en: "No desktop" },
} as const satisfies Record<string, Labels>;

export const USE_CASES = {
  beginner: { ko: "입문자", en: "Beginners" },
  desktop: { ko: "일상용 데스크톱", en: "Everyday desktop" },
  gaming: { ko: "게이밍", en: "Gaming" },
  developer: { ko: "개발", en: "Development" },
  server: { ko: "서버", en: "Servers" },
  security: { ko: "보안 점검", en: "Security testing" },
  privacy: { ko: "개인정보 보호", en: "Privacy" },
  lightweight: { ko: "가벼움·구형 PC", en: "Lightweight & old PCs" },
  creative: { ko: "창작·멀티미디어", en: "Creative work" },
  education: { ko: "교육", en: "Education" },
  enterprise: { ko: "기업", en: "Enterprise" },
  tinkerer: { ko: "직접 구성", en: "Build-your-own" },
} as const satisfies Record<string, Labels>;

export const DIFFICULTIES = {
  beginner: { ko: "쉬움", en: "Easy" },
  intermediate: { ko: "보통", en: "Moderate" },
  advanced: { ko: "어려움", en: "Advanced" },
} as const satisfies Record<string, Labels>;

export const ARCHITECTURES = {
  x86_64: { ko: "x86_64 (64비트 PC)", en: "x86_64 (64-bit PC)" },
  aarch64: { ko: "ARM64 (aarch64)", en: "ARM64 (aarch64)" },
  i686: { ko: "x86 (32비트 PC)", en: "x86 (32-bit PC)" },
  armhf: { ko: "ARM 32비트 (armhf)", en: "ARM 32-bit (armhf)" },
  ppc64le: { ko: "POWER (ppc64le)", en: "POWER (ppc64le)" },
  s390x: { ko: "IBM Z (s390x)", en: "IBM Z (s390x)" },
  riscv64: { ko: "RISC-V (riscv64)", en: "RISC-V (riscv64)" },
} as const satisfies Record<string, Labels>;

/** Installer programs. Each one maps to a shared install-guide partial. */
export const INSTALLERS = {
  "ubuntu-desktop": { ko: "Ubuntu 데스크톱 설치 프로그램", en: "Ubuntu Desktop installer" },
  subiquity: { ko: "Subiquity (Ubuntu Server)", en: "Subiquity (Ubuntu Server)" },
  calamares: { ko: "Calamares", en: "Calamares" },
  anaconda: { ko: "Anaconda", en: "Anaconda" },
  "debian-installer": { ko: "Debian 설치 프로그램", en: "Debian Installer" },
  archinstall: { ko: "archinstall / 수동 설치", en: "archinstall / manual install" },
  agama: { ko: "Agama", en: "Agama" },
  yast: { ko: "YaST", en: "YaST" },
  "mx-installer": { ko: "MX 설치 프로그램", en: "MX Installer" },
  "pop-installer": { ko: "Pop!_OS 설치 프로그램", en: "Pop!_OS installer" },
  "elementary-installer": { ko: "elementary 설치 프로그램", en: "elementary Installer" },
  "deepin-installer": { ko: "deepin 설치 프로그램", en: "deepin Installer" },
  "nixos-installer": { ko: "NixOS 설치 (Calamares/수동)", en: "NixOS install (Calamares/manual)" },
  "void-installer": { ko: "void-installer", en: "void-installer" },
  "alpine-setup": { ko: "setup-alpine", en: "setup-alpine" },
  "gentoo-handbook": { ko: "Gentoo 핸드북 (수동)", en: "Gentoo Handbook (manual)" },
  slackware: { ko: "Slackware setup", en: "Slackware setup" },
  "qubes-installer": { ko: "Qubes 설치 프로그램 (Anaconda)", en: "Qubes installer (Anaconda)" },
  "tails-usb": { ko: "USB 라이브 (설치 없음)", en: "Live USB (no install)" },
  "raspberry-pi-imager": { ko: "Raspberry Pi Imager", en: "Raspberry Pi Imager" },
  "puppy-installer": { ko: "Puppy 설치 도구", en: "Puppy installers" },
  drakx: { ko: "DrakX", en: "DrakX" },
  "antix-installer": { ko: "antiX 설치 프로그램", en: "antiX Installer" },
  "vanilla-installer": { ko: "Vanilla OS 설치 프로그램", en: "Vanilla OS Installer" },
  "bootc-image": { ko: "이미지 기반 설치 (Anaconda)", en: "Image-based install (Anaconda)" },
  other: { ko: "기타", en: "Other" },
} as const satisfies Record<string, Labels>;

export const DOWNLOAD_STRATEGIES = {
  redirector: {
    ko: "공식 CDN (자동으로 가까운 서버)",
    en: "Official CDN (nearest server automatically)",
  },
  mirrors: { ko: "공식 미러 목록", en: "Official mirror list" },
  sourceforge: { ko: "공식 SourceForge", en: "Official SourceForge" },
  "official-page": { ko: "공식 다운로드 페이지", en: "Official download page" },
} as const satisfies Record<string, Labels>;

export const SECURE_BOOT = {
  yes: { ko: "지원", en: "Supported" },
  partial: { ko: "일부 지원", en: "Partial" },
  no: { ko: "미지원 (끄고 설치)", en: "Not supported (disable it)" },
} as const satisfies Record<string, Labels>;

type KeysOf<T> = [keyof T & string, ...(keyof T & string)[]];
export const keysOf = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as KeysOf<T>;

export type Family = keyof typeof FAMILIES;
export type ReleaseModel = keyof typeof RELEASE_MODELS;
export type Desktop = keyof typeof DESKTOPS;
export type UseCase = keyof typeof USE_CASES;
export type Difficulty = keyof typeof DIFFICULTIES;
export type Architecture = keyof typeof ARCHITECTURES;
export type Installer = keyof typeof INSTALLERS;
export type DownloadStrategy = keyof typeof DOWNLOAD_STRATEGIES;
