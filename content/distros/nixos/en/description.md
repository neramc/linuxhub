---
title: "NixOS"
summary: "Declarative, reproducible system configuration with rollbacks"
distro: nixos
doc: description
locale: en
official_links:
  homepage: https://nixos.org
  docs: https://nixos.org/manual/nixos/stable/
sources:
  - https://nixos.org/explore/
  - https://nixos.org/manual/nixos/stable/#preface
last_reviewed: 2026-07-19
translated: true
---

NixOS is built on the Nix package manager: your whole system — packages,
services, users, kernel options — is described in one declarative
configuration, builds are reproducible, and every change creates a new
"generation" you can boot back into from the GRUB menu.

That model changes how you work: instead of mutating the system with
install commands, you edit the configuration and rebuild. The same file
recreates the same machine anywhere.

## Editions

Graphical ISOs with GNOME or KDE Plasma give a normal live-desktop install;
the minimal ISO is a console environment for manual setups. Stable channels
release every six months; an unstable channel rolls continuously.
