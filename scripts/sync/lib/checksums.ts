/**
 * Parses checksum files as published by distributions:
 *   GNU coreutils:  "<hash>  <file>" or "<hash> *<file>"
 *   BSD/tagged:     "SHA256 (<file>) = <hash>"   (Fedora/CentOS/Rocky/Alma CHECKSUM)
 * PGP-signed wrappers (-----BEGIN PGP SIGNED MESSAGE-----) and comments are ignored.
 * Returns file name → lowercase hex digest (basename only).
 */
export function parseChecksums(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-----") || /^Hash:/i.test(line)) continue;
    const bsd = line.match(
      /^(?:SHA(?:1|224|256|384|512)|MD5|BLAKE2b?|B2)\s*\((.+)\)\s*=\s*([0-9a-fA-F]+)$/,
    );
    if (bsd?.[1] && bsd[2]) {
      out.set(basename(bsd[1]), bsd[2].toLowerCase());
      continue;
    }
    const gnu = line.match(/^([0-9a-fA-F]{32,128})\s+\*?(.+)$/);
    if (gnu?.[1] && gnu[2]) out.set(basename(gnu[2].trim()), gnu[1].toLowerCase());
  }
  return out;
}

function basename(path: string): string {
  return path.replace(/^\.\//, "").split("/").pop() ?? path;
}

/** Infers the algorithm from a hex digest length. */
export function checksumType(hex: string): "md5" | "sha1" | "sha256" | "sha512" {
  switch (hex.length) {
    case 32:
      return "md5";
    case 40:
      return "sha1";
    case 128:
      return "sha512";
    default:
      return "sha256";
  }
}
