import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Film, ShoppingBag } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { StockItem } from "../lib/types";
import { formatPrice } from "../lib/format";
import { Spinner, EmptyState, toast } from "../components/ui";
import { StoreHeader } from "../components/StoreHeader";

export function StorePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock
      .list()
      .then((r) => setItems(r.items))
      .catch((err) => toast(err instanceof ApiError ? err.message : "Failed to load store", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-ink-950">
      <StoreHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Stock Footage</h1>
          <p className="mt-1 text-slate-400">Premium clips, licensed for your projects.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-7 w-7 text-accent" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="h-12 w-12" />} title="No items for sale yet" hint="Check back soon." />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/stock/${item.id}`}
                className="card group overflow-hidden transition-colors hover:border-ink-600"
              >
                <div className="relative aspect-video overflow-hidden bg-ink-800">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Film className="h-10 w-10 text-slate-600" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                    {formatPrice(item.priceCents, item.currency)}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="truncate font-medium text-slate-900">{item.title}</h3>
                  {item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.tags.slice(0, 3).map((t) => (
                        <span key={t} className="rounded bg-ink-800 px-2 py-0.5 text-[11px] text-slate-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
