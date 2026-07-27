-- AC Creation CRM - classeurs TVA de préparation
-- Les annexes conservent des snapshots, sans modifier les factures ni dépenses.

CREATE TABLE IF NOT EXISTS public.vat_workbook_periods (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_vat_workbook_periods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vat_workbook_periods_set_updated_at ON public.vat_workbook_periods;
CREATE TRIGGER vat_workbook_periods_set_updated_at
BEFORE UPDATE ON public.vat_workbook_periods
FOR EACH ROW EXECUTE FUNCTION public.set_vat_workbook_periods_updated_at();

CREATE INDEX IF NOT EXISTS vat_workbook_periods_start_date_idx
  ON public.vat_workbook_periods ((data->>'startDate'));
CREATE INDEX IF NOT EXISTS vat_workbook_periods_updated_at_idx
  ON public.vat_workbook_periods (updated_at DESC);

ALTER TABLE public.vat_workbook_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vat_workbook_periods_select" ON public.vat_workbook_periods;
DROP POLICY IF EXISTS "vat_workbook_periods_insert" ON public.vat_workbook_periods;
DROP POLICY IF EXISTS "vat_workbook_periods_update" ON public.vat_workbook_periods;
DROP POLICY IF EXISTS "vat_workbook_periods_delete" ON public.vat_workbook_periods;

CREATE POLICY "vat_workbook_periods_select" ON public.vat_workbook_periods
  FOR SELECT TO authenticated USING (public.crm_user_is_active());
CREATE POLICY "vat_workbook_periods_insert" ON public.vat_workbook_periods
  FOR INSERT TO authenticated WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Comptable']));
CREATE POLICY "vat_workbook_periods_update" ON public.vat_workbook_periods
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Comptable']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Comptable']));
CREATE POLICY "vat_workbook_periods_delete" ON public.vat_workbook_periods
  FOR DELETE TO authenticated USING (public.crm_role_in(ARRAY['Admin']));
