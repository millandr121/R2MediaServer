import { Hono, type Context } from "hono";
import type { AppEnv, UserRow, FolderRow, FileRow, IntakeSubmissionRow } from "../types";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { badRequest, notFound, tooManyRequests, serverError } from "../lib/http";
import { newId, now, randomToken } from "../lib/id";
import { sanitizeName, slugify, keyForFile } from "../lib/keys";
import { toIntakeDTO, toFileDTO } from "../lib/dto";
import { presignUpload, headObject } from "../lib/r2";

const intake = new Hono<AppEnv>();

// Accept photos (any image) plus PDFs for print layouts; reject everything else.
const ALLOWED = (ct: string) => ct.startsWith("image/") || ct === "application/pdf";
const MAX_FILES = 200;
const MAX_PER_HOUR = 10; // submissions per IP per rolling hour
const STATUSES = ["new", "in_progress", "printed", "delivered", "cancelled"] as const;

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** The admin account owns every intake folder so they surface in the admin's Drive. */
async function adminUser(c: Context<AppEnv>): Promise<UserRow | null> {
  return c.env.DB.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
    .first<UserRow>();
}

/** Find (or lazily create) the "Print Intake" root folder owned by the admin. */
async function intakeRoot(c: Context<AppEnv>, admin: UserRow): Promise<FolderRow> {
  const existing = await c.env.DB.prepare(
    "SELECT * FROM folders WHERE owner_id = ? AND parent_id IS NULL AND path = 'print-intake'",
  )
    .bind(admin.id)
    .first<FolderRow>();
  if (existing) return existing;

  const id = newId("fld_");
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO folders (id, parent_id, name, path, owner_id, kind, created_at, updated_at)
     VALUES (?, NULL, 'Print Intake', 'print-intake', ?, 'client', ?, ?)`,
  )
    .bind(id, admin.id, ts, ts)
    .run();
  return (await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(id).first<FolderRow>())!;
}

/** Simple per-IP rolling-window rate limit backed by KV. */
async function rateLimited(c: Context<AppEnv>): Promise<boolean> {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const key = `intake:rl:${ip}`;
  const tsNow = now();
  let count = 1;
  let windowEnd = tsNow + 3600;

  const raw = await c.env.SESSIONS.get(key);
  if (raw) {
    const prev = JSON.parse(raw) as { c: number; e: number };
    if (prev.e > tsNow) {
      if (prev.c >= MAX_PER_HOUR) return true;
      count = prev.c + 1;
      windowEnd = prev.e;
    }
  }
  await c.env.SESSIONS.put(key, JSON.stringify({ c: count, e: windowEnd }), {
    expirationTtl: Math.max(60, windowEnd - tsNow),
  });
  return false;
}

// ---- Public intake: a customer submits an order + uploads their photos ------

/**
 * Create an intake submission. Auto-creates a dedicated per-customer folder,
 * records their contact + order details, and returns presigned upload URLs.
 *
 * Body: { customerName, customerEmail, customerPhone?, orderDetails?, message?,
 *         files: [{ name, contentType }] }
 */
intake.post("/", async (c) => {
  if (await rateLimited(c)) return tooManyRequests("Too many submissions. Please try again later.");

  const body = await c.req.json().catch(() => ({}));
  const customerName = sanitizeName(String(body.customerName ?? ""));
  const customerEmail = String(body.customerEmail ?? "").trim().toLowerCase();
  const customerPhone = body.customerPhone ? String(body.customerPhone).trim().slice(0, 40) : null;
  const message = body.message ? String(body.message).slice(0, 2000) : null;
  const orderDetails = body.orderDetails != null ? JSON.stringify(body.orderDetails).slice(0, 8000) : null;
  const files = Array.isArray(body.files) ? body.files : [];

  if (!customerName) return badRequest("Your name is required");
  if (!isEmail(customerEmail)) return badRequest("A valid email is required");
  if (files.length === 0) return badRequest("Add at least one photo");
  if (files.length > MAX_FILES) return badRequest(`Too many files (max ${MAX_FILES} per submission)`);
  for (const f of files) {
    const ct = String(f?.contentType ?? "");
    if (!ALLOWED(ct)) return badRequest("Only photos and PDFs are accepted");
  }

  const admin = await adminUser(c);
  if (!admin) return serverError("Intake is not available yet");
  const root = await intakeRoot(c, admin);

  // Per-submission folder: "2026-06-25 — Jane Doe", uniquely pathed.
  const ts = now();
  const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
  const folderName = `${dateStr} — ${customerName}`;
  const folderPath = `${root.path}/${dateStr}-${slugify(customerName)}-${randomToken(4)}`;
  const folderId = newId("fld_");
  await c.env.DB.prepare(
    `INSERT INTO folders (id, parent_id, name, path, owner_id, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'client', ?, ?)`,
  )
    .bind(folderId, root.id, folderName, folderPath, admin.id, ts, ts)
    .run();

  const submissionId = newId("int_");
  await c.env.DB.prepare(
    `INSERT INTO intake_submissions
       (id, folder_id, customer_name, customer_email, customer_phone, order_details, message, status, file_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', 0, ?, ?)`,
  )
    .bind(submissionId, folderId, customerName, customerEmail, customerPhone, orderDetails, message, ts, ts)
    .run();

  // Pre-create a pending file row + presigned PUT for each photo.
  const uploads: Array<{ fileId: string; name: string; uploadUrl: string }> = [];
  for (const f of files) {
    const name = sanitizeName(String(f.name ?? "")) || "photo";
    const contentType = String(f.contentType ?? "application/octet-stream");
    const fileId = newId("fil_");
    const key = keyForFile(folderPath, name);
    await c.env.DB.prepare(
      `INSERT INTO files (id, folder_id, name, r2_key, size, content_type, status, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`,
    )
      .bind(fileId, folderId, name, key, contentType, admin.id, ts, ts)
      .run();
    uploads.push({ fileId, name, uploadUrl: await presignUpload(c.env, key, contentType) });
  }

  return c.json({ submissionId, folderId, uploads }, 201);
});

