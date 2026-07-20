---
title: "Installing openSUSE"
summary: "Choosing a track and running the installer"
distro: opensuse
doc: install
locale: en
official_links:
  homepage: https://www.opensuse.org
  docs: https://doc.opensuse.org
sources:
  - https://doc.opensuse.org/documentation/leap/startup/html/book-startup/
  - https://en.opensuse.org/SDB:Download_help
last_reviewed: 2026-07-19
translated: true
---

First pick a track: **Leap** (stable) or **Tumbleweed** (rolling). Download
the DVD image for offline installs or the network image to fetch packages
during setup, and verify the checksum:

```bash
sha256sum -c openSUSE-*.sha256
```

## The installer

openSUSE's installer is YaST itself: keyboard, desktop selection (KDE
Plasma, GNOME, Xfce, or server), partitioning with Btrfs + Snapper
snapshots proposed by default, and a final summary screen where every
choice can be revisited before anything is written.

## After installing

Apply updates once:

```bash
sudo zypper refresh && sudo zypper update    # Leap
sudo zypper dup                              # Tumbleweed
```

If you need media codecs, the community's Packman repository is the
standard addition — openSUSE's own wiki documents the one-command setup.
