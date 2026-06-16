import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Download, Clock } from "lucide-react";
import { api } from "../lib/api";
import { Spinner, toast } from "../components/ui";
import { StoreHeader } from "../components/StoreHeader";

export function StockSuccess() {
  const [params] = useSearchParams();
  const purchaseId = params.get("purchase") ?? "";
  const [state, setState] = useState<"pending" | "paid" | "timeout" | "error">("pending");
  const [title, setTitle] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!purchaseId) {
      setState("error");
      return;
    }
    let attempts = 0;
    let timer: number;
    const poll = async () => {
      attempts++;
      try {
        const res = await api.stock.purchaseStatus(purchaseId);
        setTitle(res.title);
        if (res.status === "paid" && res.downloadToken) {
          tokenRef.current = res.downloadToken;
          setState("paid");
          return;
        }
      } catch {
        setState("error");
        return;
      }
      if (attempts >= 20) setState("timeout");
      else timer = window.setTimeout(poll, 2000);
    };
    poll();
    return () => window.clearTimeout(timer);
  }, [purchaseId]);

  const download = async () => {
    if (!tokenRef.current) return;
    try {
      const { url } = await api.stock.purchaseDownload(tokenRef.current);
      window.location.href = url;
    } catch {
      toast("Download link expired or limit reached", "error");
    }
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <StoreHeader />
      <main className="mx-auto max-w-md px-5 py-16">
        <div className="card p-8 text-center">
          {state === "pending" && (
            <>
              <Spinner className="mx-auto h-9 w-9 text-accent" />
              <h1 className="mt-4 text-lg font-semibold text-white">Confirming your payment…</h1>
              <p className="mt-1 text-sm text-slate-400">This usually takes just a few seconds.</p>
            </>
          )}
          {state === "paid" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
              <h1 className="mt-4 text-lg font-semibold text-white">Thank you!</h1>
              <p className="mt-1 text-sm text-slate-400">
                Your purchase{title ? ` of “${title}”` : ""} is complete.
              </p>
              <button onClick={download} className="btn-primary mt-6 w-full">
                <Download className="h-4 w-4" /> Download your file
              </button>
              <p className="mt-3 text-xs text-slate-500">A download link was also sent to your email.</p>
            </>
          )}
          {state === "timeout" && (
            <>
              <Clock className="mx-auto h-12 w-12 text-amber-400" />
              <h1 className="mt-4 text-lg font-semibold text-white">Payment is processing</h1>
              <p className="mt-1 text-sm text-slate-400">
                It's taking a little longer than usual. Check your email for the download link shortly.
              </p>
            </>
          )}
          {state === "error" && (
            <>
              <h1 className="text-lg font-semibold text-white">Purchase not found</h1>
              <p className="mt-1 text-sm text-slate-400">We couldn't locate this order.</p>
              <Link to="/stock" className="btn-outline mt-6">
                Back to store
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
