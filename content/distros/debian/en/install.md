---
title: "Installing Debian"
summary: "netinst, the installer, and firmware"
distro: debian
doc: install
locale: en
official_links:
  homepage: https://www.debian.org
  docs: https://www.debian.org/doc/
sources:
  - https://www.debian.org/releases/stable/installmanual
  - https://www.debian.org/CD/verify
last_reviewed: 2026-07-19
translated: true
---

The **netinst** ISO is the usual choice — a small image that fetches the
rest from a mirror during installation. Live images with GNOME, KDE, or
Xfce exist if you want to try before installing. Verify the image against
the signed checksum files:

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

## The installer

Debian's installer runs in graphical or text mode and asks more questions
than most: mirror choice, partitioning, which desktop (or none) via
tasksel. Since Debian 12, non-free firmware needed by common Wi-Fi and GPU
hardware is included on official media and enabled when detected.

## After installing

Add your user to `sudo` (or use `su -`), then:

```bash
sudo apt update && sudo apt full-upgrade
```

A stable install needs little attention afterward; point releases fold in
accumulated fixes and arrive through normal updates.
