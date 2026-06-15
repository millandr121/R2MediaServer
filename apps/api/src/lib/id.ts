/**
 * ID and token generation helpers built on the Web Crypto API
 * (available natively in Cloudflare Workers).
 */

const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A short, sortable-ish unique id for database primary keys. */
export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "");
}

/**
 * A cryptographically-random, URL-safe token.
 * Used for share links and download tokens — must be unguessable.
 */
export function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += URL_SAFE[b % URL_SAFE.length];
  return out;
}

/** Current time in unix seconds. */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}
