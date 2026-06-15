import { Hono, type Context } from "hono";
import type { AppEnv, FolderRow, FileRow } from "../types";
import { requireAuth } from "../middleware/auth";
import { badRequest, notFound } from "../lib/http";
import { newId, now } from "../lib/id";
import { sanitizeName, slugify } from "../lib/keys";
import { toFolderDTO, toFileDTO } from "../lib/dto";
import { deleteObjects } from "../lib/r2";

const folders = new Hono<AppEnv>();
folders.use("*", requireAuth);

/** Load a folder owned by the current user, or throw 404. */
async function ownedFolder(c: Context<AppEnv>, id: string): Promise<FolderRow> {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ? AND owner_id = ?")
    .bind(id, user.id)
    .first<FolderRow>();
  if (!row) return notFound("Folder not found");
  return row;
}

async function breadcrumbs(c: Context<AppEnv>, folder: FolderRow | null): Promise<FolderRow[]> {
  const trail: FolderRow[] = [];
  let current = folder;
  const user = c.get("user");
  while (current) {
    trail.unshift(current);
    if (!current.parent_id) break;
    current = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ? AND owner_id = ?")
      .bind(current.parent_id, user.id)
      .first<FolderRow>();
  }
  return trail;
}

/** Browse a folder: its subfolders + files, plus breadcrumb trail. */
folders.get("/contents", async (c) => {
  const user = c.get("user");
  const folderId = c.req.query("folder");
  const isRoot = !folderId || folderId === "root";

  let folder: FolderRow | null = null;
  if (!isRoot) folder = await ownedFolder(c, folderId!);

  const parentClause = isRoot ? "folder_id IS NULL" : "folder_id = ?";
  const folderParent = isRoot ? "parent_id IS NULL" : "parent_id = ?";

  const subfolders = await c.env.DB.prepare(
    `SELECT * FROM folders WHERE owner_id = ? AND ${folderParent} ORDER BY name COLLATE NOCASE`,
  )
    .bind(...(isRoot ? [user.id] : [user.id, folderId]))
    .all<FolderRow>();

  const files = await c.env.DB.prepare(
    `SELECT * FROM files WHERE owner_id = ? AND ${parentClause} AND status = 'ready'
     ORDER BY name COLLATE NOCASE`,
  )
    .bind(...(isRoot ? [user.id] : [user.id, folderId]))
    .all<FileRow>();

  return c.json({
    folder: folder ? toFolderDTO(folder) : null,
    breadcrumbs: (await breadcrumbs(c, folder)).map(toFolderDTO),
    folders: subfolders.results.map(toFolderDTO),
    files: files.results.map(toFileDTO),
  });
});

/** Create a folder. */
folders.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = sanitizeName(String(body.name ?? ""));
  if (!name) return badRequest("Folder name is required");

  const parentId: string | null = body.parentId && body.parentId !== "root" ? body.parentId : null;
  const kind = ["personal", "client", "stock"].includes(body.kind) ? body.kind : "personal";

  let path = slugify(name);
  if (parentId) {
    const parent = await ownedFolder(c, parentId);
    path = `${parent.path}/${slugify(name)}`;
  }

  const id = newId("fld_");
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO folders (id, parent_id, name, path, owner_id, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, parentId, name, path, user.id, kind, ts, ts)
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(id).first<FolderRow>();
  return c.json({ folder: toFolderDTO(row!) }, 201);
});

/** Rename and/or move a folder, repointing descendant paths in one update. */
folders.patch("/:id", async (c) => {
  const folder = await ownedFolder(c, c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const ts = now();

  let newParentId = folder.parent_id;
  if (typeof body.parentId !== "undefined") {
    newParentId = body.parentId && body.parentId !== "root" ? body.parentId : null;
    if (newParentId === folder.id) return badRequest("A folder cannot contain itself");
  }
  const newName = typeof body.name === "string" ? sanitizeName(body.name) : folder.name;
  if (!newName) return badRequest("Folder name is required");

  // Compute the new materialized path.
  let parentPath = "";
  if (newParentId) {
    const parent = await ownedFolder(c, newParentId);
    if (parent.path === folder.path || parent.path.startsWith(`${folder.path}/`)) {
      return badRequest("Cannot move a folder into its own descendant");
    }
    parentPath = parent.path;
  }
  const newPath = parentPath ? `${parentPath}/${slugify(newName)}` : slugify(newName);
  const oldPath = folder.path;

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE folders SET name = ?, parent_id = ?, path = ?, updated_at = ? WHERE id = ?",
    ).bind(newName, newParentId, newPath, ts, folder.id),
    // Re-prefix every descendant's path.
    c.env.DB.prepare(
      `UPDATE folders SET path = ? || substr(path, ?), updated_at = ?
       WHERE owner_id = ? AND path LIKE ?`,
    ).bind(newPath, oldPath.length + 1, ts, folder.owner_id, `${oldPath}/%`),
  ]);

  const row = await c.env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(folder.id).first<FolderRow>();
  return c.json({ folder: toFolderDTO(row!) });
});

/** Delete a folder, its descendant folders, all files, and their R2 objects. */
folders.delete("/:id", async (c) => {
  const folder = await ownedFolder(c, c.req.param("id"));

  // Collect this folder + all descendants via materialized path.
  const descendants = await c.env.DB.prepare(
    "SELECT id FROM folders WHERE owner_id = ? AND (id = ? OR path LIKE ?)",
  )
    .bind(folder.owner_id, folder.id, `${folder.path}/%`)
    .all<{ id: string }>();
  const folderIds = descendants.results.map((r) => r.id);

  // Gather R2 keys for every file in those folders.
  const placeholders = folderIds.map(() => "?").join(",");
  const fileRows = await c.env.DB.prepare(
    `SELECT r2_key FROM files WHERE folder_id IN (${placeholders})`,
  )
    .bind(...folderIds)
    .all<{ r2_key: string }>();
  await deleteObjects(c.env, fileRows.results.map((r) => r.r2_key));

  // ON DELETE CASCADE removes descendant folders + their file rows.
  await c.env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(folder.id).run();
  return c.json({ ok: true });
});

export default folders;
