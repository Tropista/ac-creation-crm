-- AC Creation CRM — extension bucket attachments pour fichiers clients
-- Ajoute les types MIME nécessaires à la bibliothèque fichiers client
-- (SVG, ZIP, PDF, images, fichiers vectoriels)

UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = ARRAY[
    -- Images
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    -- Documents
    'application/pdf',
    -- Archives
    'application/zip', 'application/x-zip-compressed',
    -- Fichiers vectoriels / impression
    'application/postscript',          -- .ai .eps
    'image/x-eps',
    'application/dxf',
    'image/vnd.dxf',
    -- Générique
    'application/octet-stream'
  ]::text[]
WHERE id = 'ac-creation-attachments';

-- Politique : les fichiers clients/ sont accessibles aux utilisateurs CRM actifs
-- (hérite des policies existantes SELECT/INSERT/UPDATE/DELETE sur le bucket)
