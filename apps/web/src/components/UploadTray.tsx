import { useSyncExternalStore } from "react";
import { X, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { uploads, type UploadTask } from "../lib/upload";
import { formatBytes } from "../lib/format";
import { Spinner } from "./ui";

function TaskRow({ task }: { task: UploadTask }) {
  const pct = task.size ? Math.min(100, Math.round((task.uploaded / task.size) * 100)) : 0;
  const done = task.status === "done";
  const failed = task.status === "error" || task.status === "canceled";

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="shrink-0">
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : failed ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <Spinner className="h-4 w-4 text-accent" />
          )}
        </div>
        <span className="flex-1 truncate text-sm text-slate-800">{task.name}</span>
        <span className="shrink-0 text-xs text-slate-500">
          {done ? formatBytes(task.size) : `${pct}%`}
        </span>
        {!done && !failed ? (
          <button onClick={() => uploads.cancel(task.id)} className="text-slate-500 hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button onClick={() => uploads.dismiss(task.id)} className="text-slate-500 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {!done && !failed && (
        <div className="mt-1.5 ml-6 h-1 rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {task.status === "error" && <p className="ml-6 mt-1 text-xs text-red-400">{task.error}</p>}
      {task.status === "finalizing" && <p className="ml-6 mt-1 text-xs text-slate-500">Finalizing…</p>}
    </div>
  );
}

export function UploadTray() {
  const tasks = useSyncExternalStore(uploads.subscribe, uploads.getTasks, uploads.getTasks);
  if (tasks.length === 0) return null;

  const active = tasks.filter((t) => t.status === "uploading" || t.status === "finalizing").length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Upload className="h-4 w-4 text-accent" />
          {active > 0 ? `Uploading ${active} file${active > 1 ? "s" : ""}` : "Uploads"}
        </span>
        <button onClick={() => uploads.clearFinished()} className="text-xs text-slate-500 hover:text-slate-700">
          Clear
        </button>
      </div>
      <div className="max-h-72 divide-y divide-ink-800 overflow-y-auto">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
