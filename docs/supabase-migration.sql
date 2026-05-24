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
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_invoice text,
  ADD COLUMN IF NOT EXISTS matched_invoice_id text;

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
