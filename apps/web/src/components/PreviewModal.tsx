import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import type { FileItem } from "../lib/types";
import { fileKind } from "../lib/format";
import { VideoPlayer } from "./VideoPlayer";
import { Spinner } from "./ui";

interface Props {
  file: FileItem;
  /** Resolve an inline (streaming/preview) URL for the file. */
  getInlineUrl: () => Promise<string>;
  /** Resolve an attachment download URL, if downloads are allowed. */
  getDownloadUrl?: () => Promise<string>;
  onClose: () => void;
}

/** Full-screen media viewer for images, video, audio, and PDFs. */
export function PreviewModal({ file, getInlineUrl, getDownloadUrl, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = fileKind(file.name, file.contentType);

  useEffect(() => {
    let active = true;
    getInlineUrl()
      .then((u) => active && setUrl(u))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = async () => {
    if (!getDownloadUrl) return;
    const u = await getDownloadUrl();
    window.location.href = u;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 px-5 py-3 text-slate-200">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <div className="flex items-center gap-2">
          {getDownloadUrl && (
            <button onClick={download} className="btn-outline h-9">
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          <button onClick={onClose} className="btn-ghost h-9 w-9 !p-0">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !url ? (
          <Spinner className="h-7 w-7 text-accent" />
        ) : kind === "video" ? (
          <div className="w-full max-w-5xl">
            <VideoPlayer src={url} />
          </div>
        ) : kind === "image" ? (
          <img src={url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : kind === "audio" ? (
          <audio src={url} controls autoPlay className="w-full max-w-xl" />
        ) : kind === "pdf" ? (
          <iframe src={url} title={file.name} className="h-full w-full rounded-lg bg-white" />
        ) : (
          <div className="text-center">
            <p className="text-sm text-slate-400">No inline preview for this file type.</p>
            {getDownloadUrl && (
              <button onClick={download} className="btn-primary mt-4">
                <Download className="h-4 w-4" /> Download
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
