-- AC Creation CRM - rapports de preparation TVA
-- Modele generique synchronise: id + data JSONB, sans modifier les donnees existantes.
-- Idempotent autant que possible.

CREATE TABLE IF NOT EXISTS public.vat_reports (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_vat_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vat_reports_set_updated_at ON public.vat_reports;
CREATE TRIGGER vat_reports_set_updated_at
BEFORE UPDATE ON public.vat_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_vat_reports_updated_at();

CREATE INDEX IF NOT EXISTS vat_reports_tax_year_idx
  ON public.vat_reports (((data->>'tax_year')::int));

CREATE INDEX IF NOT EXISTS vat_reports_status_idx
  ON public.vat_reports ((data->>'status'));

CREATE INDEX IF NOT EXISTS vat_reports_updated_at_idx
  ON public.vat_reports (updated_at DESC);

ALTER TABLE public.vat_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.vat_reports;
DROP POLICY IF EXISTS "vat_reports_select" ON public.vat_reports;
DROP POLICY IF EXISTS "vat_reports_insert" ON public.vat_reports;
DROP POLICY IF EXISTS "vat_reports_update" ON public.vat_reports;
DROP POLICY IF EXISTS "vat_reports_delete" ON public.vat_reports;

CREATE POLICY "vat_reports_select" ON public.vat_reports
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

CREATE POLICY "vat_reports_insert" ON public.vat_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Comptable']));

CREATE POLICY "vat_reports_update" ON public.vat_reports
  FOR UPDATE TO authenticated
  USING (
    public.crm_role_in(ARRAY['Admin', 'Comptable'])
    AND coalesce(data->>'status', 'draft') <> 'filed'
  )
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Comptable']));

CREATE POLICY "vat_reports_delete" ON public.vat_reports
  FOR DELETE TO authenticated
  USING (
    public.crm_role_in(ARRAY['Admin'])
    AND coalesce(data->>'status', 'draft') = 'draft'
  );
