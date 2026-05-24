-- AC Creation CRM — créer les tables catalogue manquantes
-- À exécuter une fois dans Supabase → SQL Editor
-- Idempotent : safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- Ne supprime aucune donnée existante.
--
-- Erreur 42710 « policy already exists » : les tables et politiques existent
-- déjà — vous pouvez passer à l'import catalogue sans réexécuter ce script.

-- ---------------------------------------------------------------------------
-- Tables catalogue (id text + data jsonb + created_at)
-- Modèle identique à clients, products, etc.
-- ---------------------------------------------------------------------------

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

-- Alias legacy : sync miroir de client_catalog_items (supabaseSync.js)
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

-- ---------------------------------------------------------------------------
-- Row Level Security — même politique que les autres tables CRM
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Nettoyage optionnel : catalogue interne retiré de l'application
-- DROP POLICY sur une table absente provoque 42P01 — on vérifie d'abord.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.internal_catalog_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "crm_full_access" ON public.internal_catalog_items;
    DROP TABLE public.internal_catalog_items;
  END IF;
END $$;
