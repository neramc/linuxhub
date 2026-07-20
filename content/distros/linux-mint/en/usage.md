---
title: "Using Linux Mint day to day"
summary: "Update Manager, Software Manager, and help"
distro: linux-mint
doc: usage
locale: en
official_links:
  homepage: https://linuxmint.com
  docs: https://linuxmint-user-guide.readthedocs.io
sources:
  - https://linuxmint-user-guide.readthedocs.io/en/latest/
  - https://forums.linuxmint.com
last_reviewed: 2026-07-19
translated: true
---

Mint is Ubuntu-compatible underneath, so `apt` works exactly as you'd
expect; day to day, most people use the graphical tools instead.

```bash
sudo apt update && sudo apt upgrade   # what Update Manager does
sudo apt install <name>
```

**Software Manager** installs desktop apps (including Flatpaks from
Flathub), and **Update Manager** batches updates with clear severity
levels. **Timeshift** snapshots run on a schedule, so recovery from a bad
update is a menu choice rather than a reinstall.

## Getting help

The Linux Mint forums (forums.linuxmint.com) are famously beginner-friendly,
and the official user guide covers every bundled tool. Because Mint sits on
Ubuntu LTS, nearly all Ubuntu answers apply directly.
