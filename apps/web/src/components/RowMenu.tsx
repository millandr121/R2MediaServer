import { useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";

export interface MenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** A kebab button that opens a small action menu with click-away dismissal. */
export function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-ink-700 hover:text-slate-900"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-xl">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  a.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  a.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-slate-700 hover:bg-ink-800 hover:text-slate-900"
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
