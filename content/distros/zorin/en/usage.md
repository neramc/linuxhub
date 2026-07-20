---
title: "Using Zorin OS day to day"
summary: "Software store, layouts, and help"
distro: zorin
doc: usage
locale: en
official_links:
  homepage: https://zorin.com/os
  docs: https://help.zorin.com
sources:
  - https://help.zorin.com
last_reviewed: 2026-07-19
translated: true
---

The Software store installs from the Ubuntu archive and Flathub in one
place; `apt` works underneath exactly as on Ubuntu:

```bash
sudo apt update && sudo apt upgrade
sudo apt install <name>
flatpak install flathub <app-id>
```

## Windows apps

Double-clicking a `.exe` prompts Zorin's Windows App Support flow — it
suggests a native alternative when one exists, or helps run the app through
the compatibility layer when it doesn't.

## The desktop

Zorin Appearance switches layouts live; each ships tuned panel, menu, and
shortcut behavior. Settings are otherwise standard GNOME, searchable from
the menu.

## Getting help

help.zorin.com covers the OS tools step by step, and the Zorin forum
handles questions. As with Mint, the Ubuntu LTS base means the wider
Ubuntu knowledge base applies directly.
