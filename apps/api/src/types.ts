import type { Context } from "hono";

/** Cloudflare bindings + environment configuration available to the Worker. */
export interface Env {
  // Bindings
  DB: D1Database;
  SESSIONS: KVNamespace;
  BUCKET: R2Bucket;

  // Public vars (wrangler.toml [vars])
  ALLOWED_ORIGINS: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  PUBLIC_APP_URL: string;

  // Secrets (wrangler secret put / .dev.vars)
  JWT_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;

  // Optional / phase 2
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

/** Authenticated principal attached to the request context after auth. */
export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "client";
  displayName: string | null;
}

/** Variables stored on the Hono context. */
export interface Variables {
  user: AuthUser;
}

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

export type AppEnv = { Bindings: Env; Variables: Variables };

// ---- Database row shapes ----------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  role: "admin" | "client";
  display_name: string | null;
  created_at: number;
  updated_at: number;
}

export interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  path: string;
  owner_id: string;
  kind: "personal" | "client" | "stock";
  created_at: number;
  updated_at: number;
}

export interface FileRow {
  id: string;
  folder_id: string | null;
  name: string;
  r2_key: string;
  size: number;
  content_type: string | null;
  status: "pending" | "ready";
  owner_id: string;
  upload_id: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  created_at: number;
  updated_at: number;
}

export interface ShareRow {
  id: string;
  resource_type: "file" | "folder";
  resource_id: string;
  created_by: string;
  label: string | null;
  password_hash: string | null;
  expires_at: number | null;
  max_downloads: number | null;
  download_count: number;
  allow_upload: number;
  revoked: number;
  created_at: number;
}

export interface StockItemRow {
  id: string;
  file_id: string;
  preview_key: string | null;
  thumbnail_key: string | null;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  tags: string | null;
  published: number;
  created_at: number;
  updated_at: number;
}

export interface PurchaseRow {
  id: string;
  stock_item_id: string;
  buyer_email: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "refunded";
  download_token: string | null;
  max_downloads: number;
  download_count: number;
  created_at: number;
}
