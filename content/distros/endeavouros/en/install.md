---
title: "Installing EndeavourOS"
summary: "Calamares over vanilla Arch"
distro: endeavouros
doc: install
locale: en
official_links:
  homepage: https://endeavouros.com
  docs: https://discovery.endeavouros.com
sources:
  - https://discovery.endeavouros.com/category/installation/
last_reviewed: 2026-07-19
translated: true
---

Download the ISO and verify it with the published SHA-512 sum or GPG
signature:

```bash
sha512sum -b EndeavourOS_*.iso
```

Boot the live environment (an Xfce session with a welcome app), connect to
the network, and launch the installer.

## The installer

**Calamares** runs in online mode by default: pick your desktop — KDE
Plasma, GNOME, Xfce, or window managers — and current packages install
straight from the Arch repos. Offline mode installs the default KDE
desktop without a connection. Partitioning offers erase, alongside, or
manual, with optional encryption.

## After installing

The Welcome app collects the useful post-install buttons: mirror ranking,
update, and links into the Discovery documentation. Or just:

```bash
sudo pacman -Syu
```

From here on, maintenance is Arch maintenance — read the update notes,
update regularly.