/** Mark one uploaded photo complete (verifies it landed in R2). */
intake.post("/:submissionId/complete/:fileId", async (c) => {
  const submission = await c.env.DB.prepare("SELECT * FROM intake_submissions WHERE id = ?")
    .bind(c.req.param("submissionId"))
    .first<IntakeSubmissionRow>();
  if (!submission) return notFound("Submission not found");

  const file = await c.env.DB.prepare(
    "SELECT * FROM files WHERE id = ? AND folder_id = ? AND status = 'pending'",
  )
    .bind(c.req.param("fileId"), submission.folder_id)
    .first<FileRow>();
  if (!file) return notFound("Upload not found");

  const head = await headObject(c.env, file.r2_key);
  if (!head) return badRequest("Upload not found in storage");

  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE files SET size = ?, status = 'ready', updated_at = ? WHERE id = ?")
      .bind(head.size, ts, file.id),
    c.env.DB.prepare("UPDATE intake_submissions SET file_count = file_count + 1, updated_at = ? WHERE id = ?")
      .bind(ts, submission.id),
  ]);
  return c.json({ ok: true });
});

// ---- Admin: review submissions ----------------------------------------------

/** List all submissions, newest first. */
intake.get("/", requireAuth, requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM intake_submissions ORDER BY created_at DESC",
  ).all<IntakeSubmissionRow>();
  return c.json({ submissions: rows.results.map(toIntakeDTO) });
});

/** One submission with its uploaded photos. */
intake.get("/:id", requireAuth, requireAdmin, async (c) => {
  const submission = await c.env.DB.prepare("SELECT * FROM intake_submissions WHERE id = ?")
    .bind(c.req.param("id"))
    .first<IntakeSubmissionRow>();
  if (!submission) return notFound("Submission not found");

  const files = await c.env.DB.prepare(
    "SELECT * FROM files WHERE folder_id = ? AND status = 'ready' ORDER BY name COLLATE NOCASE",
  )
    .bind(submission.folder_id)
    .all<FileRow>();

  return c.json({ submission: toIntakeDTO(submission), files: files.results.map(toFileDTO) });
});

/** Update a submission's status (new → in_progress → printed → delivered). */
intake.patch("/:id", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const status = String(body.status ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return badRequest("Invalid status");

  const res = await c.env.DB.prepare(
    "UPDATE intake_submissions SET status = ?, updated_at = ? WHERE id = ?",
  )
    .bind(status, now(), c.req.param("id"))
    .run();
  if (!res.meta.changes) return notFound("Submission not found");

  const row = await c.env.DB.prepare("SELECT * FROM intake_submissions WHERE id = ?")
    .bind(c.req.param("id"))
    .first<IntakeSubmissionRow>();
  return c.json({ submission: toIntakeDTO(row!) });
});

export default intake;
