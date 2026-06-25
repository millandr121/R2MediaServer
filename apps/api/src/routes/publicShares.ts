import { Hono, type Context } from "hono";
import type { AppEnv, ShareRow, FolderRow, FileRow } from "../types";
import { badRequest, notFound, gone, unauthorized, forbidden } from "../lib/http";
import { newId, now } from "../lib/id";
import { sanitizeName, keyForFile } from "../lib/keys";
import { verifyPassword } from "../lib/crypto";
import { toFileDTO, toFolderDTO } from "../lib/dto";
import {
  loadShare,
  isRevoked,
  isExpired,
  downloadsExhausted,
  createUnlockToken,
  verifyUnlockToken,
} from "../lib/shares";
import { presignDownload, presignUpload, headObject } from "../lib/r2";

const pub = new Hono<AppEnv>();

/** Resolve a share, rejecting missing/revoked/expired links. */
async function resolveShare(c: Context<AppEnv>, token: string): Promise<ShareRow> {
  const share = await loadShare(c.env, token);
  if (!share || isRevoked(share)) return notFound("This link is not available");
  if (isExpired(share)) return gone("This link has expired");
  return share;
}

function shareSummary(share: ShareRow) {
  return {
    token: share.id,
    resourceType: share.resource_type,
    label: share.label,
    hasPassword: share.password_hash != null,
    expiresAt: share.expires_at,
    allowUpload: share.allow_upload === 1,
    maxDownloads: share.max_downloads,
    downloadCount: share.download_count,
  };
}

/** True if `folder` is the shared root or a descendant of it. */
function withinSubtree(root: FolderRow, folder: FolderRow): boolean {
  return folder.id === root.id || folder.path === root.path || folder.path.startsWith(`${root.path}/`);
}

/** Verify the visitor unlocked a password-protected share. */
async function ensureUnlocked(c: Context<AppEnv>, share: ShareRow): Promise<void> {
  if (share.password_hash == null) return;
  const key = c.req.query("k") ?? c.req.header("x-share-key") ?? "";
  if (!(await verifyUnlockToken(c.env, key, share.id))) forbidden("Password required");
}

/** Share metadata + contents (file info or folder listing). */
pub.get("/:token", async (c) => {
  const token = c.req.param("token");
  const share = await resolveShare(c, token);
  const summary = shareSummary(share);

  const requiresPassword = share.password_hash != null;
  const key = c.req.query("k") ?? "";
  const unlocked = !requiresPassword || (await verifyUnlockToken(c.env, key, token));
  if (!unlocked) return c.json({ share: summary, locked: true });

  if (share.resource_type === "file") {
    const file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready'")
      .bind(share.resource_id)
      .first<FileRow>();
    if (!file) return notFound("Shared file is no longer available");
    return c.json({ share: summary, locked: false, file: toFileDTO(file) });
  }

  // Folder share — allow navigation within the shared subtree.
  const root = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
    .bind(share.resource_id)
    .first<FolderRow>();
  if (!root) return notFound("Shared folder is no longer available");

  let current = root;
  const navId = c.req.query("folder");
  if (navId && navId !== root.id) {
    const sub = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(navId).first<FolderRow>();
    if (!sub || !withinSubtree(root, sub)) return notFound("Folder not part of this share");
    current = sub;
  }

  const subfolders = await c.env.DB.prepare(
    "SELECT * FROM folders WHERE parent_id = ? ORDER BY name COLLATE NOCASE",
  )
    .bind(current.id)
    .all<FolderRow>();
  const files = await c.env.DB.prepare(
    "SELECT * FROM files WHERE folder_id = ? AND status = 'ready' ORDER BY name COLLATE NOCASE",
  )
    .bind(current.id)
    .all<FileRow>();

  // Breadcrumb trail relative to the shared root.
  const trail: FolderRow[] = [];
  let walk: FolderRow | null = current;
  while (walk) {
    trail.unshift(walk);
    if (walk.id === root.id || !walk.parent_id) break;
    walk = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(walk.parent_id).first<FolderRow>();
  }

  return c.json({
    share: summary,
    locked: false,
    folder: toFolderDTO(current),
    breadcrumbs: trail.map(toFolderDTO),
    folders: subfolders.results.map(toFolderDTO),
    files: files.results.map(toFileDTO),
  });
});

