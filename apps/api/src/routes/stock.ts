import { Hono, type Context } from "hono";
import type { AppEnv, StockItemRow, FileRow, PurchaseRow } from "../types";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { badRequest, notFound, gone, fail } from "../lib/http";
import { newId, randomToken, now } from "../lib/id";
import { toStockDTO } from "../lib/dto";
import { presignDownload } from "../lib/r2";
import { stripeConfigured, createCheckoutSession, verifyWebhook } from "../lib/stripe";

const stock = new Hono<AppEnv>();

async function resolveKey(c: Context<AppEnv>, fileId: unknown, userId: string): Promise<string | null> {
  if (typeof fileId !== "string" || !fileId) return null;
  const row = await c.env.DB.prepare("SELECT r2_key FROM files WHERE id = ? AND owner_id = ?")
    .bind(fileId, userId)
    .first<{ r2_key: string }>();
  return row?.r2_key ?? null;
}

// ---- Stripe webhook (must be registered before "/:id") ---------------------

stock.post("/webhook", async (c) => {
  const sig = c.req.header("stripe-signature") ?? "";
  const raw = await c.req.text();
  let event: any;
  try {
    event = await verifyWebhook(c.env, raw, sig);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const purchaseId = session.metadata?.purchaseId;
    if (purchaseId) {
      const purchase = await c.env.DB.prepare("SELECT * FROM purchases WHERE id = ? AND status = 'pending'")
        .bind(purchaseId)
        .first<PurchaseRow>();
      if (purchase) {
        await c.env.DB.prepare(
          `UPDATE purchases SET status = 'paid', download_token = ?, stripe_payment_intent = ?,
             amount_cents = ? WHERE id = ?`,
        )
          .bind(randomToken(32), session.payment_intent ?? null, session.amount_total ?? purchase.amount_cents, purchaseId)
          .run();
      }
    }
  }
  return c.json({ received: true });
});

// ---- Purchase status + download (token-based, metered) ---------------------

/** Poll purchase status after the Stripe redirect; reveals the token once paid. */
stock.get("/purchases/:id/status", async (c) => {
  const purchase = await c.env.DB.prepare("SELECT * FROM purchases WHERE id = ?")
    .bind(c.req.param("id"))
    .first<PurchaseRow>();
  if (!purchase) return notFound("Purchase not found");
  const item = await c.env.DB.prepare("SELECT title FROM stock_items WHERE id = ?")
    .bind(purchase.stock_item_id)
    .first<{ title: string }>();
  return c.json({
    status: purchase.status,
    title: item?.title ?? null,
    downloadToken: purchase.status === "paid" ? purchase.download_token : null,
  });
});

stock.get("/purchases/:token/download", async (c) => {
  const purchase = await c.env.DB.prepare(
    "SELECT * FROM purchases WHERE download_token = ? AND status = 'paid'",
  )
    .bind(c.req.param("token"))
    .first<PurchaseRow>();
  if (!purchase) return notFound("Purchase not found");
  if (purchase.download_count >= purchase.max_downloads) return gone("Download limit reached");

  const item = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ?")
    .bind(purchase.stock_item_id)
    .first<StockItemRow>();
  if (!item) return notFound("Item no longer available");
  const master = await c.env.DB.prepare("SELECT * FROM files WHERE id = ?")
    .bind(item.file_id)
    .first<FileRow>();
  if (!master) return notFound("Master file no longer available");

  await c.env.DB.prepare("UPDATE purchases SET download_count = download_count + 1 WHERE id = ?")
    .bind(purchase.id)
    .run();
  const url = await presignDownload(c.env, master.r2_key, { downloadName: master.name, expires: 15 * 60 });
  return c.json({ url, downloadsRemaining: purchase.max_downloads - purchase.download_count - 1 });
});

// ---- Public storefront -----------------------------------------------------

/** Build inline preview/thumbnail URLs for a stock item. */
async function withMedia(c: Context<AppEnv>, item: StockItemRow) {
  const dto = toStockDTO(item);
  const [previewUrl, thumbnailUrl] = await Promise.all([
    item.preview_key ? presignDownload(c.env, item.preview_key, { inline: true }) : Promise.resolve(null),
    item.thumbnail_key ? presignDownload(c.env, item.thumbnail_key, { inline: true }) : Promise.resolve(null),
  ]);
  return { ...dto, previewUrl, thumbnailUrl };
}

stock.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM stock_items WHERE published = 1 ORDER BY created_at DESC",
  ).all<StockItemRow>();
  const items = await Promise.all(rows.results.map((r) => withMedia(c, r)));
  return c.json({ items });
});

// ---- Admin management ------------------------------------------------------

