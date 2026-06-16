import { sign, verify } from "hono/jwt";
import type { Env, AuthUser, UserRow } from "../types";
import { randomToken, now } from "./id";

const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_COOKIE = "r2ms_session";

interface AccessPayload {
  sub: string;
  email: string;
  role: "admin" | "client";
  name: string | null;
  exp: number;
  [key: string]: unknown;
}

interface SessionRecord {
  userId: string;
  createdAt: number;
}

export function userFromRow(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, role: row.role, displayName: row.display_name };
}

/** Issue a short-lived signed JWT access token. */
export async function createAccessToken(env: Env, user: AuthUser): Promise<string> {
  const payload: AccessPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.displayName,
    exp: now() + ACCESS_TTL_SECONDS,
  };
  return sign(payload, env.JWT_SECRET, "HS256");
}

/** Verify a JWT access token; returns the principal or null. */
export async function verifyAccessToken(env: Env, token: string): Promise<AuthUser | null> {
  try {
    const payload = (await verify(token, env.JWT_SECRET, "HS256")) as AccessPayload;
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      displayName: payload.name ?? null,
    };
  } catch {
    return null;
  }
}

/** Create a refresh session in KV; returns the opaque session token. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const record: SessionRecord = { userId, createdAt: now() };
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

/** Look up a refresh session; returns the userId or null. */
export async function getSession(env: Env, token: string): Promise<string | null> {
  if (!token) return null;
  const raw = await env.SESSIONS.get(`session:${token}`);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as SessionRecord).userId;
  } catch {
    return null;
  }
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  if (token) await env.SESSIONS.delete(`session:${token}`);
}

/** Serialize the Set-Cookie header for the refresh session. */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "SameSite=None",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Clear the refresh session cookie. */
export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "Max-Age=0", "SameSite=None"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export { ACCESS_TTL_SECONDS, SESSION_TTL_SECONDS };
