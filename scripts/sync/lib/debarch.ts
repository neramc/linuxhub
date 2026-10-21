/**
 * Debian architecture names as used in image paths and file names (Debian and
 * Devuan release archives) → the data model's architecture keys.
 */
import type { Architecture } from "../../../src/lib/taxonomy";

const ARCHES = new Map<string, Architecture | null>([
  ["amd64", "x86_64"],
  ["arm64", "aarch64"],
  ["armhf", "armhf"],
  ["i386", "i686"],
  ["ppc64el", "ppc64le"],
  ["riscv64", "riscv64"],
  ["s390x", "s390x"],
  // Real ports that the data model has no key for: their images are left out.
  ["armel", null],
  ["mips64el", null],
  ["mipsel", null],
]);

/**
 * The model's key for a Debian architecture name; null = a port the model cannot
 * represent (leave its images out). An unknown name throws, so that a new
 * architecture on an official page gets mapped on purpose instead of vanishing.
 */
export function debianArch(name: string, where: string): Architecture | null {
  const arch = ARCHES.get(name);
  if (arch === undefined) throw new Error(`unknown architecture "${name}" on ${where}`);
  return arch;
}
