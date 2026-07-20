---
title: "Using Manjaro day to day"
summary: "pamac, branches, and kernels"
distro: manjaro
doc: usage
locale: en
official_links:
  homepage: https://manjaro.org
  docs: https://wiki.manjaro.org
sources:
  - https://wiki.manjaro.org/index.php/Pamac
  - https://wiki.manjaro.org/index.php/Manjaro_Kernels
last_reviewed: 2026-07-19
translated: true
---

**pamac**, Manjaro's package tool, works from the desktop or the terminal
and can search the AUR once enabled in its preferences:

```bash
pamac update                # full update
pamac install <name>
pamac search <term>
pamac build <aur-name>      # build from the AUR
```

`pacman` works exactly as on Arch if you prefer it.

## Update rhythm

Updates arrive in curated batches announced on the forum, typically every
week or two. Read the announcement thread when a large batch lands — known
issues and fixes are collected at the top.

## Kernels

```bash
mhwd-kernel -li             # list installed kernels
sudo mhwd-kernel -i linux612   # install another series
```

## Getting help

forum.manjaro.org is active and update announcements double as
troubleshooting threads; the Manjaro wiki covers the distro's own tools,
and the ArchWiki applies for nearly everything underneath.
