-- =============================================================================
-- Suppression des tables catalogue (module Catalogues retiré du CRM)
-- =============================================================================
-- Quand exécuter : si votre projet Supabase a encore été créé avec l'ancienne
-- migration (catalog_items, supplier_catalog_items, client_catalog_items,
-- catalog_selections).
--
-- Où : Supabase Dashboard → SQL Editor → coller ce script → Run
--
-- Idempotent : les DROP IF EXISTS peuvent être relancés sans erreur.
-- =============================================================================

DROP TABLE IF EXISTS supplier_catalog_items CASCADE;
DROP TABLE IF EXISTS client_catalog_items CASCADE;
DROP TABLE IF EXISTS catalog_items CASCADE;
DROP TABLE IF EXISTS catalog_selections CASCADE;
