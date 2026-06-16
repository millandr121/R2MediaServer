import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Film, ShoppingCart } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { StockItem } from "../lib/types";
import { formatPrice } from "../lib/format";
import { VideoPlayer } from "../components/VideoPlayer";
import { Spinner, toast } from "../components/ui";
import { StoreHeader } from "../components/StoreHeader";

export function StockDetail() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<StockItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    api.stock
      .get(id)
      .then((r) => setItem(r.item))
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  const buy = async () => {
    if (!email) {
      toast("Enter your email to receive the download", "error");
      return;
    }
    setBuying(true);
    try {
      const { url } = await api.stock.checkout(id, email);
      window.location.href = url;
    } catch (err) {
      if (err instanceof ApiError && err.code === "stripe_unconfigured") {
        toast("Checkout isn't enabled yet — add a Stripe key to go live.", "error");
      } else {
        toast(err instanceof ApiError ? err.message : "Checkout failed", "error");
      }
      setBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <StoreHeader />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <Link to="/stock" className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-7 w-7 text-accent" />
          </div>
        ) : !item ? (
          <p className="py-24 text-center text-slate-400">This item is no longer available.</p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            <div>
              {item.previewUrl ? (
                <VideoPlayer src={item.previewUrl} poster={item.thumbnailUrl ?? undefined} />
              ) : item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt={item.title} className="w-full rounded-xl" />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-xl bg-ink-800">
                  <Film className="h-12 w-12 text-slate-600" />
                </div>
              )}
              {item.previewUrl && (
                <p className="mt-2 text-xs text-slate-500">Preview may be watermarked. Purchase unlocks the clean master file.</p>
              )}
            </div>

            <div>
              <h1 className="text-xl font-semibold text-slate-900">{item.title}</h1>
              <p className="mt-2 text-2xl font-semibold text-accent">
                {formatPrice(item.priceCents, item.currency)}
              </p>
              {item.description && <p className="mt-4 text-sm leading-relaxed text-slate-700">{item.description}</p>}
              {item.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <span key={t} className="rounded bg-ink-800 px-2 py-0.5 text-xs text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-6 space-y-3 border-t border-ink-800 pt-6">
                <div>
                  <label className="label">Email for delivery</label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <button onClick={buy} className="btn-primary w-full" disabled={buying}>
                  {buying ? <Spinner className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  Buy & download
                </button>
                <p className="text-center text-xs text-slate-500">Secure checkout via Stripe</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
