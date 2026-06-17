import { useEffect, useState } from "react";
import { ChevronRight, HardDrive } from "lucide-react";
import { api } from "../lib/api";
import type { FileItem, FolderContents } from "../lib/types";
import { formatBytes } from "../lib/format";
import { FileIcon, FolderTile } from "./FileIcon";
import { Modal, Spinner } from "./ui";

/** A modal that lets the admin browse their drive and pick a single file. */
export function FilePicker({
  title = "Choose a file",
  onSelect,
  onClose,
}: {
  title?: string;
  onSelect: (file: FileItem) => void;
  onClose: () => void;
}) {
  const [folderId, setFolderId] = useState<string | undefined>();
  const [data, setData] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.folders
      .contents(folderId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [folderId]);

  return (
    <Modal open onClose={onClose} title={title} width="max-w-xl">
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-400">
        <button onClick={() => setFolderId(undefined)} className="flex items-center gap-1.5 hover:text-slate-900">
          <HardDrive className="h-4 w-4" /> Drive
        </button>
        {data?.breadcrumbs.map((b) => (
          <span key={b.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-slate-600" />
            <button onClick={() => setFolderId(b.id)} className="hover:text-slate-900">
              {b.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="max-h-80 overflow-y-auto rounded-lg border border-ink-800">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : data && data.folders.length === 0 && data.files.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">This folder is empty.</p>
        ) : (
          <div className="divide-y divide-ink-800">
            {data?.folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setFolderId(f.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-800"
              >
                <FolderTile className="h-5 w-5" />
                <span className="text-sm text-slate-800">{f.name}</span>
              </button>
            ))}
            {data?.files.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(f)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-800"
              >
                <FileIcon name={f.name} contentType={f.contentType} className="h-5 w-5" />
                <span className="flex-1 truncate text-sm text-slate-800">{f.name}</span>
                <span className="text-xs text-slate-500">{formatBytes(f.size)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
