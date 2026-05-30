-- AC Creation CRM — pont Bambu Lab (imprimantes, AMS, jobs MQTT)
-- Idempotent : safe to re-run

CREATE TABLE IF NOT EXISTS public.bambu_printers (
  id text PRIMARY KEY,
  name text NOT NULL,
  host text NOT NULL,
  serial text NOT NULL,
  access_code_encrypted text,
  model text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ams_slot_mappings (
  id text PRIMARY KEY,
  printer_id text NOT NULL REFERENCES public.bambu_printers(id) ON DELETE CASCADE,
  slot_index integer NOT NULL CHECK (slot_index >= 0 AND slot_index <= 15),
  filament_id text REFERENCES public.filaments(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (printer_id, slot_index)
);

CREATE TABLE IF NOT EXISTS public.bambu_print_jobs (
  id text PRIMARY KEY,
  printer_id text NOT NULL REFERENCES public.bambu_printers(id) ON DELETE CASCADE,
  job_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'finished', 'failed', 'applied')),
  grams_estimated numeric,
  filament_id text REFERENCES public.filaments(id) ON DELETE SET NULL,
  raw_mqtt_json jsonb,
  finished_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bambu_print_jobs_printer_id_idx
  ON public.bambu_print_jobs (printer_id);

CREATE INDEX IF NOT EXISTS bambu_print_jobs_status_idx
  ON public.bambu_print_jobs (status);

CREATE INDEX IF NOT EXISTS bambu_print_jobs_created_at_idx
  ON public.bambu_print_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS ams_slot_mappings_printer_id_idx
  ON public.ams_slot_mappings (printer_id);

ALTER TABLE public.bambu_printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ams_slot_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bambu_print_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.bambu_printers;
DROP POLICY IF EXISTS "crm_authenticated_access" ON public.ams_slot_mappings;
DROP POLICY IF EXISTS "crm_authenticated_access" ON public.bambu_print_jobs;

CREATE POLICY "crm_authenticated_access" ON public.bambu_printers
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

CREATE POLICY "crm_authenticated_access" ON public.ams_slot_mappings
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

CREATE POLICY "crm_authenticated_access" ON public.bambu_print_jobs
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bambu_print_jobs;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
