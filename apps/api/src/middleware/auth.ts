import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { verifyAccessToken } from "../lib/auth";
import { unauthorized, forbidden } from "../lib/http";

/** Requires a valid Bearer access token; attaches the user to the context. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return unauthorized("Missing access token");

  const user = await verifyAccessToken(c.env, token);
  if (!user) return unauthorized("Invalid or expired access token");

  c.set("user", user);
  await next();
};

/** Requires the authenticated user to be an admin. Use after requireAuth. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") return forbidden("Admin access required");
  await next();
};
