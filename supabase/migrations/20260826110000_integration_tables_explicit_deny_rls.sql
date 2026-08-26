-- Politiques RLS explicites pour les tables privées de l'API d'intégration.
-- Le service role continue de contourner RLS ; anon/authenticated restent refusés.

DROP POLICY IF EXISTS "crm_integration_events_deny_client_access"
  ON public.crm_integration_events;
CREATE POLICY "crm_integration_events_deny_client_access"
  ON public.crm_integration_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "crm_integration_nonces_deny_client_access"
  ON public.crm_integration_nonces;
CREATE POLICY "crm_integration_nonces_deny_client_access"
  ON public.crm_integration_nonces
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "crm_integration_acks_deny_client_access"
  ON public.crm_integration_acks;
CREATE POLICY "crm_integration_acks_deny_client_access"
  ON public.crm_integration_acks
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "crm_integration_logs_deny_client_access"
  ON public.crm_integration_logs;
CREATE POLICY "crm_integration_logs_deny_client_access"
  ON public.crm_integration_logs
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
