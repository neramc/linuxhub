---
title: "Installing Fedora"
summary: "Media Writer, the installer, and first steps"
distro: fedora
doc: install
locale: en
official_links:
  homepage: https://fedoraproject.org
  docs: https://docs.fedoraproject.org
sources:
  - https://docs.fedoraproject.org/en-US/fedora/latest/getting-started/
  - https://docs.fedoraproject.org/en-US/fedora/latest/preparing-boot-media/
last_reviewed: 2026-07-19
translated: true
---

The easiest path is **Fedora Media Writer**: it downloads the current
release and writes a bootable USB stick in one step, on Windows, macOS, or
Linux. If you download the ISO yourself, verify the checksum against the
CHECKSUM file signed by the Fedora project:

```bash
sha256sum -c Fedora-Workstation-*-CHECKSUM
```

Boot the stick and try the live desktop, then choose **Install to Hard
Drive**. Fedora's installer handles disk selection and encryption; automatic
partitioning uses Btrfs with sensible subvolumes by default.

## After installing

Run the Software app once to catch the first update wave, or:

```bash
sudo dnf upgrade --refresh
```

GNOME's initial-setup asks about third-party repositories — enabling them
adds NVIDIA drivers and some codecs without any manual repo work. Each
release is supported for about thirteen months, and in-place upgrades to
the next release are a supported, routine operation.
