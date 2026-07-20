---
title: "Installing Arch Linux"
summary: "The wiki way, or archinstall"
distro: arch
doc: install
locale: en
official_links:
  homepage: https://archlinux.org
  docs: https://wiki.archlinux.org
sources:
  - https://wiki.archlinux.org/title/Installation_guide
  - https://wiki.archlinux.org/title/Archinstall
last_reviewed: 2026-07-19
translated: true
---

Download the ISO from a mirror and verify its GPG signature:

```bash
gpg --keyserver-options auto-key-retrieve --verify archlinux-*.iso.sig
```

Boot the USB stick into the live environment. From here there are two
supported paths:

## The Installation Guide

The wiki's Installation Guide is the canonical route: partition, format,
`pacstrap` the base system, generate `fstab`, chroot, configure locale,
bootloader, and users. It takes longer, and that's the point — you finish
knowing exactly what's on the machine.

## archinstall

The ISO ships a guided installer for those who want the same result faster:

```bash
archinstall
```

It prompts for disk, profile (desktop or minimal), users, and network, then
performs a standard installation.

## After installing

Connect to the network, then keep the system whole — always full upgrades,
never partial:

```bash
sudo pacman -Syu
```

Check the front-page news on archlinux.org before large updates; manual
interventions are announced there.
