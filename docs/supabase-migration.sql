-- AC Creation CRM — migration Supabase (paste once in SQL Editor)
-- Tables sync CRM (supabaseSync.js) + bank_transactions (Banque)
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)

-- ---------------------------------------------------------------------------
-- CRM collections (id text + data jsonb)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backups (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_logs (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Bank reconciliation (Banque.jsx, bankTransactionSync.js)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date,
  description text,
  amount numeric,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'non rapprochée',
  matched boolean DEFAULT false,
  matched_invoice text,
  matched_invoice_id text,
  matched_expense_id text,
  matched_expense_reference text,
  match_type text,
  source text NOT NULL DEFAULT 'manual',
  category text,
  reference text,
  payment_method text,
  notes text,
  external_id text,
  provider text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_invoice text,
  ADD COLUMN IF NOT EXISTS matched_invoice_id text,
  ADD COLUMN IF NOT EXISTS matched_expense_id text,
  ADD COLUMN IF NOT EXISTS matched_expense_reference text,
  ADD COLUMN IF NOT EXISTS match_type text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_external_id_unique
  ON bank_transactions (external_id);

-- matched_invoice_id must stay text (CRM invoice ids are strings, not UUIDs)

-- ---------------------------------------------------------------------------
-- Row Level Security — CRM collections
-- Politiques durcies : authenticated + utilisateur actif (voir migration RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_logs ENABLE ROW LEVEL SECURITY;

-- Pour les politiques RLS sécurisées (production), exécuter ensuite :
-- supabase/migrations/20260524100000_secure_rls.sql

-- ---------------------------------------------------------------------------
-- Row Level Security — bank_transactions
-- ---------------------------------------------------------------------------

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- Pour les politiques RLS sécurisées (production), exécuter ensuite :
-- supabase/migrations/20260524100000_secure_rls.sql

-- ---------------------------------------------------------------------------
-- Supabase Storage — bucket images produits (policies : voir migration dédiée)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ac-creation-products',
  'ac-creation-products',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Politiques Storage (authenticated + crm_user_is_active) :
-- supabase/migrations/20260524120000_product_images_storage.sql
-- À exécuter après 20260524100000_secure_rls.sql
