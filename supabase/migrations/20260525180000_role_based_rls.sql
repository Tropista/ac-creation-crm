-- AC Creation CRM — RLS par rôle (MVP audit #16)
-- Prérequis : 20260524100000_secure_rls.sql (crm_user_is_active)
-- Rôles : Admin, Employé, Comptable, Utilisateur (users.data->>'role')
--
-- Limitations MVP :
--   • Comptable : lecture factures, dépenses, banque, paramètres ; pas d'écriture métier
--   • Employé : pas de DELETE sur users / settings
--   • Utilisateur : lecture seule (dashboard)
--   • Admin : accès complet
-- Les droits UI (permissions.js) restent la première barrière ; ce SQL durcit Supabase.

CREATE OR REPLACE FUNCTION public.crm_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT u.data->>'role'
      FROM public.users u
      WHERE lower(u.data->>'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
        AND coalesce(u.data->>'status', 'Actif') <> 'Désactivé'
      LIMIT 1
    ),
    'Utilisateur'
  );
$$;

REVOKE ALL ON FUNCTION public.crm_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_role_in(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.crm_user_is_active() AND public.crm_user_role() = ANY(allowed);
$$;

REVOKE ALL ON FUNCTION public.crm_role_in(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_role_in(text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Retirer la politique « tous les actifs voient tout »
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'settings', 'users', 'clients', 'products', 'categories',
    'suppliers', 'expenses', 'quotes', 'invoices', 'backups', 'crm_logs', 'leads'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "crm_authenticated_access" ON public.%I', tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "bank_transactions_authenticated" ON bank_transactions;
DROP POLICY IF EXISTS "leads_authenticated_access" ON public.leads;

-- ---------------------------------------------------------------------------
-- users — DELETE réservé Admin ; Employé peut lire mais pas supprimer
-- ---------------------------------------------------------------------------

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin']));

CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin']));

CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']));

-- ---------------------------------------------------------------------------
-- settings — écriture Admin uniquement
-- ---------------------------------------------------------------------------

CREATE POLICY "settings_select" ON public.settings
  FOR SELECT TO authenticated
  USING (public.crm_user_is_active());

CREATE POLICY "settings_insert" ON public.settings
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin']));

CREATE POLICY "settings_update" ON public.settings
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin']));

CREATE POLICY "settings_delete" ON public.settings
  FOR DELETE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']));

-- ---------------------------------------------------------------------------
-- factures & dépenses — Comptable lecture seule
-- ---------------------------------------------------------------------------

CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable', 'Utilisateur']));

CREATE POLICY "invoices_write" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé']));

CREATE POLICY "invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé']));

CREATE POLICY "invoices_delete" ON public.invoices
  FOR DELETE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']));

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable', 'Utilisateur']));

CREATE POLICY "expenses_write" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé']));

CREATE POLICY "expenses_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé']));

CREATE POLICY "expenses_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']));

-- ---------------------------------------------------------------------------
-- bank_transactions — Comptable lecture + écriture rapprochement
-- ---------------------------------------------------------------------------

CREATE POLICY "bank_tx_select" ON bank_transactions
  FOR SELECT TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable']));

CREATE POLICY "bank_tx_insert" ON bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable']));

CREATE POLICY "bank_tx_update" ON bank_transactions
  FOR UPDATE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable']))
  WITH CHECK (public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable']));

CREATE POLICY "bank_tx_delete" ON bank_transactions
  FOR DELETE TO authenticated
  USING (public.crm_role_in(ARRAY['Admin']));

-- ---------------------------------------------------------------------------
-- tables métier — Comptable exclu ; Utilisateur lecture seule
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clients', 'products', 'categories', 'suppliers', 'quotes', 'backups', 'crm_logs', 'leads'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "%I_select" ON public.%I
         FOR SELECT TO authenticated
         USING (public.crm_role_in(ARRAY[''Admin'', ''Employé'', ''Utilisateur'']))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%I_insert" ON public.%I
         FOR INSERT TO authenticated
         WITH CHECK (public.crm_role_in(ARRAY[''Admin'', ''Employé'']))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%I_update" ON public.%I
         FOR UPDATE TO authenticated
         USING (public.crm_role_in(ARRAY[''Admin'', ''Employé'']))
         WITH CHECK (public.crm_role_in(ARRAY[''Admin'', ''Employé'']))',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY "%I_delete" ON public.%I
         FOR DELETE TO authenticated
         USING (public.crm_role_in(ARRAY[''Admin'']))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- leads : conserver l'insert anon pour le configurateur public
DROP POLICY IF EXISTS "leads_authenticated_access" ON public.leads;
