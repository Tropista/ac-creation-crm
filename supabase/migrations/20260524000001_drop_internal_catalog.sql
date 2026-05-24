-- Suppression du catalogue interne (retiré de l'application)
-- Idempotent : safe to re-run

DROP POLICY IF EXISTS "crm_full_access" ON internal_catalog_items;
DROP TABLE IF EXISTS internal_catalog_items;
