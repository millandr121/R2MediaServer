import { useEffect, useState } from "react";
import { ChevronRight, HardDrive, FolderPlus, CornerUpRight } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { FolderContents } from "../lib/types";
import { FolderTile } from "./FileIcon";
import { Modal, Spinner, toast } from "./ui";

export type MoveItem = { type: "file" | "folder"; id: string; name: string };

/** Browse the folder tree and move a file or folder into the chosen destination. */
export function MoveModal({
  item,
  onClose,
  onMoved,
}: {
  item: MoveItem;
  onClose: () => void;
  onMoved: () => void;
}) {
  // The folder currently being browsed as the destination (undefined = root).
  const [destId, setDestId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setLoading(true);
    api.folders
      .contents(destId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [destId]);

  const move = async () => {
    setBusy(true);
    try {
      const target = destId ?? null;
      if (item.type === "file") await api.files.update(item.id, { folderId: target });
      else await api.folders.update(item.id, { parentId: target });
      toast(`Moved “${item.name}”`, "success");
      onMoved();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Move failed", "error");
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { folder } = await api.folders.create(newName.trim(), destId ?? null);
      setNewName("");
      setCreating(false);
      setDestId(folder.id); // step into the freshly created folder
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't create folder", "error");
    } finally {
      setBusy(false);
    }
  };

  // Never allow stepping a folder into itself.
  const subfolders = (data?.folders ?? []).filter((f) => !(item.type === "folder" && f.id === item.id));
  const destName = data?.folder?.name ?? "My Drive";
  const intoSelf = item.type === "folder" && destId === item.id;

  return (
    <Modal open onClose={onClose} title={`Move “${item.name}”`} width="max-w-lg">
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-400">
        <button onClick={() => setDestId(undefined)} className="flex items-center gap-1.5 hover:text-white">
          <HardDrive className="h-4 w-4" /> My Drive
        </button>
        {data?.breadcrumbs.map((b) => (
          <span key={b.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-slate-600" />
            <button onClick={() => setDestId(b.id)} className="hover:text-white">
              {b.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-800">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : subfolders.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No subfolders here.</p>
        ) : (
          <div className="divide-y divide-ink-800">
            {subfolders.map((f) => (
              <button
                key={f.id}
                onClick={() => setDestId(f.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-800"
              >
                <FolderTile className="h-5 w-5" />
                <span className="flex-1 truncate text-sm text-slate-200">{f.name}</span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      {creating ? (
        <div className="mt-3 flex gap-2">
          <input
            className="input"
            autoFocus
            placeholder="New folder name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
          />
          <button onClick={createFolder} className="btn-outline shrink-0" disabled={busy}>
            Create
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <FolderPlus className="h-4 w-4" /> New folder here
        </button>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-slate-400">
          Into: <span className="text-slate-200">{destName}</span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={move} className="btn-primary" disabled={busy || intoSelf}>
            {busy ? <Spinner className="h-4 w-4" /> : <CornerUpRight className="h-4 w-4" />}
            Move here
          </button>
        </div>
      </div>
    </Modal>
  );
}
