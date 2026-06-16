import {
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  FileArchive,
  File as FileGeneric,
  Folder as FolderIcon,
} from "lucide-react";
import { fileKind, type FileKind } from "../lib/format";

const STYLES: Record<FileKind, { icon: typeof FileGeneric; color: string }> = {
  image: { icon: ImageIcon, color: "text-emerald-400" },
  video: { icon: Film, color: "text-accent" },
  audio: { icon: Music, color: "text-pink-400" },
  pdf: { icon: FileText, color: "text-red-400" },
  archive: { icon: FileArchive, color: "text-amber-400" },
  doc: { icon: FileText, color: "text-sky-400" },
  other: { icon: FileGeneric, color: "text-slate-400" },
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
  const { icon: Icon, color } = STYLES[fileKind(name, contentType)];
  return <Icon className={`${className} ${color}`} />;
}

export function FolderTile({ className = "h-7 w-7" }: { className?: string }) {
  return <FolderIcon className={`${className} text-accent`} fill="currentColor" fillOpacity={0.15} />;
}
