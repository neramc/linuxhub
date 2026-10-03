/** Registry of per-distro sync sources (one module per catalog slug). */
import type { DistroSource } from "../source";
import arch from "./arch";
import debian from "./debian";
import fedora from "./fedora";
import linuxMint from "./linux-mint";
import popOs from "./pop-os";
import { kubuntu, lubuntu, ubuntu, ubuntuMate, xubuntu } from "./ubuntu-family";

export const SOURCES: DistroSource[] = [
  arch,
  debian,
  fedora,
  kubuntu,
  linuxMint,
  lubuntu,
  popOs,
  ubuntu,
  ubuntuMate,
  xubuntu,
];
