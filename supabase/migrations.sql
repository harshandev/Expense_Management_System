-- ─────────────────────────────────────────────────────────────────────────
-- EMSI — Supabase Migrations
-- Run each section in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────

-- ── Migration 1 (already applied) ────────────────────────────────────────
-- Add name column to users table (for Hi [Name] personalisation)
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

-- Faster duplicate detection lookups
CREATE INDEX IF NOT EXISTS idx_transactions_dup_check
  ON transactions (user_id, merchant, amount, created_at DESC);


-- ── Migration 2 — run this now ─────────────────────────────────────────────
-- Add receipt_url column to transactions (stores uploaded receipt image URL)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;


-- ── Supabase Storage — run this now ───────────────────────────────────────
-- Creates the "receipts" public bucket for storing uploaded receipt images/PDFs

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read (so thumbnails load in the browser)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public read access for receipts'
  ) THEN
    CREATE POLICY "Public read access for receipts"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'receipts');
  END IF;
END $$;

-- Allow server-side (service role) to upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Service role upload for receipts'
  ) THEN
    CREATE POLICY "Service role upload for receipts"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'receipts');
  END IF;
END $$;
