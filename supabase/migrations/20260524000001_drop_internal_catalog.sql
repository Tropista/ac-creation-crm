-- Suppression du catalogue interne (retiré de l'application)
-- Idempotent : safe to re-run (DROP POLICY exige que la table existe)

DO $$
BEGIN
  IF to_regclass('public.internal_catalog_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "crm_full_access" ON public.internal_catalog_items;
    DROP TABLE public.internal_catalog_items;
  END IF;
END $$;
