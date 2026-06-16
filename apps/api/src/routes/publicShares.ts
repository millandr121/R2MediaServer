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

export default pub;
