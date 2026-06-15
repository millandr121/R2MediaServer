import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, UserRow } from "../types";
import { hashPassword, verifyPassword } from "../lib/crypto";
import {
  createAccessToken,
  createSession,
  getSession,
  deleteSession,
  userFromRow,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "../lib/auth";
import { newId, now } from "../lib/id";
import { badRequest, unauthorized } from "../lib/http";
import { requireAuth } from "../middleware/auth";

const auth = new Hono<AppEnv>();

/** Cookie attributes: SameSite=None+Secure over https, Lax over http (dev). */
function cookieOpts(c: { req: { url: string } }) {
  const isHttps = c.req.url.startsWith("https://");
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? "None" : "Lax") as "None" | "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function validEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/** Whether the instance still needs its first admin (drives the setup screen). */
auth.get("/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{
    n: number;
  }>();
  return c.json({ needsSetup: !row || row.n === 0 });
});

/**
 * One-time bootstrap of the first admin. Refuses once any admin exists, so the
 * endpoint is safe to leave deployed.
 */
auth.post("/setup", async (c) => {
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'",
  ).first<{ n: number }>();
  if (existing && existing.n > 0) return badRequest("Setup already completed");

  const body = await c.req.json().catch(() => ({}));
  const { email, password, displayName } = body as Record<string, unknown>;
  if (!validEmail(email)) return badRequest("A valid email is required");
  if (typeof password !== "string" || password.length < 8) {
    return badRequest("Password must be at least 8 characters");
  }

  const id = newId("usr_");
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, display_name, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), await hashPassword(password), (displayName as string) ?? null, ts, ts)
    .run();

  const user = { id, email: email.toLowerCase(), role: "admin" as const, displayName: (displayName as string) ?? null };
  const accessToken = await createAccessToken(c.env, user);
  const session = await createSession(c.env, id);
  setCookie(c, SESSION_COOKIE, session, cookieOpts(c));
  return c.json({ accessToken, user });
});

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body as Record<string, unknown>;
  if (!validEmail(email) || typeof password !== "string") {
    return badRequest("Email and password are required");
  }

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();

  // Always run a hash comparison to avoid leaking which emails exist.
  const ok =
    row?.password_hash != null && (await verifyPassword(password, row.password_hash));
  if (!row || !ok) return unauthorized("Invalid email or password");

  const user = userFromRow(row);
  const accessToken = await createAccessToken(c.env, user);
  const session = await createSession(c.env, row.id);
  setCookie(c, SESSION_COOKIE, session, cookieOpts(c));
  return c.json({ accessToken, user });
});

/** Exchange the httpOnly refresh cookie for a fresh access token. */
auth.post("/refresh", async (c) => {
  const token = getCookie(c, SESSION_COOKIE) ?? "";
  const userId = await getSession(c.env, token);
  if (!userId) return unauthorized("No active session");

  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first<UserRow>();
  if (!row) {
    await deleteSession(c.env, token);
    return unauthorized("Session user not found");
  }

  const user = userFromRow(row);
  const accessToken = await createAccessToken(c.env, user);
  return c.json({ accessToken, user });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE) ?? "";
  await deleteSession(c.env, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});

export default auth;
