/** Registry of per-distro sync sources (one module per catalog slug). */
import type { DistroSource } from "../source";
import arch from "./arch";
import fedora from "./fedora";

export const SOURCES: DistroSource[] = [arch, fedora];
