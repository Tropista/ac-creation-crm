-- AC Creation CRM — filaments & mouvements stock 3D
-- Idempotent : safe to re-run

CREATE TABLE IF NOT EXISTS public.filaments (
  id text PRIMARY KEY,
  name text NOT NULL,
  brand text,
  material text,
  color text,
  diameter numeric DEFAULT 1.75,
  spool_weight_full_g numeric NOT NULL DEFAULT 1000, -- net filament neuf (sans bobine vide)
  spool_weight_empty_g numeric NOT NULL DEFAULT 0, -- bobine vide seule (référence balance, non soustrait)
  remaining_weight_g numeric NOT NULL DEFAULT 0,
  purchase_price numeric NOT NULL DEFAULT 0,
  price_per_gram numeric NOT NULL DEFAULT 0,
  supplier text,
  storage_location text,
  alert_threshold_g numeric NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.filament_movements (
  id text PRIMARY KEY,
  filament_id text NOT NULL REFERENCES public.filaments(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('add', 'use', 'correction')),
  quantity_g numeric NOT NULL DEFAULT 0,
  reason text,
  print_job_name text,
  related_document_id text,
  material_cost numeric,
  stock_after_g numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS filament_movements_filament_id_idx
  ON public.filament_movements (filament_id);

CREATE INDEX IF NOT EXISTS filament_movements_created_at_idx
  ON public.filament_movements (created_at DESC);

ALTER TABLE public.filaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filament_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.filaments;
DROP POLICY IF EXISTS "crm_authenticated_access" ON public.filament_movements;

CREATE POLICY "crm_authenticated_access" ON public.filaments
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

CREATE POLICY "crm_authenticated_access" ON public.filament_movements
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

-- Realtime (même approche que quotes / invoices côté client)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.filaments;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.filament_movements;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
