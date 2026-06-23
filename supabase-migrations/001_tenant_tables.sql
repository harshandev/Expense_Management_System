-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- These tables live in YOUR master Supabase project — not client Supabase projects.

-- ── Tenants (one row per client company) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text UNIQUE NOT NULL,
  tier                 text NOT NULL DEFAULT 'basic'
                         CHECK (tier IN ('basic', 'growth', 'business', 'enterprise')),
  supabase_url         text NOT NULL,
  supabase_anon_key    text NOT NULL,
  supabase_service_key text NOT NULL,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Dashboard users (admin + viewer roles) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('admin', 'viewer')),
  name          text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,          -- scrypt: "salt:hash"
  session_token text,                   -- current valid session (1-device lock)
  last_active   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- ── Allowed WhatsApp numbers per tenant ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_whatsapp_numbers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone       text NOT NULL,            -- digits only, e.g. "919876543210"
  label       text,                     -- friendly name, e.g. "Kishore"
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant   ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_wa_tenant      ON tenant_whatsapp_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_wa_phone       ON tenant_whatsapp_numbers(phone);
CREATE INDEX IF NOT EXISTS idx_tenants_slug          ON tenants(slug);
