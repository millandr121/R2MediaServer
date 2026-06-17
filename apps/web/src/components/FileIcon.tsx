import { fileKind, type FileKind } from "../lib/format";

const ICON_SRC: Record<FileKind, string> = {
  image: "/icon-image.svg",
  video: "/icon-video.svg",
  audio: "/icon-audio.svg",
  pdf: "/icon-pdf.svg",
  archive: "/icon-archive.svg",
  doc: "/icon-doc.svg",
  other: "/icon-file.svg",
};

export function FileIcon({
  name,
  contentType,
  className = "h-7 w-7",
}: {
  name: string;
  contentType: string | null;
  className?: string;
}) {
  const src = ICON_SRC[fileKind(name, contentType)];
  return <img src={src} alt="" className={`${className} object-contain`} />;
}

export function FolderTile({ className = "h-7 w-7" }: { className?: string }) {
  return <img src="/icon-folder.svg" alt="" className={`${className} object-contain`} />;
}
