import type { FolderRow, FileRow, ShareRow, StockItemRow } from "../types";

export function toFolderDTO(r: FolderRow) {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    path: r.path,
    kind: r.kind,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toFileDTO(r: FileRow) {
  return {
    id: r.id,
    folderId: r.folder_id,
    name: r.name,
    size: r.size,
    contentType: r.content_type,
    status: r.status,
    width: r.width,
    height: r.height,
    duration: r.duration,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toShareDTO(r: ShareRow, appUrl: string) {
  return {
    id: r.id,
    token: r.id,
    url: `${appUrl.replace(/\/$/, "")}/s/${r.id}`,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    label: r.label,
    hasPassword: r.password_hash != null,
    expiresAt: r.expires_at,
    maxDownloads: r.max_downloads,
    downloadCount: r.download_count,
    allowUpload: r.allow_upload === 1,
    revoked: r.revoked === 1,
    createdAt: r.created_at,
  };
}

export function toStockDTO(r: StockItemRow) {
  return {
    id: r.id,
    fileId: r.file_id,
    title: r.title,
    description: r.description,
    priceCents: r.price_cents,
    currency: r.currency,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    hasPreview: r.preview_key != null,
    hasThumbnail: r.thumbnail_key != null,
    published: r.published === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
