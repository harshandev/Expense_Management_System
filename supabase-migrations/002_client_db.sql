-- Run this in each CLIENT's Supabase project (not your master DB).
-- Supabase → SQL Editor → New Query → paste → Run

-- ── Users (WhatsApp senders) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Transactions (expense records) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  merchant     text NOT NULL,
  amount       numeric(12, 2) NOT NULL,
  category     text NOT NULL DEFAULT 'Other',
  subcategory  text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  confidence   numeric(4, 3) NOT NULL DEFAULT 1.0,
  currency     text NOT NULL DEFAULT 'INR',
  raw_input    text,
  receipt_url  text,
  receipt_hash text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_txn_user_id      ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_created_at   ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_category     ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_receipt_hash ON transactions(receipt_hash);

-- ── Storage bucket for receipt images ────────────────────────────────────────
-- Run this separately in Supabase → Storage → New Bucket
-- Name: receipts
-- Public: true
-- (Cannot be done via SQL — do it manually in the Supabase dashboard)
