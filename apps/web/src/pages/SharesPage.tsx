import { useEffect, useState } from "react";
import { Copy, Link2, Lock, Share2, Trash2, FileIcon as FileGlyph, Folder } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Share } from "../lib/types";
import { formatDate, formatRelative } from "../lib/format";
import { Spinner, EmptyState, toast } from "../components/ui";

export function SharesPage() {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setShares((await api.shares.list()).shares);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to load shares", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (s: Share) => {
    if (!confirm("Revoke this link? Anyone using it will lose access immediately.")) return;
    try {
      await api.shares.remove(s.id);
      setShares((prev) => prev.filter((x) => x.id !== s.id));
      toast("Link revoked", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to revoke", "error");
    }
  };

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast("Link copied", "success");
  };

  return (
    <div className="px-5 py-5 sm:px-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Shares</h1>
        <p className="text-sm text-slate-400">Active links you've created for files and folders.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-7 w-7 text-accent" />
        </div>
      ) : shares.length === 0 ? (
        <EmptyState
          icon={<Share2 className="h-12 w-12" />}
          title="No share links yet"
          hint="Create one from any file or folder in your drive."
        />
      ) : (
        <div className="space-y-2">
          {shares.map((s) => {
            const expired = s.expiresAt != null && s.expiresAt < Date.now() / 1000;
            return (
              <div key={s.id} className="card flex flex-wrap items-center gap-3 p-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800">
                  {s.resourceType === "folder" ? (
                    <Folder className="h-4 w-4 text-accent" />
                  ) : (
                    <FileGlyph className="h-4 w-4 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {s.label ?? `${s.resourceType} link`}
                    </p>
                    {s.hasPassword && <Lock className="h-3.5 w-3.5 text-amber-400" />}
                    {expired && (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                        Expired
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    Created {formatRelative(s.createdAt)}
                    {s.expiresAt ? ` · Expires ${formatDate(s.expiresAt)}` : " · No expiry"}
                    {` · ${s.downloadCount}${s.maxDownloads ? `/${s.maxDownloads}` : ""} downloads`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost h-9 w-9 !p-0"
                    title="Open link"
                  >
                    <Link2 className="h-4 w-4" />
                  </a>
                  <button onClick={() => copy(s.url)} className="btn-ghost h-9 w-9 !p-0" title="Copy link">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => revoke(s)}
                    className="btn-ghost h-9 w-9 !p-0 text-red-400 hover:bg-red-500/10"
                    title="Revoke"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
