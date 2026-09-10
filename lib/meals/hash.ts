import { createHash } from "node:crypto";

/** SHA-256 hex digest of the (resized) image bytes, used to refuse duplicates. */
export function imageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
