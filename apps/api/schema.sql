-- R2 Media Server — D1 (SQLite) schema
-- Apply with: npm run db:apply:local  (or :remote for production)
--
-- R2 is a flat key/value store; this database is the "map" that turns raw
-- object keys into folders, files, share links, and stock listings.

PRAGMA foreign_keys = ON;

------------------------------------------------------------------------------
-- Users: admins (you) and optional client accounts.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                              -- PBKDF2; null = link-only client
  role          TEXT NOT NULL DEFAULT 'client',    -- 'admin' | 'client'
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

------------------------------------------------------------------------------
-- Folders: virtual hierarchy (R2 has none). Materialized `path` for fast keys.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT,                                 -- null = root
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,                         -- e.g. 'clients/smith-wedding'
  owner_id   TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'personal',      -- 'personal' | 'client' | 'stock'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);

------------------------------------------------------------------------------
-- Files: one row per object in R2. `status` tracks the presigned upload flow.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  folder_id    TEXT,                                -- null = root
  name         TEXT NOT NULL,
  r2_key       TEXT NOT NULL UNIQUE,                -- actual object key in R2
  size         INTEGER NOT NULL DEFAULT 0,
  content_type TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'ready'
  owner_id     TEXT NOT NULL,
  upload_id    TEXT,                                -- S3 multipart UploadId (while pending)
  width        INTEGER,
  height       INTEGER,
  duration     REAL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);

------------------------------------------------------------------------------
-- Shares: public links to a file or folder, with expiry / password / quota.
-- `id` doubles as the public, unguessable token used in the share URL.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shares (
  id             TEXT PRIMARY KEY,                  -- public token
  resource_type TEXT NOT NULL,                      -- 'file' | 'folder'
  resource_id   TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  label         TEXT,
  password_hash TEXT,                               -- optional PBKDF2
  expires_at    INTEGER,                            -- null = never
  max_downloads INTEGER,                            -- null = unlimited
  download_count INTEGER NOT NULL DEFAULT 0,
  allow_upload  INTEGER NOT NULL DEFAULT 0,         -- 0/1 client drop-box
  revoked       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_creator ON shares(created_by);

------------------------------------------------------------------------------
-- Stock items: sellable footage. Master file is gated; preview is watermarked.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_items (
  id            TEXT PRIMARY KEY,
  file_id       TEXT NOT NULL,                      -- the clean master file
  preview_key   TEXT,                               -- watermarked preview object
  thumbnail_key TEXT,
  title         TEXT NOT NULL,
  description   TEXT,
  price_cents   INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'usd',
  tags          TEXT,                               -- JSON array of strings
  published     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_published ON stock_items(published);

------------------------------------------------------------------------------
-- Purchases: a paid license + metered download token tied to a stock item.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id                    TEXT PRIMARY KEY,
  stock_item_id         TEXT NOT NULL,
  buyer_email           TEXT NOT NULL,
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  amount_cents          INTEGER NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'usd',
  status                TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'paid'|'refunded'
  download_token        TEXT UNIQUE,                -- metered download token
  max_downloads         INTEGER NOT NULL DEFAULT 5,
  download_count        INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_purchases_token ON purchases(download_token);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe ON purchases(stripe_session_id);

------------------------------------------------------------------------------
-- Audit log: lightweight security trail for sensitive actions.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor      TEXT,
  action     TEXT NOT NULL,
  resource   TEXT,
  ip         TEXT,
  meta       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
