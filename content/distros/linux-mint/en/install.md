---
title: "Installing Linux Mint"
summary: "Live session, installer, and snapshots"
distro: linux-mint
doc: install
locale: en
official_links:
  homepage: https://linuxmint.com
  docs: https://linuxmint-user-guide.readthedocs.io
sources:
  - https://linuxmint-installation-guide.readthedocs.io/en/latest/
last_reviewed: 2026-07-19
translated: true
---

Download the Cinnamon edition ISO and verify it — Mint publishes SHA-256
sums and a GPG-signed sums file for every release:

```bash
sha256sum -b linuxmint-*.iso   # compare against sha256sum.txt
```

Flash the ISO to USB (balenaEtcher is the tool Mint's own guide suggests),
boot it, and you land in a full live desktop. The **Install Linux Mint**
icon starts a straightforward installer: language, keyboard, optional
codecs, disk layout, user account.

## After installing

On first boot the Welcome app walks through the recommended order: pick a
driver if your GPU needs one, enable system snapshots (Timeshift), then run
Update Manager. With snapshots on, any update can be rolled back — this is
the safety net the rest of Mint leans on.
