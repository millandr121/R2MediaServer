import { Hono, type Context } from "hono";
import type { AppEnv, FileRow, FolderRow } from "../types";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/http";
import { newId, now } from "../lib/id";
import { sanitizeName, keyForFile } from "../lib/keys";
import { toFileDTO } from "../lib/dto";
import {
  presignUpload,
  presignDownload,
  initiateMultipart,
  presignPart,
  completeMultipart,
  abortMultipart,
  headObject,
  deleteObject,
} from "../lib/r2";

const files = new Hono<AppEnv>();
files.use("*", requireAuth);

// Files larger than this use S3 multipart so the browser can upload in
// parallel chunks and resume; smaller files use a single presigned PUT.
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const PART_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_PARTS = 10_000;

function planParts(size: number): { partSize: number; partCount: number } {
  let partSize = PART_SIZE;
  if (Math.ceil(size / partSize) > MAX_PARTS) {
    partSize = Math.ceil(size / MAX_PARTS / (5 * 1024 * 1024)) * (5 * 1024 * 1024);
  }
  return { partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}

async function ownedFile(c: Context<AppEnv>, id: string): Promise<FileRow> {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ? AND owner_id = ?")
    .bind(id, user.id)
    .first<FileRow>();
  if (!row) return notFound("File not found");
  return row;
}

/**
 * Begin an upload. Creates a pending file row and returns either a single
 * presigned PUT URL or a multipart plan the browser uploads chunk-by-chunk.
 */
files.post("/upload-url", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = sanitizeName(String(body.name ?? ""));
  const size = Number(body.size ?? 0);
  const contentType = typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
  if (!name) return badRequest("File name is required");
  if (!Number.isFinite(size) || size < 0) return badRequest("Invalid file size");

  const folderId: string | null = body.folderId && body.folderId !== "root" ? body.folderId : null;
  let folderPath = "";
  if (folderId) {
    const folder = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ? AND owner_id = ?")
      .bind(folderId, user.id)
      .first<FolderRow>();
    if (!folder) return notFound("Destination folder not found");
    folderPath = folder.path;
  }

  const id = newId("fil_");
  const key = keyForFile(folderPath, name);
  const ts = now();

  if (size > MULTIPART_THRESHOLD) {
    const uploadId = await initiateMultipart(c.env, key, contentType);
    const { partSize, partCount } = planParts(size);
    await c.env.DB.prepare(
      `INSERT INTO files (id, folder_id, name, r2_key, size, content_type, status, owner_id, upload_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    )
      .bind(id, folderId, name, key, size, contentType, user.id, uploadId, ts, ts)
      .run();
    return c.json({ fileId: id, mode: "multipart", partSize, partCount });
  }

  const uploadUrl = await presignUpload(c.env, key, contentType);
  await c.env.DB.prepare(
    `INSERT INTO files (id, folder_id, name, r2_key, size, content_type, status, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  )
    .bind(id, folderId, name, key, size, contentType, user.id, ts, ts)
    .run();
  return c.json({ fileId: id, mode: "single", uploadUrl });
});

/** Presign one or more multipart part URLs. */
files.post("/:id/parts", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  if (!file.upload_id) return badRequest("File is not a multipart upload");
  const body = await c.req.json().catch(() => ({}));
  const numbers: number[] = Array.isArray(body.partNumbers)
    ? body.partNumbers.map(Number).filter((n: number) => n >= 1 && n <= MAX_PARTS)
    : [];
  if (numbers.length === 0) return badRequest("partNumbers required");

  const urls = await Promise.all(
    numbers.map(async (partNumber) => ({
      partNumber,
      url: await presignPart(c.env, file.r2_key, file.upload_id!, partNumber),
    })),
  );
  return c.json({ urls });
});

/** Finalize an upload (single or multipart) and mark the file ready. */
files.post("/:id/complete", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));

  if (file.upload_id) {
    const parts = Array.isArray(body.parts) ? body.parts : [];
    if (parts.length === 0) return badRequest("parts required to complete multipart upload");
    await completeMultipart(c.env, file.r2_key, file.upload_id, parts);
  }

  const head = await headObject(c.env, file.r2_key);
  if (!head) {
    return badRequest("Upload not found in storage — did the browser PUT succeed?");
  }

  const ts = now();
  await c.env.DB.prepare(
    "UPDATE files SET size = ?, content_type = ?, status = 'ready', upload_id = NULL, updated_at = ? WHERE id = ?",
  )
    .bind(head.size, head.httpMetadata?.contentType ?? file.content_type, ts, file.id)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(file.id).first<FileRow>();
  return c.json({ file: toFileDTO(row!) });
});

/** Abort a pending upload and remove the placeholder row. */
files.post("/:id/abort", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  if (file.status === "ready") return badRequest("Cannot abort a completed file");
  if (file.upload_id) await abortMultipart(c.env, file.r2_key, file.upload_id);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  return c.json({ ok: true });
});

/** Presigned URL to download the file (attachment). */
files.get("/:id/download-url", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  const url = await presignDownload(c.env, file.r2_key, { downloadName: file.name });
  return c.json({ url });
});

/** Presigned URL to view inline (image preview / video streaming with ranges). */
files.get("/:id/preview-url", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  const url = await presignDownload(c.env, file.r2_key, { downloadName: file.name, inline: true });
  return c.json({ url });
});

/** Rename and/or move a file. */
files.patch("/:id", async (c) => {
  const user = c.get("user");
  const file = await ownedFile(c, c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const ts = now();

  const newName = typeof body.name === "string" ? sanitizeName(body.name) : file.name;
  if (!newName) return badRequest("File name is required");

  let folderId = file.folder_id;
  if (typeof body.folderId !== "undefined") {
    folderId = body.folderId && body.folderId !== "root" ? body.folderId : null;
    if (folderId) {
      const folder = await c.env.DB.prepare("SELECT id FROM folders WHERE id = ? AND owner_id = ?")
        .bind(folderId, user.id)
        .first();
      if (!folder) return notFound("Destination folder not found");
    }
  }

  await c.env.DB.prepare("UPDATE files SET name = ?, folder_id = ?, updated_at = ? WHERE id = ?")
    .bind(newName, folderId, ts, file.id)
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?").bind(file.id).first<FileRow>();
  return c.json({ file: toFileDTO(row!) });
});

/** Delete a file and its R2 object. */
files.delete("/:id", async (c) => {
  const file = await ownedFile(c, c.req.param("id"));
  if (file.upload_id) await abortMultipart(c.env, file.r2_key, file.upload_id);
  await deleteObject(c.env, file.r2_key);
  await c.env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  return c.json({ ok: true });
});

export default files;
