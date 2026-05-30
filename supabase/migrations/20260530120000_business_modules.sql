-- AC Creation CRM — avoirs, SAV, paiements (sync cloud)
-- Idempotent : safe to re-run

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.credit_notes;

CREATE POLICY "crm_authenticated_access" ON public.credit_notes
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

CREATE TABLE IF NOT EXISTS public.after_sales_cases (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.after_sales_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.after_sales_cases;

CREATE POLICY "crm_authenticated_access" ON public.after_sales_cases
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());

CREATE TABLE IF NOT EXISTS public.payments (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_authenticated_access" ON public.payments;

CREATE POLICY "crm_authenticated_access" ON public.payments
  FOR ALL TO authenticated
  USING (public.crm_user_is_active())
  WITH CHECK (public.crm_user_is_active());
