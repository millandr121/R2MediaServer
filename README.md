# Vault — Self-Hosted Media Server on Cloudflare R2

A private, Google-Drive-style media platform you fully own — built entirely on
Cloudflare's edge stack. One clean interface for three jobs:

1. **Personal drive** — upload, organize, preview, and download your own files.
2. **Client delivery** — share folders or single files via secure links with
   expiry, passwords, download limits, and an optional client drop-box.
3. **Stock footage sales** — a storefront with watermarked previews, Stripe
   checkout, and metered download links for the clean masters.

The defining feature is **zero-egress delivery**: files move directly between
the browser and R2's edge using presigned URLs. The Worker never touches the
bytes, so even a 50 GB upload costs almost nothing in compute — and R2 charges
**$0 for egress** when clients download.

```
┌──────────┐   1. ask for upload URL   ┌─────────────────┐
│          │ ────────────────────────▶ │  Worker (Hono)  │  ── D1 (metadata)
│ Browser  │   2. presigned PUT URL    │   the gatekeeper │  ── KV (sessions)
│  (React) │ ◀──────────────────────── │                 │
│          │                           └─────────────────┘
│          │   3. PUT bytes DIRECTLY to R2 (bypasses Worker)
│          │ ════════════════════════════════════════════▶  ┌─────────┐
└──────────┘                                                 │   R2    │
                                                             └─────────┘
```

## Tech stack

| Layer            | Technology                          | Free tier |
| ---------------- | ----------------------------------- | --------- |
| Storage          | Cloudflare **R2**                   | 10 GB + zero egress |
| Backend API      | Cloudflare **Workers** + Hono       | 100k req/day |
| Database         | Cloudflare **D1** (SQLite at edge)  | 5 GB |
| Sessions         | Cloudflare **Workers KV**           | 100k reads/day |
| Frontend         | **Vite + React + TypeScript + Tailwind**, served by the Worker | Free |
| Payments         | **Stripe** (optional)               | pay per sale |

## Repository layout

```
apps/
├── api/                 Cloudflare Worker (the backend / gatekeeper)
│   ├── src/
│   │   ├── index.ts     App entry: CORS, routing, error handling
│   │   ├── routes/      auth, folders, files, shares, publicShares, stock
│   │   ├── lib/         crypto, jwt/auth, r2 presigning, stripe, shares
│   │   └── middleware/  requireAuth / requireAdmin
│   ├── schema.sql       D1 schema
│   ├── wrangler.toml    Bindings + config
│   └── r2-cors.json     CORS policy for the bucket (see below)
└── web/                 Vite + React frontend (built to dist/, served by the Worker)
    └── src/
        ├── lib/         api client, auth context, upload manager
        ├── components/  layout, player, modals, upload tray
        └── pages/       Login, Drive, Shares, Store, PublicShare, …
```

---

## Local development

Requires Node 20+ and a Cloudflare account.

```bash
npm install
```

### 1. Create the Cloudflare resources

```bash
cd apps/api
npx wrangler login
npx wrangler r2 bucket create r2-media-server
npx wrangler d1 create r2-media-server          # copy the database_id
npx wrangler kv namespace create SESSIONS       # copy the id
```

Paste the returned `database_id` and KV `id` into `apps/api/wrangler.toml`, and
set `R2_ACCOUNT_ID` (the hex string from your R2 S3 endpoint).

### 2. Create R2 S3 API credentials

In the Cloudflare dashboard: **R2 → Manage R2 API Tokens → Create API Token**
(Object Read & Write). These are used to *sign* presigned URLs.

Copy `apps/api/.dev.vars.example` → `apps/api/.dev.vars` and fill in:

```
JWT_SECRET="<a long random string>"
R2_ACCESS_KEY_ID="<from the R2 API token>"
R2_SECRET_ACCESS_KEY="<from the R2 API token>"
```

### 3. Apply the database schema

```bash
npm run db:apply:local --workspace apps/api      # local dev DB
```

### 4. Configure the bucket's CORS (required for direct browser uploads)

Direct browser → R2 uploads need a CORS policy on the bucket. Multipart uploads
additionally need the **ETag** response header exposed. Edit
`apps/api/r2-cors.json` with your domains, then apply it (dashboard: **R2 →
your bucket → Settings → CORS Policy**, or via wrangler):

```bash
npx wrangler r2 bucket cors put r2-media-server --file ./r2-cors.json
```

### 5. Run both apps

```bash
# terminal 1 — the Worker API on :8787
npm run dev:api

# terminal 2 — the Vite UI on :5173 (proxies /api to the Worker)
npm run dev:web
```

Open http://localhost:5173 — the first visit shows a one-time **admin setup**
screen. After that you're in your drive.

---

## Production deployment

The whole app ships as **one Worker**: it serves the API under `/api/*` and the
built React site (from the `[assets]` binding) for every other path. One domain,
no CORS, no separate Pages project.

### Continuous deployment (Git integration)

Connect this repo to the Worker (Workers & Pages → your Worker → **Build**) with:

- **Root directory:** `/` (repo root — needed so both workspaces install)
- **Build command:** `npm run build` (builds `apps/web` → `apps/web/dist`, then type-checks the API)
- **Deploy command:** `npx wrangler deploy --config apps/api/wrangler.toml`
- **Version command:** `npx wrangler versions upload --config apps/api/wrangler.toml`

The site is same-origin with the API, so **leave `VITE_API_URL` unset** — the
client calls `/api/...` on whatever domain serves the page.

### One-time setup (dashboard or CLI)

```bash
cd apps/api
# set production secrets (do NOT put these in wrangler.toml)
npx wrangler secret put JWT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
# apply schema to the remote D1
npm run db:apply:remote
```

In `wrangler.toml`, set `PUBLIC_APP_URL` to your site's domain (used to build
share links). Attach your custom domain (e.g. `drive.example.com`) to the
**Worker** under Settings → Domains & Routes.

### Cookie / domain note (security)

The refresh session is an **httpOnly** cookie. Because the API and UI are served
from the same origin, the cookie is first-party and flows reliably. The Worker
sets `SameSite=None; Secure` over HTTPS. Add your site origin to the R2 CORS
policy (`r2-cors.json`) so direct browser → R2 uploads/downloads are allowed.

---

## Stripe (optional — for stock sales)

Stock browsing works without Stripe; checkout needs it.

```bash
cd apps/api
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Add a webhook endpoint in the Stripe dashboard pointing at
`https://<your-worker>/api/stock/webhook` for the `checkout.session.completed`
event. The Worker verifies the signature, marks the purchase paid, and issues a
metered download token.

---

## Security model

- **Admin auth** — PBKDF2-hashed passwords, short-lived JWT access tokens
  (15 min) held in memory, long-lived refresh sessions in KV behind an httpOnly
  cookie. Bootstrap endpoint self-disables once an admin exists.
- **Share links** — unguessable random tokens; optional PBKDF2 password
  (exchanged for a short-lived unlock token), expiry, and download metering.
- **Stock downloads** — tied to a paid purchase record with a metered,
  short-expiry presigned URL.
- **R2 is fully private** — nothing is public; every byte is reached only
  through a URL the Worker explicitly signs.

## Roadmap / nice-to-haves

- Resumable multipart uploads (persist part progress across reloads)
- Server-side thumbnail/preview generation (Cloudflare Images / Media
  Transformations) and automatic watermarking for stock previews
- Optional Cloudflare Stream integration for adaptive video playback
- Multi-user client accounts with scoped folders
