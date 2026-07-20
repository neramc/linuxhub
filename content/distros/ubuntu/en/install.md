---
title: "Installing Ubuntu"
summary: "From ISO download to first boot"
distro: ubuntu
doc: install
locale: en
official_links:
  homepage: https://ubuntu.com
  docs: https://help.ubuntu.com
sources:
  - https://ubuntu.com/tutorials/install-ubuntu-desktop
  - https://ubuntu.com/tutorials/try-ubuntu-before-you-install
last_reviewed: 2026-07-19
translated: true
---

Download the Desktop ISO (pick the current LTS unless you specifically want
newer packages), then verify it before flashing:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

Write the ISO to a USB stick with balenaEtcher, Rufus, or `dd`, then boot
from it. Ubuntu boots into a full live session first, so you can try the
desktop and check Wi-Fi and graphics before touching your disk.

## The installer

The graphical installer walks through keyboard, Wi-Fi, and disk layout.
"Erase disk and install" is the simple path; "Something else" gives manual
partitioning for dual-boot setups. Choosing "Install third-party software"
pulls in media codecs and vendor drivers during setup — recommended for
most desktops.

## After installing

Run the updater once (or `sudo apt update && sudo apt full-upgrade`), and
check **Additional Drivers** for NVIDIA GPUs. LTS releases offer a direct
upgrade path to the next LTS, so a fresh install can stay current for years.
