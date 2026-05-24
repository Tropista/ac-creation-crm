-- Suppression complète des tables catalogue (module Catalogues retiré du CRM).
-- Exécuter dans le SQL Editor Supabase après déploiement de la version sans catalogues.

DROP TABLE IF EXISTS supplier_catalog_items CASCADE;
DROP TABLE IF EXISTS client_catalog_items CASCADE;
DROP TABLE IF EXISTS catalog_items CASCADE;
DROP TABLE IF EXISTS catalog_selections CASCADE;
