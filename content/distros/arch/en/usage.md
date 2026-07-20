---
title: "Using Arch day to day"
summary: "pacman, the AUR, and the wiki"
distro: arch
doc: usage
locale: en
official_links:
  homepage: https://archlinux.org
  docs: https://wiki.archlinux.org
sources:
  - https://wiki.archlinux.org/title/Pacman
  - https://wiki.archlinux.org/title/Arch_User_Repository
last_reviewed: 2026-07-19
translated: true
---

Everything goes through `pacman`:

```bash
sudo pacman -Syu           # full system upgrade (do this regularly)
sudo pacman -S <name>      # install
pacman -Ss <term>          # search repos
pacman -Qs <term>          # search installed
sudo pacman -Rns <name>    # remove with unused deps
```

## The AUR

The Arch User Repository holds build scripts for tens of thousands of extra
packages. They build from source via `makepkg`, or through an AUR helper
you install once. AUR packages are user-submitted — read the PKGBUILD
before building.

## Staying healthy

Arch expects regular updates; going months between `-Syu` runs makes
upgrades harder, not safer. The ArchWiki is the reference for effectively
everything — most pages apply to other distros too, which is why everyone
links to it.
