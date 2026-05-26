-- Partage public de devis (lecture + acceptation via token dans data.shareToken)
-- Le token est validé côté application ; la politique limite l'accès anon aux lignes partagées.

DROP POLICY IF EXISTS "quotes_anon_shared_read" ON public.quotes;
CREATE POLICY "quotes_anon_shared_read" ON public.quotes
  FOR SELECT TO anon
  USING (coalesce(data->>'shareToken', '') <> '');

DROP POLICY IF EXISTS "quotes_anon_shared_accept" ON public.quotes;
CREATE POLICY "quotes_anon_shared_accept" ON public.quotes
  FOR UPDATE TO anon
  USING (
    coalesce(data->>'shareToken', '') <> ''
    AND coalesce(data->>'status', '') NOT IN ('Accepté', 'Refusé', 'Annulé')
  )
  WITH CHECK (
    coalesce(data->>'shareToken', '') <> ''
    AND data->>'status' IN ('Accepté', 'Refusé')
  );

DROP POLICY IF EXISTS "settings_anon_public_read" ON public.settings;
CREATE POLICY "settings_anon_public_read" ON public.settings
  FOR SELECT TO anon
  USING (id = 'main');
