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
