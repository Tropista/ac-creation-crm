-- AC Creation CRM — état AMS en direct (pont MQTT → Supabase)
-- Idempotent : safe to re-run

CREATE TABLE IF NOT EXISTS public.bambu_ams_trays (
  id text PRIMARY KEY,
  printer_id text NOT NULL REFERENCES public.bambu_printers(id) ON DELETE CASCADE,
  ams_unit integer NOT NULL CHECK (ams_unit >= 0 AND ams_unit <= 7),
  slot_index integer NOT NULL CHECK (slot_index >= 0 AND slot_index <= 3),
  material text,
  color text,
  tag_uid text,
  remain_pct numeric,
  remain_g numeric,
  tray_info_idx text,
  tray_type text,
  tray_weight_g numeric,
  empty boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (printer_id, ams_unit, slot_index)
);

CREATE INDEX IF NOT EXISTS bambu_ams_trays_printer_id_idx
  ON public.bambu_ams_trays (printer_id);

CREATE INDEX IF NOT EXISTS bambu_ams_trays_updated_at_idx
  ON public.bambu_ams_trays (updated_at DESC);

-- Support multi-AMS (ex. 2× AMS 2 Pro) dans le mapping CRM
ALTER TABLE public.ams_slot_mappings
  ADD COLUMN IF NOT EXISTS ams_unit integer NOT NULL DEFAULT 0;

ALTER TABLE public.ams_slot_mappings
  DROP CONSTRAINT IF EXISTS ams_slot_mappings_printer_id_slot_index_key;

ALTER TABLE public.ams_slot_mappings
  DROP CONSTRAINT IF EXISTS ams_slot_mappings_printer_id_ams_unit_slot_index_key;

ALTER TABLE public.ams_slot_mappings
  ADD CONSTRAINT ams_slot_mappings_printer_id_ams_unit_slot_index_key
  UNIQUE (printer_id, ams_unit, slot_index);

ALTER TABLE public.bambu_ams_trays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.bambu_ams_trays;
CREATE POLICY "crm_authenticated_access" ON public.bambu_ams_trays
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

DROP POLICY IF EXISTS "bambu_bridge_service_role" ON public.bambu_ams_trays;
CREATE POLICY "bambu_bridge_service_role" ON public.bambu_ams_trays
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "bambu_crm_authenticated_select" ON public.bambu_ams_trays;
CREATE POLICY "bambu_crm_authenticated_select" ON public.bambu_ams_trays
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bambu_ams_trays;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
