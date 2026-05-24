-- AC Creation CRM — tables catalogue (id + data jsonb)
-- Appliquer dans Supabase SQL Editor ou via `supabase db push`
-- Idempotent : safe to re-run

-- Pool fournisseur (Import fournisseur)
CREATE TABLE IF NOT EXISTS supplier_catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Catalogue client (articles promus depuis le pool fournisseur)
CREATE TABLE IF NOT EXISTS client_catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Alias legacy : sync aussi vers client_catalog_items (supabaseSync.js)
CREATE TABLE IF NOT EXISTS catalog_items (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Sélections partagées (shareId, snapshots produits, soumissions client)
CREATE TABLE IF NOT EXISTS catalog_selections (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE supplier_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_full_access" ON supplier_catalog_items;
CREATE POLICY "crm_full_access" ON supplier_catalog_items
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON client_catalog_items;
CREATE POLICY "crm_full_access" ON client_catalog_items
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON catalog_items;
CREATE POLICY "crm_full_access" ON catalog_items
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_full_access" ON catalog_selections;
CREATE POLICY "crm_full_access" ON catalog_selections
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