stock.get("/admin/all", requireAuth, requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM stock_items ORDER BY created_at DESC").all<StockItemRow>();
  const items = await Promise.all(rows.results.map((r) => withMedia(c, r)));
  return c.json({ items });
});

stock.post("/", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return badRequest("Title is required");

  const masterKey = await resolveKey(c, body.fileId, user.id);
  if (!masterKey) return badRequest("A valid master fileId is required");
  const previewKey = await resolveKey(c, body.previewFileId, user.id);
  const thumbnailKey = await resolveKey(c, body.thumbnailFileId, user.id);

  const id = newId("stk_");
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO stock_items (id, file_id, preview_key, thumbnail_key, title, description,
       price_cents, currency, tags, published, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.fileId,
      previewKey,
      thumbnailKey,
      title,
      typeof body.description === "string" ? body.description : null,
      Math.max(0, Math.floor(Number(body.priceCents ?? 0))),
      typeof body.currency === "string" ? body.currency.toLowerCase() : "usd",
      Array.isArray(body.tags) ? JSON.stringify(body.tags.slice(0, 30)) : null,
      body.published ? 1 : 0,
      ts,
      ts,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ?").bind(id).first<StockItemRow>();
  return c.json({ item: toStockDTO(row!) }, 201);
});

stock.patch("/:id", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ?").bind(id).first<StockItemRow>();
  if (!existing) return notFound("Stock item not found");
  const body = await c.req.json().catch(() => ({}));

  const previewKey =
    typeof body.previewFileId !== "undefined" ? await resolveKey(c, body.previewFileId, user.id) : existing.preview_key;
  const thumbnailKey =
    typeof body.thumbnailFileId !== "undefined" ? await resolveKey(c, body.thumbnailFileId, user.id) : existing.thumbnail_key;

  await c.env.DB.prepare(
    `UPDATE stock_items SET title = ?, description = ?, price_cents = ?, currency = ?, tags = ?,
       preview_key = ?, thumbnail_key = ?, published = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title,
      typeof body.description === "string" ? body.description : existing.description,
      typeof body.priceCents !== "undefined" ? Math.max(0, Math.floor(Number(body.priceCents))) : existing.price_cents,
      typeof body.currency === "string" ? body.currency.toLowerCase() : existing.currency,
      Array.isArray(body.tags) ? JSON.stringify(body.tags.slice(0, 30)) : existing.tags,
      previewKey,
      thumbnailKey,
      typeof body.published !== "undefined" ? (body.published ? 1 : 0) : existing.published,
      now(),
      id,
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ?").bind(id).first<StockItemRow>();
  return c.json({ item: toStockDTO(row!) });
});

stock.delete("/:id", requireAuth, requireAdmin, async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM stock_items WHERE id = ?").bind(c.req.param("id")).run();
  if (!res.meta.changes) return notFound("Stock item not found");
  return c.json({ ok: true });
});

// ---- Public item detail + checkout (registered after admin/static paths) ---

stock.get("/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ? AND published = 1")
    .bind(c.req.param("id"))
    .first<StockItemRow>();
  if (!row) return notFound("Stock item not found");
  return c.json({ item: await withMedia(c, row) });
});

/** Start a Stripe Checkout for a stock item. */
stock.post("/:id/checkout", async (c) => {
  if (!stripeConfigured(c.env)) {
    return fail(501, "Payments are not configured yet. Set STRIPE_SECRET_KEY to enable checkout.", "stripe_unconfigured");
  }
  const item = await c.env.DB.prepare("SELECT * FROM stock_items WHERE id = ? AND published = 1")
    .bind(c.req.param("id"))
    .first<StockItemRow>();
  if (!item) return notFound("Stock item not found");

  const body = await c.req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : undefined;

  const purchaseId = newId("pur_");
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, stock_item_id, buyer_email, amount_cents, currency, status, max_downloads, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 5, ?)`,
  )
    .bind(purchaseId, item.id, email ?? "", item.price_cents, item.currency, now())
    .run();

  const appUrl = c.env.PUBLIC_APP_URL.replace(/\/$/, "");
  const session = await createCheckoutSession(c.env, {
    priceCents: item.price_cents,
    currency: item.currency,
    productName: item.title,
    successUrl: `${appUrl}/stock/success?purchase=${purchaseId}`,
    cancelUrl: `${appUrl}/stock/${item.id}`,
    customerEmail: email,
    metadata: { purchaseId },
  });

  await c.env.DB.prepare("UPDATE purchases SET stripe_session_id = ? WHERE id = ?")
    .bind(session.id, purchaseId)
    .run();
  return c.json({ url: session.url });
});

export default stock;
