import { api } from "./api";

export type UploadStatus = "uploading" | "finalizing" | "done" | "error" | "canceled";

export interface UploadTask {
  id: string;
  fileId?: string;
  name: string;
  size: number;
  uploaded: number;
  status: UploadStatus;
  error?: string;
  folderId: string | null;
}

const PART_CONCURRENCY = 4;

/** PUT a blob with upload progress + ETag readback, via XHR (fetch can't do progress). */
function putWithProgress(
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  contentType?: string,
): { promise: Promise<string>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // ETag requires the R2 bucket CORS policy to expose the header.
        resolve((xhr.getResponseHeader("ETag") ?? "").replace(/"/g, ""));
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(body);
  });
  return { promise, xhr };
}

class UploadManager {
  private tasks = new Map<string, UploadTask>();
  private listeners = new Set<() => void>();
  private completionListeners = new Set<(folderId: string | null) => void>();
  private active = new Map<string, XMLHttpRequest[]>();
  private snapshot: UploadTask[] = [];

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  onFolderComplete(fn: (folderId: string | null) => void) {
    this.completionListeners.add(fn);
    return () => {
      this.completionListeners.delete(fn);
    };
  }

  getTasks = () => this.snapshot;

  private emit() {
    this.snapshot = [...this.tasks.values()].sort((a, b) => b.id.localeCompare(a.id));
    this.listeners.forEach((l) => l());
  }

  private patch(id: string, patch: Partial<UploadTask>) {
    const task = this.tasks.get(id);
    if (!task) return;
    Object.assign(task, patch);
    this.emit();
  }

  dismiss(id: string) {
    this.tasks.delete(id);
    this.emit();
  }

  clearFinished() {
    for (const [id, t] of this.tasks) {
      if (t.status === "done" || t.status === "error" || t.status === "canceled") this.tasks.delete(id);
    }
    this.emit();
  }

  cancel(id: string) {
    (this.active.get(id) ?? []).forEach((xhr) => xhr.abort());
    const task = this.tasks.get(id);
    if (task?.fileId) api.files.abort(task.fileId).catch(() => {});
    this.patch(id, { status: "canceled" });
  }

  async upload(file: File, folderId: string | null) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task: UploadTask = {
      id,
      name: file.name,
      size: file.size,
      uploaded: 0,
      status: "uploading",
      folderId,
    };
    this.tasks.set(id, task);
    this.emit();

    try {
      const init = await api.files.uploadUrl({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        folderId,
      });
      this.patch(id, { fileId: init.fileId });

      if (init.mode === "single") {
        const { promise, xhr } = putWithProgress(
          init.uploadUrl,
          file,
          (loaded) => this.patch(id, { uploaded: loaded }),
          file.type || "application/octet-stream",
        );
        this.active.set(id, [xhr]);
        await promise;
        this.patch(id, { status: "finalizing", uploaded: file.size });
        await api.files.complete(init.fileId);
      } else {
        await this.uploadMultipart(id, init.fileId, file, init.partSize, init.partCount);
      }

      this.active.delete(id);
      this.patch(id, { status: "done", uploaded: file.size });
      this.completionListeners.forEach((l) => l(folderId));
    } catch (err) {
      this.active.delete(id);
      const message = (err as Error).message;
      if (message === "aborted") {
        this.patch(id, { status: "canceled" });
      } else {
        this.patch(id, { status: "error", error: message });
      }
    }
  }

  private async uploadMultipart(
    id: string,
    fileId: string,
    file: File,
    partSize: number,
    partCount: number,
  ) {
    const partProgress = new Array(partCount).fill(0);
    const reportProgress = () =>
      this.patch(id, { uploaded: partProgress.reduce((a, b) => a + b, 0) });

    const completed: { partNumber: number; etag: string }[] = [];
    const xhrs: XMLHttpRequest[] = [];
    this.active.set(id, xhrs);

    let next = 0;
    const worker = async () => {
      while (next < partCount) {
        const index = next++;
        const partNumber = index + 1;
        const start = index * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));

        const { urls } = await api.files.presignParts(fileId, [partNumber]);
        const { promise, xhr } = putWithProgress(urls[0].url, blob, (loaded) => {
          partProgress[index] = loaded;
          reportProgress();
        });
        xhrs.push(xhr);
        const etag = await promise;
        completed.push({ partNumber, etag });
        partProgress[index] = blob.size;
        reportProgress();
      }
    };

    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, worker));
    this.patch(id, { status: "finalizing" });
    await api.files.complete(fileId, completed);
  }
}

export const uploads = new UploadManager();