/** Exchange a password for a short-lived unlock token. */
pub.post("/:token/unlock", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  if (share.password_hash == null) return c.json({ key: null, locked: false });
  const body = await c.req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  if (!(await verifyPassword(password, share.password_hash))) {
    return unauthorized("Incorrect password");
  }
  return c.json({ key: await createUnlockToken(c.env, share.id) });
});

/** Presigned URL to download (or, with ?inline=1, stream) a shared file. */
pub.get("/:token/download/:fileId", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  await ensureUnlocked(c, share);
  const inline = c.req.query("inline") === "1";
  const fileId = c.req.param("fileId");

  // Resolve the requested file and confirm it belongs to this share.
  let file: FileRow | null = null;
  if (share.resource_type === "file") {
    if (fileId !== share.resource_id) return notFound("File not part of this share");
    file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready'")
      .bind(fileId)
      .first<FileRow>();
  } else {
    const candidate = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready'")
      .bind(fileId)
      .first<FileRow>();
    const root = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
      .bind(share.resource_id)
      .first<FolderRow>();
    if (candidate && root && candidate.folder_id) {
      const folder = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
        .bind(candidate.folder_id)
        .first<FolderRow>();
      if (folder && withinSubtree(root, folder)) file = candidate;
    }
  }
  if (!file) return notFound("File not part of this share");

  // Inline streaming is always allowed; explicit downloads are metered.
  if (!inline) {
    if (downloadsExhausted(share)) return gone("Download limit reached for this link");
    await c.env.DB.prepare("UPDATE shares SET download_count = download_count + 1 WHERE id = ?")
      .bind(share.id)
      .run();
  }

  const url = await presignDownload(c.env, file.r2_key, { downloadName: file.name, inline });
  return c.json({ url });
});

// ---- Client drop-box (optional, enabled per-share via allow_upload) --------

