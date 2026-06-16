import type {
  User,
  FolderContents,
  Folder,
  FileItem,
  Share,
  StockItem,
  PublicShareResponse,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => (accessToken = t);
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Deduplicate concurrent refreshes so a burst of 401s triggers one call.
let refreshing: Promise<User | null> | null = null;

async function doRefresh(): Promise<User | null> {
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; user: User };
    accessToken = data.accessToken;
    return data.user;
  } catch {
    return null;
  }
}

export function refresh(): Promise<User | null> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

interface Opts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  retry?: boolean;
}

async function request<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  if (accessToken) headers["authorization"] = `Bearer ${accessToken}`;

  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
    credentials: "include",
  });

  if (res.status === 401 && opts.retry !== false) {
    const user = await refresh();
    if (user) return request<T>(path, { ...opts, retry: false });
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const err = (await res.json()) as { error?: string; code?: string };
      if (err.error) message = err.error;
      code = err.code;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  auth: {
    status: () => request<{ needsSetup: boolean }>("/api/auth/status"),
    async login(email: string, password: string) {
      const data = await request<{ accessToken: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      accessToken = data.accessToken;
      return data.user;
    },
    async setup(email: string, password: string, displayName?: string) {
      const data = await request<{ accessToken: string; user: User }>("/api/auth/setup", {
        method: "POST",
        body: { email, password, displayName },
      });
      accessToken = data.accessToken;
      return data.user;
    },
    refresh,
    async logout() {
      await request("/api/auth/logout", { method: "POST" }).catch(() => {});
      accessToken = null;
    },
  },

  folders: {
    contents: (folderId?: string) =>
      request<FolderContents>(`/api/folders/contents?folder=${encodeURIComponent(folderId ?? "root")}`),
    create: (name: string, parentId: string | null, kind?: string) =>
      request<{ folder: Folder }>("/api/folders", { method: "POST", body: { name, parentId, kind } }),
    update: (id: string, patch: { name?: string; parentId?: string | null }) =>
      request<{ folder: Folder }>(`/api/folders/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request(`/api/folders/${id}`, { method: "DELETE" }),
  },

  files: {
    uploadUrl: (input: { name: string; size: number; contentType: string; folderId: string | null }) =>
      request<
        | { fileId: string; mode: "single"; uploadUrl: string }
        | { fileId: string; mode: "multipart"; partSize: number; partCount: number }
      >("/api/files/upload-url", { method: "POST", body: input }),
    presignParts: (id: string, partNumbers: number[]) =>
      request<{ urls: { partNumber: number; url: string }[] }>(`/api/files/${id}/parts`, {
        method: "POST",
        body: { partNumbers },
      }),
    complete: (id: string, parts?: { partNumber: number; etag: string }[]) =>
      request<{ file: FileItem }>(`/api/files/${id}/complete`, { method: "POST", body: { parts } }),
    abort: (id: string) => request(`/api/files/${id}/abort`, { method: "POST" }),
    downloadUrl: (id: string) => request<{ url: string }>(`/api/files/${id}/download-url`),
    previewUrl: (id: string) => request<{ url: string }>(`/api/files/${id}/preview-url`),
    update: (id: string, patch: { name?: string; folderId?: string | null }) =>
      request<{ file: FileItem }>(`/api/files/${id}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request(`/api/files/${id}`, { method: "DELETE" }),
  },

  shares: {
    create: (input: {
      resourceType: "file" | "folder";
      resourceId: string;
      label?: string;
      password?: string;
      expiresInHours?: number;
      maxDownloads?: number;
      allowUpload?: boolean;
    }) => request<{ share: Share }>("/api/shares", { method: "POST", body: input }),
    list: () => request<{ shares: Share[] }>("/api/shares"),
    remove: (id: string) => request(`/api/shares/${id}`, { method: "DELETE" }),
  },

  publicShares: {
    get: (token: string, params: { folder?: string; key?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.folder) q.set("folder", params.folder);
      if (params.key) q.set("k", params.key);
      const qs = q.toString();
      return request<PublicShareResponse>(`/api/public/shares/${token}${qs ? `?${qs}` : ""}`);
    },
    unlock: (token: string, password: string) =>
      request<{ key: string | null }>(`/api/public/shares/${token}/unlock`, {
        method: "POST",
        body: { password },
      }),
    downloadUrl: (token: string, fileId: string, opts: { inline?: boolean; key?: string } = {}) => {
      const q = new URLSearchParams();
      if (opts.inline) q.set("inline", "1");
      if (opts.key) q.set("k", opts.key);
      const qs = q.toString();
      return request<{ url: string }>(`/api/public/shares/${token}/download/${fileId}${qs ? `?${qs}` : ""}`);
    },
  },

  stock: {
    list: () => request<{ items: StockItem[] }>("/api/stock"),
    get: (id: string) => request<{ item: StockItem }>(`/api/stock/${id}`),
    checkout: (id: string, email: string) =>
      request<{ url: string }>(`/api/stock/${id}/checkout`, { method: "POST", body: { email } }),
    adminAll: () => request<{ items: StockItem[] }>("/api/stock/admin/all"),
    create: (input: Record<string, unknown>) =>
      request<{ item: StockItem }>("/api/stock", { method: "POST", body: input }),
    update: (id: string, input: Record<string, unknown>) =>
      request<{ item: StockItem }>(`/api/stock/${id}`, { method: "PATCH", body: input }),
    remove: (id: string) => request(`/api/stock/${id}`, { method: "DELETE" }),
    purchaseStatus: (id: string) =>
      request<{ status: string; title: string | null; downloadToken: string | null }>(
        `/api/stock/purchases/${id}/status`,
      ),
    purchaseDownload: (token: string) =>
      request<{ url: string; downloadsRemaining: number }>(`/api/stock/purchases/${token}/download`),
  },
};
