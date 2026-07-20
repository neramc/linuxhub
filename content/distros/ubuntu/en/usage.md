---
title: "Using Ubuntu day to day"
summary: "Packages, updates, and where to get help"
distro: ubuntu
doc: usage
locale: en
official_links:
  homepage: https://ubuntu.com
  docs: https://help.ubuntu.com
sources:
  - https://ubuntu.com/server/docs/package-management
  - https://snapcraft.io/docs
last_reviewed: 2026-07-19
translated: true
---

Software comes from two systems that coexist: the Debian-style `apt`
archive and Canonical's sandboxed snap store. App Center searches both.

```bash
sudo apt update            # refresh package lists
sudo apt full-upgrade      # apply updates
sudo apt install <name>    # install from the archive
snap install <name>        # install a snap
```

## Updates

Security updates arrive automatically by default. Interim releases are
supported for nine months; LTS releases for five years — check your version
with `lsb_release -a`.

## Getting help

Ask Ubuntu (askubuntu.com) is the busiest Q&A site in Linux, and the
official documentation at help.ubuntu.com covers the desktop and server.
Most Debian advice applies to Ubuntu as well, which doubles the amount of
help available.
