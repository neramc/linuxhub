---
title: "Using elementary OS day to day"
summary: "AppCenter, Flatpak, and Pantheon"
distro: elementary
doc: usage
locale: en
official_links:
  homepage: https://elementary.io
  docs: https://docs.elementary.io
sources:
  - https://docs.elementary.io
last_reviewed: 2026-07-19
translated: true
---

**AppCenter** is the front door for software: curated native apps plus
system updates in one place. Flatpak is first-class — sideloading a
Flathub app integrates it like any other:

```bash
flatpak install flathub <app-id>
```

`apt` remains available underneath for command-line tools:

```bash
sudo apt update && sudo apt upgrade
sudo apt install <name>
```

## The desktop

Pantheon rewards learning its gestures: three-finger swipes for
multitasking and workspaces, `Super` for the shortcut overlay. Settings →
Desktop configures hot corners; keyboard-first workflows are well
supported.

## Getting help

docs.elementary.io covers installation through troubleshooting in plain
language. Community support lives on the elementary subreddit and Discord;
Ubuntu answers apply to the base system.
