---
title: "Using openSUSE day to day"
summary: "zypper, YaST, and snapshots"
distro: opensuse
doc: usage
locale: en
official_links:
  homepage: https://www.opensuse.org
  docs: https://doc.opensuse.org
sources:
  - https://doc.opensuse.org/documentation/leap/reference/html/book-reference/cha-sw-cl.html
  - https://en.opensuse.org/Portal:Snapper
last_reviewed: 2026-07-19
translated: true
---

`zypper` is the package manager; YaST offers the same operations
graphically.

```bash
sudo zypper refresh          # refresh repos
sudo zypper update           # Leap: apply updates
sudo zypper dup              # Tumbleweed: full distribution upgrade
sudo zypper install <name>
zypper search <term>
```

On Tumbleweed, `dup` is the normal update command — the whole snapshot
moves together, as tested by openQA.

## Snapshots

Snapper takes Btrfs snapshots before and after every zypper/YaST change.
If an update misbehaves, boot a previous snapshot from the GRUB menu and
roll back:

```bash
sudo snapper rollback
```

## Getting help

doc.opensuse.org holds the official manuals; forums.opensuse.org and the
openSUSE wiki cover the practical corners. YaST's built-in help explains
each module as you use it.
