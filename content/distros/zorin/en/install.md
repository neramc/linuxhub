---
title: "Installing Zorin OS"
summary: "Live USB and a familiar installer"
distro: zorin
doc: install
locale: en
official_links:
  homepage: https://zorin.com/os
  docs: https://help.zorin.com
sources:
  - https://help.zorin.com/docs/getting-started/install-zorin-os/
last_reviewed: 2026-07-19
translated: true
---

Download the edition you want and verify the SHA-256 checksum shown on the
download page:

```bash
sha256sum -b Zorin-OS-*.iso
```

Flash it to a USB stick (balenaEtcher is what Zorin's guide recommends) and
boot. You land in a live desktop where everything can be tried first.

## The installer

Zorin uses the familiar Ubuntu-style installer: language, keyboard,
optional codecs and drivers, then disk layout — "Erase disk" for a clean
machine or "Install alongside" for dual-boot, with manual partitioning
available.

## After installing

Run Software Updater once, or:

```bash
sudo apt update && sudo apt full-upgrade
```

Then open **Zorin Appearance** and pick your layout — that's the moment the
desktop becomes yours. Each release tracks an Ubuntu LTS and is supported
until that base retires.
