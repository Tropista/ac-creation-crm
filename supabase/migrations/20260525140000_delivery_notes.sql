-- AC Creation CRM — bons de livraison (sync cloud)
-- Idempotent : safe to re-run

CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.delivery_notes;

CREATE POLICY "crm_authenticated_access" ON public.delivery_notes
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());
