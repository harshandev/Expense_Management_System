-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add name column to users table (for Hi [Name] personalisation)
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. (Optional) Index for faster duplicate detection lookups
CREATE INDEX IF NOT EXISTS idx_transactions_dup_check
  ON transactions (user_id, merchant, amount, created_at DESC);
