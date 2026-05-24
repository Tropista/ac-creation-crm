-- AC Creation CRM — créer les tables catalogue manquantes
-- À exécuter une fois dans Supabase → SQL Editor
-- Idempotent : safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- Ne supprime aucune donnée existante.

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

-- ---------------------------------------------------------------------------
-- Nettoyage optionnel : catalogue interne retiré de l'application
-- (sans impact si la table n'existe pas)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "crm_full_access" ON internal_catalog_items;
DROP TABLE IF EXISTS internal_catalog_items;
