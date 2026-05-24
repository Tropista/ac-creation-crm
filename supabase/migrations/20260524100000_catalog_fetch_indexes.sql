-- AC Creation CRM — index pour accélérer la pagination catalogue (ORDER BY created_at, id)
-- Exécuter dans Supabase SQL Editor si les chargements catalogue expirent (statement timeout).
-- Idempotent : safe to re-run

CREATE INDEX IF NOT EXISTS idx_supplier_catalog_items_created_at_id
  ON public.supplier_catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_client_catalog_items_created_at_id
  ON public.client_catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_catalog_items_created_at_id
  ON public.catalog_items (created_at ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS idx_catalog_selections_created_at_id
  ON public.catalog_selections (created_at ASC NULLS FIRST, id ASC);
