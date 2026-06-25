-- Migration: print-house photo intake submissions.
-- Apply to the live database with:
--   wrangler d1 execute r2-media-server --remote --file=./migrations/0001_intake_submissions.sql
-- (or paste into the D1 console). Safe to run more than once.

CREATE TABLE IF NOT EXISTS intake_submissions (
  id             TEXT PRIMARY KEY,
  folder_id      TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  order_details  TEXT,
  message        TEXT,
  status         TEXT NOT NULL DEFAULT 'new',
  file_count     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_intake_status ON intake_submissions(status);
CREATE INDEX IF NOT EXISTS idx_intake_created ON intake_submissions(created_at);
