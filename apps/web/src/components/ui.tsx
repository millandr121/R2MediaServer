import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-ink-950">
      <Spinner className="h-6 w-6 text-accent" />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={`card relative z-10 w-full ${width} bg-ink-900 p-5 shadow-2xl`}>
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button onClick={onClose} className="btn-ghost -mr-2 h-8 w-8 !p-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="text-slate-600">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-300">{title}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

// ---- Toasts ----------------------------------------------------------------

type ToastType = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let items: ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, type: ToastType = "info") {
  const id = ++counter;
  items = [...items, { id, message, type }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 4500);
}

const ICONS: Record<ToastType, ReactNode> = {
  info: <Info className="h-4 w-4 text-accent" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
};

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm text-slate-200 shadow-xl"
        >
          {ICONS[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
