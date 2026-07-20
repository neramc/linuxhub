---
title: "Using Pop!_OS day to day"
summary: "Tiling, apt, and recovery"
distro: pop-os
doc: usage
locale: en
official_links:
  homepage: https://system76.com/pop
  docs: https://support.system76.com
sources:
  - https://support.system76.com/articles/pop-keyboard-shortcuts/
  - https://support.system76.com/articles/upgrade-pop/
last_reviewed: 2026-07-19
translated: true
---

Underneath it's Ubuntu-compatible `apt`, plus Flatpak for desktop apps in
the store:

```bash
sudo apt update && sudo apt full-upgrade
sudo apt install <name>
flatpak install flathub <app-id>
```

## The desktop

Toggle auto-tiling from the top bar and drive everything from the
keyboard: launcher (`Super`), move windows (`Super+arrows`), workspaces
(`Super+Ctrl+arrows`). The shortcut overlay in Settings lists the full set.

## Recovery

The built-in recovery partition can refresh the OS while keeping your home
directory — Settings → OS Upgrade & Recovery. Release upgrades are offered
in the same panel.

## Getting help

support.system76.com documents Pop-specific tools, and Ubuntu answers
apply for everything else. System76's community chat and Reddit's r/pop_os
are active for troubleshooting.
