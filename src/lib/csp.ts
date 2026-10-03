import { createHash } from "node:crypto";

/** CSP source expression for an inline script/style body. */
export function sha256Source(body: string): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`;
}
