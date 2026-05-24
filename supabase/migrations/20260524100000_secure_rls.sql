-- AC Creation CRM — durcissement RLS (authenticated uniquement)
-- À exécuter dans Supabase → SQL Editor après avoir créé les tables CRM.
-- Idempotent : safe to re-run (DROP POLICY IF EXISTS / CREATE OR REPLACE FUNCTION)

-- ---------------------------------------------------------------------------
-- Helper : utilisateur CRM actif (email JWT + statut ≠ Désactivé)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.data->>'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND coalesce(u.data->>'status', 'Actif') <> 'Désactivé'
  );
$$;

REVOKE ALL ON FUNCTION public.crm_user_is_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_is_active() TO authenticated;

-- ---------------------------------------------------------------------------
-- Supprimer les anciennes politiques permissives (anon + authenticated)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings', 'users', 'clients', 'products', 'categories',
    'suppliers', 'expenses', 'quotes', 'invoices', 'backups', 'crm_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "crm_full_access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "crm_authenticated_access" ON public.%I', tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "bank_transactions_select" ON bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_insert" ON bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_update" ON bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_delete" ON bank_transactions;
DROP POLICY IF EXISTS "bank_transactions_authenticated" ON bank_transactions;

-- ---------------------------------------------------------------------------
-- RLS CRM — authenticated + utilisateur actif dans la table users
-- Aucun accès anon (configurateur public = localStorage uniquement)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings', 'users', 'clients', 'products', 'categories',
    'suppliers', 'expenses', 'quotes', 'invoices', 'backups', 'crm_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY "crm_authenticated_access" ON public.%I
         FOR ALL TO authenticated
         USING (public.crm_user_is_active())
         WITH CHECK (public.crm_user_is_active())',
      tbl
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- RLS bank_transactions — authenticated uniquement
-- ---------------------------------------------------------------------------

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transactions_authenticated" ON bank_transactions
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

-- ---------------------------------------------------------------------------
-- Seed admins (si absents) — adapter les emails si besoin
-- Prérequis : comptes créés dans Authentication → Users avec le même email
-- ---------------------------------------------------------------------------

INSERT INTO public.users (id, data, created_at)
SELECT
  'admin-' || md5(email),
  jsonb_build_object(
    'name', name,
    'email', email,
    'role', 'Admin',
    'status', 'Actif',
    'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  now()
FROM (
  VALUES
    ('AC Creation', 'ac.creation.officiel@gmail.com'),
    ('Daniel Dos Santos', 'dos.santos.alves.daniel@gmail.com')
) AS seed(name, email)
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE lower(u.data->>'email') = lower(seed.email)
);
