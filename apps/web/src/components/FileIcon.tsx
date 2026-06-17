import { fileKind, type FileKind } from "../lib/format";

// Hand-drawn artwork for the common kinds; tidy SVG fallbacks for the rest.
const ICON_SRC: Record<FileKind, string> = {
  image: "/photo.png",
  video: "/movie.png",
  audio: "/icon-audio.svg",
  pdf: "/icon-pdf.svg",
  archive: "/icon-archive.svg",
  doc: "/icon-doc.svg",
  other: "/file1.png",
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
  return <img src={ICON_SRC[fileKind(name, contentType)]} alt="" className={`${className} object-contain`} />;
}

export function FolderTile({ className = "h-7 w-7" }: { className?: string }) {
  return <img src="/folder.png" alt="" className={`${className} object-contain`} />;
}
