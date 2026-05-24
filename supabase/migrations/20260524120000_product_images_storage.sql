-- AC Creation CRM — bucket Storage images produits
-- À exécuter après docs/supabase-migration.sql et 20260524100000_secure_rls.sql
-- (crm_user_is_active() requis pour les politiques d'écriture)
-- Idempotent : safe to re-run

-- Prérequis : helper RLS (no-op si déjà appliqué via secure_rls.sql)
CREATE OR REPLACE FUNCTION public.crm_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.data->>'email') = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND coalesce(u.data->>'status', 'Actif') <> 'Désactivé'
  );
$$;

REVOKE ALL ON FUNCTION public.crm_user_is_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_user_is_active() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ac-creation-products',
  'ac-creation-products',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS déjà activé sur storage.objects par Supabase (owner: supabase_storage_admin).
-- Ne pas exécuter ALTER TABLE storage.objects — refusé dans le SQL Editor (42501).

DROP POLICY IF EXISTS "ac_creation_products_public_read" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_products_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_products_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_products_authenticated_delete" ON storage.objects;

CREATE POLICY "ac_creation_products_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'ac-creation-products');

CREATE POLICY "ac_creation_products_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ac-creation-products'
  AND public.crm_user_is_active()
);

CREATE POLICY "ac_creation_products_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ac-creation-products'
  AND public.crm_user_is_active()
)
WITH CHECK (
  bucket_id = 'ac-creation-products'
  AND public.crm_user_is_active()
);

CREATE POLICY "ac_creation_products_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ac-creation-products'
  AND public.crm_user_is_active()
);
