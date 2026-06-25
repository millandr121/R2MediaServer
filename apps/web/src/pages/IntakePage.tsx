import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Mail, Phone, Images, ChevronDown, ChevronRight } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { IntakeSubmission, IntakeOrderLine } from "../lib/types";
import { formatDate } from "../lib/format";
import { Spinner, EmptyState, toast } from "../components/ui";

const STATUSES: IntakeSubmission["status"][] = [
  "new",
  "in_progress",
  "printed",
  "delivered",
  "cancelled",
];

const STATUS_LABEL: Record<IntakeSubmission["status"], string> = {
  new: "New",
  in_progress: "In progress",
  printed: "Printed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<IntakeSubmission["status"], string> = {
  new: "bg-accent-soft text-accent",
  in_progress: "bg-orange-soft text-orange",
  printed: "bg-purple-soft text-purple",
  delivered: "bg-lime-soft text-lime",
  cancelled: "bg-ink-800 text-slate-500",
};

function orderLines(details: IntakeSubmission["orderDetails"]): IntakeOrderLine[] {
  if (!details) return [];
  if (Array.isArray(details)) return details;
  return [];
}

function SubmissionCard({
  sub,
  onStatus,
}: {
  sub: IntakeSubmission;
  onStatus: (status: IntakeSubmission["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const lines = orderLines(sub.orderDetails);
  const hasDetails = lines.length > 0 || !!sub.message;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {hasDetails && (
              <button onClick={() => setOpen((o) => !o)} className="btn-ghost h-6 w-6 !p-0 shrink-0">
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <h3 className="truncate text-sm font-semibold text-slate-900">{sub.customerName}</h3>
            <span className="text-xs text-slate-400">{formatDate(sub.createdAt)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-xs text-slate-500">
            <a href={`mailto:${sub.customerEmail}`} className="flex items-center gap-1 hover:text-accent">
              <Mail className="h-3.5 w-3.5" /> {sub.customerEmail}
            </a>
            {sub.customerPhone && (
              <a href={`tel:${sub.customerPhone}`} className="flex items-center gap-1 hover:text-accent">
                <Phone className="h-3.5 w-3.5" /> {sub.customerPhone}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Images className="h-3.5 w-3.5" /> {sub.fileCount} photo{sub.fileCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sub.status}
            onChange={(e) => onStatus(e.target.value as IntakeSubmission["status"])}
            className={`input !w-auto !py-1 text-xs font-medium ${STATUS_STYLE[sub.status]}`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <Link to={`/drive/${sub.folderId}`} className="btn-outline h-8 text-xs">
            <Images className="h-3.5 w-3.5" /> View photos
          </Link>
        </div>
      </div>

      {open && hasDetails && (
        <div className="mt-3 ml-8 space-y-3 border-t border-ink-700 pt-3">
          {lines.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-1 pr-4 font-medium">Size</th>
                  <th className="pb-1 pr-4 font-medium">Qty</th>
                  <th className="pb-1 pr-4 font-medium">Paper</th>
                  <th className="pb-1 pr-4 font-medium">Finish</th>
                  <th className="pb-1 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-ink-800">
                    <td className="py-1 pr-4">{l.size ?? "—"}</td>
                    <td className="py-1 pr-4">{l.qty ?? "—"}</td>
                    <td className="py-1 pr-4">{l.paper ?? "—"}</td>
                    <td className="py-1 pr-4">{l.finish ?? "—"}</td>
                    <td className="py-1">{l.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sub.message && (
            <p className="whitespace-pre-wrap rounded-lg bg-ink-850 p-3 text-xs text-slate-600">
              {sub.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function IntakePage() {
  const [subs, setSubs] = useState<IntakeSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.intake
      .list()
      .then((r) => setSubs(r.submissions))
      .catch((err) => toast(err instanceof ApiError ? err.message : "Failed to load", "error"))
      .finally(() => setLoading(false));
  }, []);

  const setStatus = async (id: string, status: IntakeSubmission["status"]) => {
    const prev = subs;
    setSubs((s) => s.map((x) => (x.id === id ? { ...x, status } : x))); // optimistic
    try {
      await api.intake.setStatus(id, status);
    } catch (err) {
      setSubs(prev); // revert
      toast(err instanceof ApiError ? err.message : "Update failed", "error");
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <Inbox className="h-6 w-6 text-accent" />
        <h1 className="font-display text-2xl font-bold text-slate-900">Intake</h1>
        {!loading && subs.length > 0 && (
          <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-medium text-slate-500">
            {subs.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-7 w-7 text-accent" />
        </div>
      ) : subs.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-12 w-12" />}
          title="No submissions yet"
          hint="Customer photo orders from your website will appear here, organized by customer."
        />
      ) : (
        <div className="space-y-3">
          {subs.map((sub) => (
            <SubmissionCard key={sub.id} sub={sub} onStatus={(s) => setStatus(sub.id, s)} />
          ))}
        </div>
      )}
    </div>
  );
}
