-- AC Creation CRM — Extension champs client et données liées
-- Ajoute les tables/champs manquants introduits depuis la migration initiale :
--   • clientFiles  : bibliothèque de fichiers par client (images, SVG, PDF…)
--   • clientNotes  : journal de notes horodatées par client
--   • vatNumber    : N° TVA client dans la colonne JSONB data
--
-- Ces données sont stockées dans la colonne JSONB `data` de la table `settings`
-- (structure key-value JSON) — pas dans des tables séparées.
-- Cette migration documente les champs attendus et s'assure que les politiques
-- RLS existantes les couvrent sans modification supplémentaire.

-- Vérification : la table settings doit exister
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings') THEN
    RAISE EXCEPTION 'Table settings introuvable — exécuter supabase-migration.sql en premier.';
  END IF;
END $$;

-- Note documentaire : structure JSON étendue attendue dans settings.data
-- {
--   "clients": [
--     {
--       "id": "uuid",
--       "name": "...",
--       "vatNumber": "LU12345678",   ← N° TVA client (nouveau)
--       ...
--     }
--   ],
--   "clientFiles": [                 ← bibliothèque fichiers (nouveau)
--     {
--       "id": "uuid",
--       "clientId": "uuid",
--       "name": "logo.svg",
--       "url": "https://...",
--       "storagePath": "clients/...",
--       "mimeType": "image/svg+xml",
--       "size": 12345,
--       "uploadedAt": "2026-06-03T00:00:00Z",
--       "source": "storage"
--     }
--   ],
--   "clientNotes": [                 ← notes horodatées (nouveau)
--     {
--       "id": "uuid",
--       "clientId": "uuid",
--       "text": "...",
--       "createdAt": "2026-06-03T00:00:00Z"
--     }
--   ]
-- }

-- Les politiques RLS sur la table `settings` couvrent déjà ces champs
-- car ils font partie du même objet JSON. Aucune politique supplémentaire
-- n'est nécessaire.

-- Bucket Storage : s'assurer que le bucket client-files est configuré
-- (déjà géré par 20260601000000_client_files_storage.sql)
