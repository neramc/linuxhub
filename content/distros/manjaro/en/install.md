---
title: "Installing Manjaro"
summary: "Live boot and the Calamares installer"
distro: manjaro
doc: install
locale: en
official_links:
  homepage: https://manjaro.org
  docs: https://wiki.manjaro.org
sources:
  - https://wiki.manjaro.org/index.php/Installation_Guides
last_reviewed: 2026-07-19
translated: true
---

Download the edition you want (KDE Plasma, GNOME, or Xfce) and verify the
checksum published alongside it:

```bash
sha256sum -b manjaro-*.iso
```

Flash to USB and boot. The live menu lets you pick open-source or
proprietary graphics drivers before the desktop loads — choose proprietary
for NVIDIA cards.

## The installer

Manjaro uses **Calamares**: location, keyboard, partitioning (erase or
manual), user account, done. It's the same friendly installer several other
distributions use, configured for Manjaro's defaults.

## After installing

Run the update pane in Manjaro's package manager or:

```bash
sudo pacman -Syu
```

The Manjaro Settings Manager handles kernels and drivers — worth a visit
once to see what your hardware got.
