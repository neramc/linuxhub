---
title: "Using EndeavourOS day to day"
summary: "pacman, yay, and the Discovery docs"
distro: endeavouros
doc: usage
locale: en
official_links:
  homepage: https://endeavouros.com
  docs: https://discovery.endeavouros.com
sources:
  - https://discovery.endeavouros.com
  - https://wiki.archlinux.org/title/Pacman
last_reviewed: 2026-07-19
translated: true
---

It's Arch underneath, so `pacman` is the daily driver — and `yay` comes
preinstalled for the AUR:

```bash
sudo pacman -Syu      # full system upgrade
sudo pacman -S <name>
yay <term>            # search repos + AUR, build interactively
yay -Syu              # upgrade including AUR packages
```

## Staying current

Update regularly rather than rarely; check the EndeavourOS news and forum
sticky when a big Arch change lands. The `eos-update` helper wraps common
update chores including keyring refreshes.

## Getting help

The EndeavourOS forum is the friendliest corner of the Arch world — asking
a beginner question there is fine. **Discovery**
(discovery.endeavouros.com) collects the distro's own guides, and the
ArchWiki remains the deep reference for everything else.
