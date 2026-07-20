---
title: "Installing Pop!_OS"
summary: "Choosing the right ISO and installing"
distro: pop-os
doc: install
locale: en
official_links:
  homepage: https://system76.com/pop
  docs: https://support.system76.com
sources:
  - https://support.system76.com/articles/install-pop/
  - https://support.system76.com/articles/live-disk/
last_reviewed: 2026-07-19
translated: true
---

Pick the ISO for your GPU — **NVIDIA** (driver preinstalled) or
**Intel/AMD** — and verify the SHA-256 shown on the download page:

```bash
sha256sum -b pop-os_*.iso
```

Flash to USB (balenaEtcher or Popsicle, System76's own flasher) and boot.

## The installer

Installation is short: language, keyboard, disk (clean install or custom),
and optional full-disk encryption offered up front — Pop!_OS encrypts by
default on the clean-install path. The user account is created on first
boot rather than in the installer.

## After installing

Let the Shop (or COSMIC's app store) apply the first updates, or:

```bash
sudo apt update && sudo apt full-upgrade
```

A recovery partition is installed alongside the system — reinstalling or
repairing later happens from the boot menu without a USB stick.
