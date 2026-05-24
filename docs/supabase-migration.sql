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

CREATE TABLE IF NOT EXISTS catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_selections (
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
-- Restrict anon/authenticated in production as needed.
-- ---------------------------------------------------------------------------

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_full_access" ON settings;
CREATE POLICY "crm_full_access" ON settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON users;
CREATE POLICY "crm_full_access" ON users
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON clients;
CREATE POLICY "crm_full_access" ON clients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON products;
CREATE POLICY "crm_full_access" ON products
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON categories;
CREATE POLICY "crm_full_access" ON categories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON public.catalog_items;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND policyname = 'crm_full_access'
  ) THEN
    CREATE POLICY "crm_full_access" ON public.catalog_items
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "crm_full_access" ON public.supplier_catalog_items;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'supplier_catalog_items'
      AND policyname = 'crm_full_access'
  ) THEN
    CREATE POLICY "crm_full_access" ON public.supplier_catalog_items
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "crm_full_access" ON public.client_catalog_items;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_catalog_items'
      AND policyname = 'crm_full_access'
  ) THEN
    CREATE POLICY "crm_full_access" ON public.client_catalog_items
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "crm_full_access" ON public.catalog_selections;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_selections'
      AND policyname = 'crm_full_access'
  ) THEN
    CREATE POLICY "crm_full_access" ON public.catalog_selections
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP POLICY IF EXISTS "crm_full_access" ON suppliers;
CREATE POLICY "crm_full_access" ON suppliers
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON expenses;
CREATE POLICY "crm_full_access" ON expenses
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON quotes;
CREATE POLICY "crm_full_access" ON quotes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON invoices;
CREATE POLICY "crm_full_access" ON invoices
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON backups;
CREATE POLICY "crm_full_access" ON backups
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON crm_logs;
CREATE POLICY "crm_full_access" ON crm_logs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Row Level Security — bank_transactions
-- ---------------------------------------------------------------------------

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_transactions_select" ON bank_transactions;
CREATE POLICY "bank_transactions_select" ON bank_transactions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "bank_transactions_insert" ON bank_transactions;
CREATE POLICY "bank_transactions_insert" ON bank_transactions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bank_transactions_update" ON bank_transactions;
CREATE POLICY "bank_transactions_update" ON bank_transactions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bank_transactions_delete" ON bank_transactions;
CREATE POLICY "bank_transactions_delete" ON bank_transactions
  FOR DELETE TO anon, authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Index pagination catalogue (ORDER BY created_at, id — évite statement timeout)
-- Voir aussi supabase/migrations/20260524100000_catalog_fetch_indexes.sql
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_items_created_at_id
  ON public.supplier_catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_client_catalog_items_created_at_id
  ON public.client_catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_catalog_items_created_at_id
  ON public.catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_catalog_selections_created_at_id
  ON public.catalog_selections (created_at ASC NULLS FIRST, id ASC);
