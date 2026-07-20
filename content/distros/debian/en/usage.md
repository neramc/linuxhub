---
title: "Using Debian day to day"
summary: "apt, backports, and long quiet years"
distro: debian
doc: usage
locale: en
official_links:
  homepage: https://www.debian.org
  docs: https://www.debian.org/doc/
sources:
  - https://www.debian.org/doc/manuals/debian-reference/
  - https://backports.debian.org
last_reviewed: 2026-07-19
translated: true
---

Package management is classic `apt` against the stable archive:

```bash
sudo apt update
sudo apt full-upgrade
sudo apt install <name>
apt search <term>
```

## When stable is too old

**Backports** offers selected newer packages rebuilt for stable — kernels,
browsers, tools — opt-in per package:

```bash
sudo apt install -t stable-backports <name>
```

Flatpak also works well on Debian for current desktop apps atop the stable
base.

## Getting help

The Debian Reference and the wiki (wiki.debian.org) are thorough; the
debian-user mailing list and forums.debian.net handle questions. Debian
answers age well — the system changes slowly, so last year's guide is
usually still right.
