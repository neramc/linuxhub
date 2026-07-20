---
title: "Using NixOS day to day"
summary: "Rebuilds, generations, and searching packages"
distro: nixos
doc: usage
locale: en
official_links:
  homepage: https://nixos.org
  docs: https://nixos.org/manual/nixos/stable/
sources:
  - https://nixos.org/manual/nixos/stable/#sec-package-management
  - https://search.nixos.org
last_reviewed: 2026-07-19
translated: true
---

System changes go through the configuration:

```bash
sudo nano /etc/nixos/configuration.nix   # edit declaratively
sudo nixos-rebuild switch                # apply
sudo nixos-rebuild switch --upgrade      # apply + update channel
```

Find packages and options at **search.nixos.org** — it covers both package
names and every `configuration.nix` option with documentation inline.

## Generations & rollback

```bash
nixos-rebuild list-generations
sudo nixos-rebuild switch --rollback
```

Old generations also appear in the boot menu; garbage-collect them when
disk space matters:

```bash
sudo nix-collect-garbage --delete-older-than 30d
```

## Getting help

The NixOS manual is the reference; discourse.nixos.org answers questions,
and the community wiki (wiki.nixos.org) collects practical recipes. Expect
a learning curve — the payoff is a system you can reproduce and undo.
