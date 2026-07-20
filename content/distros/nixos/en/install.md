---
title: "Installing NixOS"
summary: "Guided install, then your first rebuild"
distro: nixos
doc: install
locale: en
official_links:
  homepage: https://nixos.org
  docs: https://nixos.org/manual/nixos/stable/
sources:
  - https://nixos.org/manual/nixos/stable/#sec-installation
last_reviewed: 2026-07-19
translated: true
---

Download the GNOME or KDE graphical ISO and verify the checksum:

```bash
sha256sum -b nixos-*.iso
```

Boot it and run the guided installer (Calamares): location, keyboard,
desktop choice, partitioning, user. It writes a starter
`/etc/nixos/configuration.nix` reflecting your choices.

## The NixOS difference

That file *is* the system. To change anything later — install software,
enable a service — edit it and rebuild:

```nix
environment.systemPackages = with pkgs; [ firefox git ];
```

```bash
sudo nixos-rebuild switch
```

## After installing

Update the channel and rebuild once:

```bash
sudo nix-channel --update
sudo nixos-rebuild switch --upgrade
```

Every rebuild appears as a new generation in the boot menu — if a change
misbehaves, reboot into the previous one and you're back where you were.
