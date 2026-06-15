import { Hono } from "hono";
import type { AppEnv, ShareRow } from "../types";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/http";
import { randomToken, now } from "../lib/id";
import { hashPassword } from "../lib/crypto";
import { toShareDTO } from "../lib/dto";

const shares = new Hono<AppEnv>();
shares.use("*", requireAuth);

/** Create a share link for a file or folder the user owns. */
shares.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const resourceType = body.resourceType === "folder" ? "folder" : "file";
  const resourceId = String(body.resourceId ?? "");
  if (!resourceId) return badRequest("resourceId is required");

  // Verify ownership of the target resource.
  const table = resourceType === "folder" ? "folders" : "files";
  const owns = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND owner_id = ?`)
    .bind(resourceId, user.id)
    .first();
  if (!owns) return notFound(`${resourceType} not found`);

  const id = randomToken(24); // public, unguessable token
  const ts = now();
  const expiresAt =
    body.expiresInHours && Number(body.expiresInHours) > 0
      ? ts + Math.floor(Number(body.expiresInHours) * 3600)
      : null;
  const maxDownloads =
    body.maxDownloads && Number(body.maxDownloads) > 0 ? Math.floor(Number(body.maxDownloads)) : null;
  const passwordHash =
    typeof body.password === "string" && body.password.length > 0
      ? await hashPassword(body.password)
      : null;

  await c.env.DB.prepare(
    `INSERT INTO shares (id, resource_type, resource_id, created_by, label, password_hash,
       expires_at, max_downloads, allow_upload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      resourceType,
      resourceId,
      user.id,
      typeof body.label === "string" ? body.label.slice(0, 200) : null,
      passwordHash,
      expiresAt,
      maxDownloads,
      body.allowUpload ? 1 : 0,
      ts,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM shares WHERE id = ?").bind(id).first<ShareRow>();
  return c.json({ share: toShareDTO(row!, c.env.PUBLIC_APP_URL) }, 201);
});

/** List the current user's share links. */
shares.get("/", async (c) => {
  const user = c.get("user");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM shares WHERE created_by = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all<ShareRow>();
  return c.json({ shares: rows.results.map((r) => toShareDTO(r, c.env.PUBLIC_APP_URL)) });
});

/** Revoke (soft-delete) a share. */
shares.delete("/:id", async (c) => {
  const user = c.get("user");
  const res = await c.env.DB.prepare("DELETE FROM shares WHERE id = ? AND created_by = ?")
    .bind(c.req.param("id"), user.id)
    .run();
  if (!res.meta.changes) return notFound("Share not found");
  return c.json({ ok: true });
});

export default shares;
