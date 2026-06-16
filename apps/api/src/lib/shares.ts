import { sign, verify } from "hono/jwt";
import type { Env, ShareRow } from "../types";
import { now } from "./id";

const UNLOCK_TTL_SECONDS = 6 * 60 * 60; // 6 hours

export async function loadShare(env: Env, token: string): Promise<ShareRow | null> {
  if (!token) return null;
  return env.DB.prepare("SELECT * FROM shares WHERE id = ?").bind(token).first<ShareRow>();
}

export function isRevoked(share: ShareRow): boolean {
  return share.revoked === 1;
}

export function isExpired(share: ShareRow): boolean {
  return share.expires_at != null && share.expires_at < now();
}

export function downloadsExhausted(share: ShareRow): boolean {
  return share.max_downloads != null && share.download_count >= share.max_downloads;
}

/** Short-lived token proving the visitor entered the share's password. */
export async function createUnlockToken(env: Env, shareToken: string): Promise<string> {
  return sign({ scope: "share", share: shareToken, exp: now() + UNLOCK_TTL_SECONDS }, env.JWT_SECRET, "HS256");
}

export async function verifyUnlockToken(env: Env, key: string, shareToken: string): Promise<boolean> {
  if (!key) return false;
  try {
    const payload = (await verify(key, env.JWT_SECRET, "HS256")) as { scope?: string; share?: string };
    return payload.scope === "share" && payload.share === shareToken;
  } catch {
    return false;
  }
}
