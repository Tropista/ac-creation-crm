-- AC Creation CRM — RLS pont Bambu (service_role pont + lecture CRM explicite)
-- Complète 20260530150000_bambu_print_bridge.sql
-- Idempotent : safe to re-run

-- ---------------------------------------------------------------------------
-- Pont atelier (JWT service_role) — insert jobs MQTT sans session utilisateur
-- Note : service_role contourne RLS côté Postgres ; ces politiques documentent
-- l'intention et couvrent les chemins REST explicites TO service_role.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "bambu_bridge_service_role" ON public.bambu_print_jobs;
DROP POLICY IF EXISTS "bambu_bridge_service_role" ON public.bambu_printers;
DROP POLICY IF EXISTS "bambu_bridge_service_role" ON public.ams_slot_mappings;

CREATE POLICY "bambu_bridge_service_role" ON public.bambu_print_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bambu_bridge_service_role" ON public.bambu_printers
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "bambu_bridge_service_role" ON public.ams_slot_mappings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- CRM navigateur (authenticated + utilisateur actif) — lecture explicite
-- La politique « crm_authenticated_access » (FOR ALL) reste en place pour sync.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "bambu_crm_authenticated_select" ON public.bambu_print_jobs;
DROP POLICY IF EXISTS "bambu_crm_authenticated_select" ON public.bambu_printers;
DROP POLICY IF EXISTS "bambu_crm_authenticated_select" ON public.ams_slot_mappings;

CREATE POLICY "bambu_crm_authenticated_select" ON public.bambu_print_jobs
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

CREATE POLICY "bambu_crm_authenticated_select" ON public.bambu_printers
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

CREATE POLICY "bambu_crm_authenticated_select" ON public.ams_slot_mappings
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());
