---
title: "Installing elementary OS"
summary: "Pay-what-you-can download to first boot"
distro: elementary
doc: install
locale: en
official_links:
  homepage: https://elementary.io
  docs: https://docs.elementary.io
sources:
  - https://elementary.io/docs/installation
last_reviewed: 2026-07-19
translated: true
---

Download from elementary.io — the purchase field accepts any amount,
including zero — and verify the SHA-256 shown next to the download button:

```bash
sha256sum -b elementaryos-*.iso
```

Flash to USB (the site's guide walks through balenaEtcher on every OS) and
boot into the live session.

## The installer

elementary's own installer is minimal by design: language, keyboard, then
erase-and-install or custom partitioning, with disk encryption offered
during setup. User creation happens on first boot.

## After installing

AppCenter's Updates tab applies system and app updates together, or:

```bash
sudo apt update && sudo apt full-upgrade
```

Take the short welcome tour — Pantheon's multitasking view, hot corners,
and gestures are where the desktop starts to click.
