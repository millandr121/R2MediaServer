import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ChevronRight,
  Download,
  FolderPlus,
  FolderInput,
  HardDrive,
  Pencil,
  Share2,
  Trash2,
  Upload,
  FolderOpen,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { uploads } from "../lib/upload";
import { useTileDrag } from "../lib/useTileDrag";
import type { FileItem, Folder, FolderContents } from "../lib/types";
import { formatBytes, formatRelative, fileKind, isPreviewable } from "../lib/format";
import { FileIcon, FolderTile } from "../components/FileIcon";
import { RowMenu } from "../components/RowMenu";
import { ShareModal } from "../components/ShareModal";
import { PreviewModal } from "../components/PreviewModal";
import { MoveModal, type MoveItem } from "../components/MoveModal";
import { Modal, Spinner, EmptyState, toast } from "../components/ui";

type ShareTarget = { type: "file" | "folder"; id: string; name: string };
type RenameTarget = { kind: "file" | "folder"; id: string; name: string };

const noSelect = { WebkitTouchCallout: "none", WebkitUserSelect: "none" } as const;

export function Drive() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<MoveItem | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.folders.contents(folderId));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to load folder", "error");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when an upload into the folder we're viewing completes.
  useEffect(
    () =>
      uploads.onFolderComplete((fid) => {
        if ((fid ?? null) === (folderId ?? null)) load();
      }),
    [folderId, load],
  );

  const startUploads = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    list.forEach((f) => uploads.upload(f, folderId ?? null));
    toast(`Uploading ${list.length} file${list.length > 1 ? "s" : ""}…`);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) startUploads(e.dataTransfer.files);
  };

  // Move an item into a destination folder (null = root).
  const moveItemTo = async (item: MoveItem, destFolderId: string | null) => {
    if (item.type === "folder" && item.id === destFolderId) return;
    try {
      if (item.type === "file") await api.files.update(item.id, { folderId: destFolderId });
      else await api.folders.update(item.id, { parentId: destFolderId });
      toast(`Moved “${item.name}”`, "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Move failed", "error");
    }
  };

  // Touch + mouse drag of tiles onto folders.
  const drag = useTileDrag((item, destFolderId) => moveItemTo(item, destFolderId));

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setBusy(true);
    try {
      await api.folders.create(newFolderName.trim(), folderId ?? null);
      setNewFolderOpen(false);
      setNewFolderName("");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Failed to create folder", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true);
    try {
      if (renameTarget.kind === "folder") await api.folders.update(renameTarget.id, { name: renameValue.trim() });
      else await api.files.update(renameTarget.id, { name: renameValue.trim() });
      setRenameTarget(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Rename failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (f: Folder) => {
    if (!confirm(`Delete folder "${f.name}" and everything inside it? This cannot be undone.`)) return;
    try {
      await api.folders.remove(f.id);
      toast("Folder deleted", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Delete failed", "error");
    }
  };

  const deleteFile = async (f: FileItem) => {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
    try {
      await api.files.remove(f.id);
      toast("File deleted", "success");
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Delete failed", "error");
    }
  };

  const downloadFile = async (f: FileItem) => {
    try {
      const { url } = await api.files.downloadUrl(f.id);
      window.location.href = url;
    } catch {
      toast("Could not start download", "error");
    }
  };

  const openFile = (f: FileItem) => {
    if (isPreviewable(fileKind(f.name, f.contentType))) setPreviewFile(f);
    else downloadFile(f);
  };

  const isEmpty = data && data.folders.length === 0 && data.files.length === 0;

  return (
    <div
      className="relative min-h-full px-5 py-5 sm:px-8"
      onDragOver={(e) => {
        // Only react to files dragged in from the OS; tile-to-folder moves are
        // handled by the pointer drag below.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {/* Header / breadcrumbs + actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm text-slate-400">
          <Link to="/drive" className="flex items-center gap-1.5 hover:text-slate-900">
            <HardDrive className="h-4 w-4" />
            My Drive
          </Link>
          {data?.breadcrumbs.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-slate-600" />
              {i === data.breadcrumbs.length - 1 ? (
                <span className="font-medium text-slate-900">{b.name}</span>
              ) : (
                <Link to={`/drive/${b.id}`} className="hover:text-slate-900">
                  {b.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={() => setNewFolderOpen(true)} className="btn-outline">
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
          <button onClick={() => fileInput.current?.click()} className="btn-primary">
            <Upload className="h-4 w-4" /> Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) startUploads(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-7 w-7 text-accent" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<FolderOpen className="h-12 w-12" />}
          title="This folder is empty"
          hint="Drag files here or use the Upload button to add media."
        />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data?.folders.map((folder) => (
            <div
              key={folder.id}
              data-drop-folder={folder.id}
              {...drag.bind({ type: "folder", id: folder.id, name: folder.name })}
              onClick={drag.click(() => navigate(`/drive/${folder.id}`))}
              onContextMenu={(e) => e.preventDefault()}
              style={noSelect}
              className={`card group flex cursor-pointer select-none items-center gap-3 p-3 transition-colors hover:border-ink-600 hover:bg-ink-800 ${
                drag.overId === folder.id ? "border-pink bg-pink-soft ring-2 ring-pink" : ""
              } ${drag.active?.id === folder.id ? "opacity-40" : ""}`}
            >
              <FolderTile className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{folder.name}</p>
                <p className="text-xs text-slate-500">Folder</p>
              </div>
              <RowMenu
                actions={[
                  {
                    label: "Share",
                    icon: <Share2 className="h-4 w-4" />,
                    onClick: () => setShareTarget({ type: "folder", id: folder.id, name: folder.name }),
                  },
                  {
                    label: "Move to…",
                    icon: <FolderInput className="h-4 w-4" />,
                    onClick: () => setMoveTarget({ type: "folder", id: folder.id, name: folder.name }),
                  },
                  {
                    label: "Rename",
                    icon: <Pencil className="h-4 w-4" />,
                    onClick: () => {
                      setRenameTarget({ kind: "folder", id: folder.id, name: folder.name });
                      setRenameValue(folder.name);
                    },
                  },
                  {
                    label: "Delete",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => deleteFolder(folder),
                  },
                ]}
              />
            </div>
          ))}

          {data?.files.map((file) => (
            <div
              key={file.id}
              {...drag.bind({ type: "file", id: file.id, name: file.name })}
              onClick={drag.click(() => openFile(file))}
              onContextMenu={(e) => e.preventDefault()}
              style={noSelect}
              className={`card group flex cursor-pointer select-none items-center gap-3 p-3 transition-colors hover:border-ink-600 hover:bg-ink-800 ${
                drag.active?.id === file.id ? "opacity-40" : ""
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <FileIcon name={file.name} contentType={file.contentType} className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.size)} · {formatRelative(file.updatedAt)}
                </p>
              </div>
              <RowMenu
                actions={[
                  {
                    label: "Download",
                    icon: <Download className="h-4 w-4" />,
                    onClick: () => downloadFile(file),
                  },
                  {
                    label: "Share",
                    icon: <Share2 className="h-4 w-4" />,
                    onClick: () => setShareTarget({ type: "file", id: file.id, name: file.name }),
                  },
                  {
                    label: "Move to…",
                    icon: <FolderInput className="h-4 w-4" />,
                    onClick: () => setMoveTarget({ type: "file", id: file.id, name: file.name }),
                  },
                  {
                    label: "Rename",
                    icon: <Pencil className="h-4 w-4" />,
                    onClick: () => {
                      setRenameTarget({ kind: "file", id: file.id, name: file.name });
                      setRenameValue(file.name);
                    },
                  },
                  {
                    label: "Delete",
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => deleteFile(file),
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}

      {/* Floating "ghost" that follows the finger/cursor while dragging a tile. */}
      {drag.active && drag.ghost && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[140%] rounded-lg border border-ink-700 bg-white px-3 py-2 shadow-xl"
          style={{ left: drag.ghost.x, top: drag.ghost.y }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
            {drag.active.type === "folder" ? (
              <FolderTile className="h-5 w-5" />
            ) : (
              <FileIcon name={drag.active.name} contentType={null} className="h-5 w-5" />
            )}
            <span className="max-w-[44vw] truncate">{drag.active.name}</span>
          </div>
        </div>
      )}

      {/* Drag overlay (OS file upload) */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/40 backdrop-blur-sm">
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-10 w-10 text-accent" />
            <p className="text-sm font-medium text-slate-900">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {shareTarget && (
        <ShareModal
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
      {moveTarget && <MoveModal item={moveTarget} onClose={() => setMoveTarget(null)} onMoved={load} />}
      {previewFile && (
        <PreviewModal
          file={previewFile}
          getInlineUrl={async () => (await api.files.previewUrl(previewFile.id)).url}
          getDownloadUrl={async () => (await api.files.downloadUrl(previewFile.id)).url}
          onClose={() => setPreviewFile(null)}
        />
      )}

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder">
        <input
          className="input"
          autoFocus
          placeholder="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createFolder()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setNewFolderOpen(false)} className="btn-ghost">
            Cancel
          </button>
          <button onClick={createFolder} className="btn-primary" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            Create
          </button>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename">
        <input
          className="input"
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitRename()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setRenameTarget(null)} className="btn-ghost">
            Cancel
          </button>
          <button onClick={submitRename} className="btn-primary" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}
