export type Role = "admin" | "client";

export interface User {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  kind: "personal" | "client" | "stock";
  createdAt: number;
  updatedAt: number;
}

export interface FileItem {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  contentType: string | null;
  status: "pending" | "ready";
  width: number | null;
  height: number | null;
  duration: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderContents {
  folder: Folder | null;
  breadcrumbs: Folder[];
  folders: Folder[];
  files: FileItem[];
}

export interface Share {
  id: string;
  token: string;
  url: string;
  resourceType: "file" | "folder";
  resourceId: string;
  label: string | null;
  hasPassword: boolean;
  expiresAt: number | null;
  maxDownloads: number | null;
  downloadCount: number;
  allowUpload: boolean;
  revoked: boolean;
  createdAt: number;
}

export interface StockItem {
  id: string;
  fileId: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  tags: string[];
  hasPreview: boolean;
  hasThumbnail: boolean;
  published: boolean;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PublicShareResponse {
  share: {
    token: string;
    resourceType: "file" | "folder";
    label: string | null;
    hasPassword: boolean;
    expiresAt: number | null;
    allowUpload: boolean;
    maxDownloads: number | null;
    downloadCount: number;
  };
  locked?: boolean;
  file?: FileItem;
  folder?: Folder;
  breadcrumbs?: Folder[];
  folders?: Folder[];
  files?: FileItem[];
}
