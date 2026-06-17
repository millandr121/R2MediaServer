export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelative(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(unixSeconds);
}

export function formatPrice(cents: number, currency = "cad"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type FileKind = "image" | "video" | "audio" | "pdf" | "archive" | "doc" | "other";

export function fileKind(name: string, contentType: string | null): FileKind {
  const ct = contentType ?? "";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ct.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic"].includes(ext))
    return "image";
  if (ct.startsWith("video/") || ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (ct.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "audio";
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["doc", "docx", "txt", "md", "rtf", "pages", "xls", "xlsx", "csv", "ppt", "pptx"].includes(ext))
    return "doc";
  return "other";
}

export function isPreviewable(kind: FileKind): boolean {
  return kind === "image" || kind === "video" || kind === "audio" || kind === "pdf";
}
