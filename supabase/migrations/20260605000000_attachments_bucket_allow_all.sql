-- AC Creation CRM — Supprimer la restriction MIME du bucket attachments
-- allowed_mime_types = NULL → tous les types acceptés (CRM interne, confiance implicite)
-- Résout : "mime type image is not supported" lors de l'upload de fichiers clients

UPDATE storage.buckets
SET
  allowed_mime_types = NULL,
  file_size_limit    = 52428800  -- 50 MB max par fichier
WHERE id = 'ac-creation-attachments';
