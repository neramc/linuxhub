---
title: "Using Fedora day to day"
summary: "dnf, Flatpak, and the release rhythm"
distro: fedora
doc: usage
locale: en
official_links:
  homepage: https://fedoraproject.org
  docs: https://docs.fedoraproject.org
sources:
  - https://docs.fedoraproject.org/en-US/quick-docs/dnf/
  - https://docs.fedoraproject.org/en-US/quick-docs/upgrading-fedora-offline/
last_reviewed: 2026-07-19
translated: true
---

Packages come from the RPM archive via `dnf`, with Flathub available for
desktop apps in GNOME Software.

```bash
sudo dnf upgrade                  # apply updates
sudo dnf install <name>           # install a package
sudo dnf search <term>            # find packages
flatpak install flathub <app-id>  # desktop apps from Flathub
```

## Release upgrades

Moving to a new release is built in:

```bash
sudo dnf system-upgrade download --releasever=<next>
sudo dnf system-upgrade reboot
```

## Getting help

Ask Fedora (ask.fedoraproject.org) is the official Q&A forum, and
docs.fedoraproject.org carries the quick-docs series for common tasks.
Fedora Magazine publishes practical how-tos with each release.