/** Presigned PUT for a visitor to upload into a shared folder (≤5 GB). */
pub.post("/:token/upload-url", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  await ensureUnlocked(c, share);
  if (share.resource_type !== "folder" || share.allow_upload !== 1) {
    return forbidden("Uploads are not enabled for this link");
  }
  const folder = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
    .bind(share.resource_id)
    .first<FolderRow>();
  if (!folder) return notFound("Shared folder is no longer available");

  const body = await c.req.json().catch(() => ({}));
  const name = sanitizeName(String(body.name ?? ""));
  const contentType = typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
  if (!name) return badRequest("File name is required");

  const id = newId("fil_");
  const key = keyForFile(folder.path, name);
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO files (id, folder_id, name, r2_key, size, content_type, status, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`,
  )
    .bind(id, folder.id, name, key, contentType, folder.owner_id, ts, ts)
    .run();

  const uploadUrl = await presignUpload(c.env, key, contentType);
  return c.json({ fileId: id, uploadUrl });
});

/** Mark a drop-box upload complete. */
pub.post("/:token/complete/:fileId", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  await ensureUnlocked(c, share);
  if (share.allow_upload !== 1) return forbidden("Uploads are not enabled for this link");

  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'pending'")
    .bind(c.req.param("fileId"))
    .first<FileRow>();
  if (!file) return notFound("Upload not found");

  const head = await headObject(c.env, file.r2_key);
  if (!head) return badRequest("Upload not found in storage");
  await c.env.DB.prepare(
    "UPDATE files SET size = ?, status = 'ready', updated_at = ? WHERE id = ?",
  )
    .bind(head.size, now(), file.id)
    .run();
  return c.json({ ok: true });
});

// ---- Public media delivery (CDN streaming + manifest for website embeds) ----

/**
 * Stream a file directly from R2 with CDN-friendly cache headers.
 * Only works on password-free shares. Cloudflare caches at the edge after the
 * first hit, so subsequent embeds on bamfieldmediahouse.ca cost zero Worker CPU.
 * Supports HTTP Range so <video> seeking works.
 */
pub.get("/:token/stream/:fileId", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  if (share.password_hash != null) return forbidden("Streaming is not available on password-protected shares");

  const fileId = c.req.param("fileId");
  let file: FileRow | null = null;

  if (share.resource_type === "file") {
    if (fileId !== share.resource_id) return notFound("File not part of this share");
    file = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready'")
      .bind(fileId).first<FileRow>();
  } else {
    const candidate = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND status = 'ready'")
      .bind(fileId).first<FileRow>();
    const root = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
      .bind(share.resource_id).first<FolderRow>();
    if (candidate && root && candidate.folder_id) {
      const folder = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
        .bind(candidate.folder_id).first<FolderRow>();
      if (folder && withinSubtree(root, folder)) file = candidate;
    }
  }
  if (!file) return notFound("File not part of this share");

  const rangeHeader = c.req.header("range");
  let obj: R2ObjectBody | null;
  let status = 200;
  const headers = new Headers();

  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? parseInt(m[1]) : 0;
      const end = m[2] ? parseInt(m[2]) : file.size - 1;
      obj = await c.env.BUCKET.get(file.r2_key, { range: { offset: start, length: end - start + 1 } });
      if (obj) {
        headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
        headers.set("Content-Length", String(end - start + 1));
        status = 206;
      }
    } else {
      obj = await c.env.BUCKET.get(file.r2_key);
    }
  } else {
    obj = await c.env.BUCKET.get(file.r2_key);
  }

  if (!obj) return notFound("File not found in storage");

  headers.set("Content-Type", file.content_type ?? "application/octet-stream");
  if (status === 200) headers.set("Content-Length", String(file.size));
  headers.set("Accept-Ranges", "bytes");
  // Cache for 1 year at Cloudflare's edge — new uploads get new file IDs so
  // there's no stale-content risk.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Vary", "Accept-Encoding");

  return new Response(obj.body, { status, headers });
});

/**
 * JSON manifest of every file in a shared folder tree (recursive).
 * Intended for consumption by bamfieldmediahouse.ca — fetch this URL on page
 * load and render any combination of the returned assets. Stream URLs in the
 * payload are stable, CDN-cached references.
 *
 * Example: GET /api/public/shares/TOKEN/manifest
 */
pub.get("/:token/manifest", async (c) => {
  const share = await resolveShare(c, c.req.param("token"));
  if (share.password_hash != null) return forbidden("Manifest is not available on password-protected shares");
  if (share.resource_type !== "folder") return badRequest("Manifest is only available for folder shares");

  const root = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?")
    .bind(share.resource_id).first<FolderRow>();
  if (!root) return notFound("Shared folder is no longer available");

  // One query pulls all files in the entire subtree via the materialized path.
  const rows = await c.env.DB.prepare(
    `SELECT f.*, fo.path AS folder_path, fo.name AS folder_name
     FROM files f
     JOIN folders fo ON f.folder_id = fo.id
     WHERE (fo.id = ? OR fo.path LIKE ?)
       AND f.status = 'ready'
     ORDER BY fo.path, f.name COLLATE NOCASE`,
  )
    .bind(root.id, `${root.path}/%`)
    .all<FileRow & { folder_path: string; folder_name: string }>();

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  const files = rows.results.map((f) => ({
    id: f.id,
    name: f.name,
    // Relative sub-folder path within the share root (empty = directly in root)
    folder: f.folder_path.replace(root.path, "").replace(/^\//, "") || null,
    url: `${origin}/api/public/shares/${share.id}/stream/${f.id}`,
    contentType: f.content_type ?? null,
    size: f.size,
    width: f.width ?? null,
    height: f.height ?? null,
    duration: f.duration ?? null,
    createdAt: f.created_at,
  }));

  return new Response(
    JSON.stringify({ folder: root.name, token: share.id, count: files.length, files }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // 5-min manifest cache; stale entries fall off naturally
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
});

export default pub;
