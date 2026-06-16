import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ChevronRight, Download, Lock, ShieldCheck, FolderOpen, ArrowLeft } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { FileItem, PublicShareResponse } from "../lib/types";
import { formatBytes, fileKind, isPreviewable } from "../lib/format";
import { FileIcon, FolderTile } from "../components/FileIcon";
import { PreviewModal } from "../components/PreviewModal";
import { Spinner, EmptyState, toast } from "../components/ui";

export function PublicShare() {
  const { token = "" } = useParams();
  const [key, setKey] = useState<string | null>(() => sessionStorage.getItem(`share:${token}`));
  const [data, setData] = useState<PublicShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navFolder, setNavFolder] = useState<string | undefined>();
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [preview, setPreview] = useState<FileItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.publicShares.get(token, { folder: navFolder, key: key ?? undefined }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This link is not available");
    } finally {
      setLoading(false);
    }
  }, [token, navFolder, key]);

  useEffect(() => {
    load();
  }, [load]);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    try {
      const res = await api.publicShares.unlock(token, password);
      if (res.key) {
        sessionStorage.setItem(`share:${token}`, res.key);
        setKey(res.key);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Incorrect password", "error");
    } finally {
      setUnlocking(false);
    }
  };

  const download = async (file: FileItem) => {
    try {
      const { url } = await api.publicShares.downloadUrl(token, file.id, { key: key ?? undefined });
      window.location.href = url;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Download failed", "error");
    }
  };

  const open = (file: FileItem) => {
    if (isPreviewable(fileKind(file.name, file.contentType))) setPreview(file);
    else download(file);
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-800 bg-ink-900/60">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-pink">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <span className="text-base font-semibold text-slate-900">Vault</span>
          <span className="ml-auto text-xs text-slate-500">Secure share</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );

  if (loading)
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Spinner className="h-7 w-7 text-accent" />
        </div>
      </Shell>
    );

  if (error)
    return (
      <Shell>
        <EmptyState icon={<Lock className="h-12 w-12" />} title={error} hint="The link may have expired or been revoked." />
      </Shell>
    );

  if (!data) return null;

  // Password gate
  if (data.locked) {
    return (
      <Shell>
        <div className="mx-auto max-w-sm">
          <form onSubmit={unlock} className="card space-y-4 p-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15">
              <Lock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Password required</h2>
              <p className="mt-1 text-sm text-slate-400">Enter the password to view this share.</p>
            </div>
            <input
              className="input"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button type="submit" className="btn-primary w-full" disabled={unlocking}>
              {unlocking && <Spinner className="h-4 w-4" />}
              Unlock
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  // Single file share
  if (data.share.resourceType === "file" && data.file) {
    const file = data.file;
    const previewable = isPreviewable(fileKind(file.name, file.contentType));
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <div className="card p-6">
            <div className="flex items-center gap-4">
              <FileIcon name={file.name} contentType={file.contentType} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold text-slate-900">{file.name}</h1>
                <p className="text-sm text-slate-400">{formatBytes(file.size)}</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              {previewable && (
                <button onClick={() => setPreview(file)} className="btn-outline">
                  <FolderOpen className="h-4 w-4" /> Preview
                </button>
              )}
              <button onClick={() => download(file)} className="btn-primary">
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
          </div>
        </div>
        {preview && (
          <PreviewModal
            file={preview}
            getInlineUrl={async () =>
              (await api.publicShares.downloadUrl(token, preview.id, { inline: true, key: key ?? undefined })).url
            }
            getDownloadUrl={async () =>
              (await api.publicShares.downloadUrl(token, preview.id, { key: key ?? undefined })).url
            }
            onClose={() => setPreview(null)}
          />
        )}
      </Shell>
    );
  }

  // Folder share
  const atRoot = !navFolder || navFolder === data.breadcrumbs?.[0]?.id;
  return (
    <Shell>
      <div className="mb-5 flex items-center gap-2">
        {!atRoot && (
          <button
            onClick={() => {
              const crumbs = data.breadcrumbs ?? [];
              const parent = crumbs[crumbs.length - 2];
              setNavFolder(parent?.id);
            }}
            className="btn-ghost h-9 w-9 !p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
          {data.breadcrumbs?.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-4 w-4 text-slate-600" />}
              {i === (data.breadcrumbs?.length ?? 0) - 1 ? (
                <span className="font-medium text-slate-900">{b.name}</span>
              ) : (
                <button onClick={() => setNavFolder(b.id)} className="hover:text-slate-900">
                  {b.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      </div>

      {data.folders?.length === 0 && data.files?.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-12 w-12" />} title="This folder is empty" />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.folders?.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setNavFolder(folder.id)}
              className="card flex items-center gap-3 p-3 text-left transition-colors hover:border-ink-600 hover:bg-ink-800"
            >
              <FolderTile className="h-8 w-8 shrink-0" />
              <span className="truncate text-sm font-medium text-slate-800">{folder.name}</span>
            </button>
          ))}
          {data.files?.map((file) => (
            <div
              key={file.id}
              className="card group flex items-center gap-3 p-3 transition-colors hover:border-ink-600 hover:bg-ink-800"
            >
              <button onClick={() => open(file)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <FileIcon name={file.name} contentType={file.contentType} className="h-7 w-7 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
              </button>
              <button
                onClick={() => download(file)}
                className="btn-ghost h-8 w-8 !p-0"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal
          file={preview}
          getInlineUrl={async () =>
            (await api.publicShares.downloadUrl(token, preview.id, { inline: true, key: key ?? undefined })).url
          }
          getDownloadUrl={async () =>
            (await api.publicShares.downloadUrl(token, preview.id, { key: key ?? undefined })).url
          }
          onClose={() => setPreview(null)}
        />
      )}
    </Shell>
  );
}
