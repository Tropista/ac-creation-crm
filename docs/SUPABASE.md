# Schéma Supabase — AC Creation CRM

Configuration PostgreSQL attendue par l’application. À exécuter dans le **SQL Editor** du projet Supabase (adapter selon votre instance existante).

**Migration complète (recommandé)** :

1. Copier-coller une seule fois le contenu de [`docs/supabase-migration.sql`](supabase-migration.sql) dans le SQL Editor Supabase (tables CRM + `bank_transactions`).
2. **Durcir la sécurité** : exécuter [`supabase/migrations/20260524100000_secure_rls.sql`](../supabase/migrations/20260524100000_secure_rls.sql) (RLS authenticated, rôles admin depuis la table `users`).

## Auth

Activer **Email + mot de passe** dans Authentication → Providers. Les utilisateurs CRM sont enregistrés dans la table `users` (rôle, statut).

### Flux d’accès

1. Créer le compte dans **Authentication → Users** (email + mot de passe).
2. Ajouter l’utilisateur dans la table `users` via le CRM (page Utilisateurs) **ou** via le seed SQL de la migration RLS pour les admins initiaux.
3. Se connecter au CRM : Supabase Auth vérifie le mot de passe, l’app vérifie que l’email existe dans `users` avec statut **Actif**.
4. Les requêtes cloud utilisent le JWT **authenticated** — la clé **anon** seule ne suffit plus.

> **Configurateur public** (`/configurateur-tshirt`) : aucun accès Supabase. Brouillon en `localStorage` uniquement.

## Modèle de données CRM

La plupart des entités métier utilisent le même schéma : **`id`** (texte, clé primaire) + **`data`** (jsonb, objet CRM complet) + **`created_at`** (timestamptz, optionnel pour le tri).

### Tables sync (`src/services/supabaseSync.js`)

| Table | Clé `settings` | Contenu `data` |
|-------|----------------|----------------|
| `settings` | `id = 'main'` | Paramètres société, préférences |
| `users` | UUID / string | `{ name, email, role, status, … }` |
| `clients` | id document | Fiche client |
| `products` | id document | Produit |
| `categories` | id document | Catégorie |
| `suppliers` | id document | Fournisseur |
| `expenses` | id document | Facture de dépense (import PDF ou saisie manuelle) |
| `quotes` | id document | Devis |
| `invoices` | id document | Facture |
| `backups` | id document | Snapshot backup |
| `crm_logs` | id document | Entrée journal d’activité |

> **Module Catalogues retiré** — si les tables catalogue existent encore sur votre projet Supabase, exécutez [`supabase/migrations/DROP_CATALOG_TABLES.sql`](../supabase/migrations/DROP_CATALOG_TABLES.sql) pour supprimer `supplier_catalog_items`, `client_catalog_items`, `catalog_items` et `catalog_selections`.

### Exemple de création (collections CRM)

```sql
-- Modèle générique id + data jsonb
CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backups (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_logs (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
```

## Politiques RLS (sécurisées)

### Principe

| Rôle Postgres | Accès CRM |
|---------------|-----------|
| `anon` | **Aucun** accès aux tables CRM |
| `authenticated` | Accès si email JWT présent dans `users` avec statut ≠ `Désactivé` |

La fonction helper `crm_user_is_active()` vérifie `lower(data->>'email') = lower(auth.jwt()->>'email')`.

### Application (obligatoire en production)

Exécuter le script complet :

[`supabase/migrations/20260524100000_secure_rls.sql`](../supabase/migrations/20260524100000_secure_rls.sql)

Ce script :

- supprime les anciennes politiques `crm_full_access` (anon + authenticated),
- crée `crm_authenticated_access` sur toutes les tables CRM,
- restreint `bank_transactions` aux utilisateurs authentifiés actifs,
- insère les admins initiaux s’ils sont absents de `users`.

### Rôles admin

Les rôles **Admin** / **Employé** / etc. sont lus depuis `users.data.role` — plus d’emails admin hardcodés dans le code. Pour promouvoir un admin :

```sql
UPDATE users
SET data = data || '{"role":"Admin","status":"Actif"}'::jsonb
WHERE lower(data->>'email') = lower('votre@email.com');
```

Ou via la page **Utilisateurs** du CRM (réservée aux Admin).

## Table `bank_transactions`

Utilisée par la page **Banque** (`src/components/Banque.jsx`) pour le rapprochement avec les factures CRM.

### Colonnes attendues

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid (défaut `gen_random_uuid()`) | Identifiant |
| `transaction_date` | date | Date de l’opération |
| `description` | text | Libellé |
| `amount` | numeric | Montant (positif = crédit) |
| `currency` | text | Ex. `EUR` |
| `status` | text | `non rapprochée`, `rapprochée`, `ignorée`, `payée` (selon contraintes CHECK) |
| `matched` | boolean | `true` si rapprochée ou ignorée |
| `matched_invoice` | text | Numéro de facture (ex. `FAC-2024-001`) |
| `matched_invoice_id` | text | ID facture CRM (string, **pas** UUID Postgres) |
| `created_at` | timestamptz | Optionnel |

### Création initiale

```sql
CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date,
  description text,
  amount numeric,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'non rapprochée',
  matched boolean DEFAULT false,
  matched_invoice text,
  matched_invoice_id text,
  created_at timestamptz DEFAULT now()
);
```

### Migration colonnes rapprochement

Si **Rapprocher** ou **Ignorer** échoue (colonnes ou RLS manquantes), exécuter — voir aussi le commentaire en tête de `src/utils/bankTransactionSync.js` :

```sql
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS matched boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_invoice text,
  ADD COLUMN IF NOT EXISTS matched_invoice_id text;
```

> `matched_invoice_id` doit rester en **text** : l’app envoie l’id string des factures CRM, pas un UUID PostgreSQL.

### RLS — rapprochement bancaire

Inclus dans `20260524100000_secure_rls.sql` : politique `bank_transactions_authenticated` (authenticated + `crm_user_is_active()`).

Sans cette migration, les actions Rapprocher / Ignorer / Supprimer renvoient `42501`.

### Contrainte `status`

L’app tente plusieurs variantes de statut (`rapprochée`, `ignorée`, `payée`). Si une contrainte `CHECK` sur `status` bloque les mises à jour, élargir les valeurs autorisées ou assouplir la contrainte.

## Diagnostic rapide

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `PGRST205` / table introuvable | Table CRM non créée (ex. `suppliers`, `expenses`) | Exécuter le `CREATE TABLE` correspondant ci-dessus |
| `PGRST204` / colonne manquante | Migration non appliquée | `ALTER TABLE` ci-dessus |
| `42501` / row-level security | RLS durci sans session auth ou utilisateur absent de `users` | Se reconnecter ; vérifier `users` ; exécuter `20260524100000_secure_rls.sql` |
| `invalid input syntax for type uuid` sur `matched_invoice_id` | Colonne en UUID au lieu de text | `ALTER COLUMN matched_invoice_id TYPE text` |
| Aucune ligne mise à jour | RLS ou mauvais `id` | Vérifier policies et `eq("id", transactionId)` |
| « Compte non autorisé » au login | Email absent de `users` ou statut Désactivé | Ajouter l’utilisateur dans le CRM ou via SQL |
| Sync cloud indisponible sans login | Comportement attendu (RLS) | Se connecter pour activer la sync |

Messages d’aide côté app : `bankTransactionErrorHint()` dans `src/utils/bankTransactionSync.js`.

## Sync factures ↔ rapprochement

- Les factures restent dans `invoices.data` (jsonb).
- Le rapprochement met à jour `bank_transactions` **et** le statut local des factures (`Payée`) via le state React ; la sync Supabase des factures se fait via `syncSupabaseData` comme le reste du CRM.

## Checklist déploiement RLS

1. Exécuter `docs/supabase-migration.sql` (si tables absentes).
2. Exécuter `supabase/migrations/20260524100000_secure_rls.sql`.
3. Vérifier que chaque utilisateur CRM existe dans **Authentication** ET dans `users` (rôle + statut Actif).
4. Rebuild Electron / redeploy Vercel avec les variables `VITE_SUPABASE_*`.
5. Tester login + sync + page Banque.

## Storage — images produits

Bucket **`ac-creation-products`** : les images produit ne sont plus stockées en base64 dans `localStorage` ni dans le JSON Supabase lorsqu’elles sont uploadées via le CRM.

### Comportement app

| Mode | Import image |
|------|----------------|
| Connecté + Supabase configuré | Upload vers Storage → URL publique dans `product.imageUrl` |
| Hors ligne / non connecté | Base64 compressé autorisé si ≤ 100 Ko ; sinon message « utilisez une URL » |
| Saisie manuelle | Champ URL (`https://…`) dans la fiche produit |

À la sauvegarde locale, les images base64 **> 100 Ko** sont retirées automatiquement pour limiter le quota `localStorage`. Les petites images legacy restent affichables jusqu’à re-upload.

### Setup Supabase

1. Exécuter `supabase/migrations/20260524100000_secure_rls.sql` (fonction `crm_user_is_active()` requise).
2. Exécuter `supabase/migrations/20260524120000_product_images_storage.sql`  
   *(ou la section Storage en fin de `docs/supabase-migration.sql`)*.
3. Vérifier dans **Storage → Buckets** que `ac-creation-products` existe et est **public** (lecture).
4. Se connecter au CRM avec un utilisateur **Actif** dans la table `users`, puis tester l’import d’image sur un produit.

### Politiques Storage

| Action | Rôle | Condition |
|--------|------|-----------|
| Lecture (SELECT) | `public` | Bucket `ac-creation-products` |
| Upload / update / delete | `authenticated` | `crm_user_is_active()` |

Formats autorisés : JPEG, PNG, WebP — taille max 5 Mo par fichier.

### Diagnostic

| Symptôme | Action |
|----------|--------|
| « Image trop lourde… utilisez une URL » | Se connecter ou coller une URL HTTPS |
| Toast « new row violates row-level security policy » / `42501` | Politiques Storage absentes ou compte inactif — voir **SQL immédiat** ci-dessous |
| Upload échoue `42501` | Vérifier login + entrée `users` active ; exécuter la migration Storage |
| Image absente après rechargement | Base64 > 100 Ko retirée — re-uploader ou utiliser une URL |

### SQL immédiat (SQL Editor Supabase)

Si l’import d’image produit échoue avec *« new row violates row-level security policy »*, le bucket ou ses politiques RLS ne sont pas configurés. Coller et exécuter **en une fois** :

> **Note :** ne pas exécuter `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` — la table appartient à `supabase_storage_admin` et le SQL Editor renvoie `42501: must be owner of table objects`. RLS est **déjà activé** par Supabase sur `storage.objects` ; seules les politiques ci-dessous sont nécessaires.

```sql
-- AC Creation CRM — Storage images produits (correction RLS upload)
-- Idempotent : safe to re-run
-- Ne PAS inclure ALTER TABLE storage.objects (RLS déjà actif côté Supabase)

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
```

Puis vérifier :

1. **Authentication → Users** : votre email existe avec un mot de passe.
2. **Table `users`** : même email, statut **Actif** (pas « Désactivé »).
3. **Storage → Buckets** : `ac-creation-products` est **public** (lecture).
4. Reconnectez-vous au CRM et réessayez l’import d’image.

### Alternative : politiques via l’interface Storage

Si le SQL Editor refuse encore la création de politiques (`CREATE POLICY` sur `storage.objects`), configurez-les dans le tableau de bord Supabase :

1. Ouvrir **Storage** → **Buckets**.
2. Si `ac-creation-products` n’existe pas : **New bucket** → nom `ac-creation-products`, cocher **Public bucket**, limites optionnelles (5 Mo, JPEG/PNG/WebP).
3. Cliquer sur **`ac-creation-products`** → onglet **Policies** → **New policy**.

Créer **quatre politiques** (bouton *For full customization* ou équivalent) :

| Nom suggéré | Opération | Rôles cibles | Expression |
|-------------|-----------|--------------|------------|
| Lecture publique | **SELECT** | `public` (ou anon + authenticated) | `bucket_id = 'ac-creation-products'` |
| Upload CRM | **INSERT** | `authenticated` | `bucket_id = 'ac-creation-products' AND public.crm_user_is_active()` |
| Mise à jour CRM | **UPDATE** | `authenticated` | `bucket_id = 'ac-creation-products' AND public.crm_user_is_active()` (USING et WITH CHECK) |
| Suppression CRM | **DELETE** | `authenticated` | `bucket_id = 'ac-creation-products' AND public.crm_user_is_active()` |

4. Exécuter d’abord la partie **fonction** `crm_user_is_active()` du bloc SQL ci-dessus (ou `20260524100000_secure_rls.sql`) — l’interface Storage ne la crée pas.
5. Vérifier que votre email est **Actif** dans la table `users`, reconnectez-vous au CRM, puis retestez le drag-drop d’image.

Source versionnée : [`supabase/migrations/20260524120000_product_images_storage.sql`](../supabase/migrations/20260524120000_product_images_storage.sql)

## Storage — pièces jointes devis

Bucket **`ac-creation-attachments`** : fichiers joints aux devis (images, PDF, etc.) uploadés via la page Documents.

### Comportement app

| Mode | Import pièce jointe |
|------|---------------------|
| Connecté + bucket configuré | Upload vers Storage → URL publique dans `quote.attachments` |
| Connecté + bucket absent | Fallback base64 local si ≤ 500 Ko ; sinon message d'erreur |
| Hors ligne / non connecté | Base64 compressé autorisé si ≤ 500 Ko |

À la sauvegarde locale, les pièces jointes base64 **> 500 Ko** sont retirées automatiquement.

### Setup Supabase

1. Exécuter `supabase/migrations/20260524100000_secure_rls.sql` (fonction `crm_user_is_active()` requise).
2. Exécuter `supabase/migrations/20260525120000_quote_attachments_storage.sql`.
3. Vérifier dans **Storage → Buckets** que `ac-creation-attachments` existe et est **public** (lecture).
4. Se connecter au CRM avec un utilisateur **Actif** dans la table `users`, puis tester l'import sur un devis.

### Politiques Storage

| Action | Rôle | Condition |
|--------|------|-----------|
| Lecture (SELECT) | `public` | Bucket `ac-creation-attachments` |
| Upload / update / delete | `authenticated` | `crm_user_is_active()` |

Formats autorisés : JPEG, PNG, WebP, GIF, PDF, octet-stream — taille max 10 Mo par fichier.

### Diagnostic

| Symptôme | Action |
|----------|--------|
| « Bucket « ac-creation-attachments » absent » | Exécuter le SQL ci-dessous |
| Toast « new row violates row-level security policy » / `42501` | Politiques Storage absentes ou compte inactif — voir **SQL immédiat** ci-dessous |
| Fichier trop lourd pour l'enregistrement local | Configurer le bucket Storage ou réduire la taille (≤ 500 Ko en local) |
| Pièce jointe absente après rechargement | Base64 > 500 Ko retirée — re-uploader après configuration Storage |

### SQL immédiat (SQL Editor Supabase)

Si l'import de pièce jointe échoue avec *« Bucket ac-creation-attachments absent »* ou *« new row violates row-level security policy »*, coller et exécuter **en une fois** :

> **Note :** ne pas exécuter `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` — la table appartient à `supabase_storage_admin` et le SQL Editor renvoie `42501: must be owner of table objects`. RLS est **déjà activé** par Supabase sur `storage.objects` ; seules les politiques ci-dessous sont nécessaires.

```sql
-- AC Creation CRM — Storage pièces jointes devis (correction bucket + RLS)
-- Idempotent : safe to re-run
-- Ne PAS inclure ALTER TABLE storage.objects (RLS déjà actif côté Supabase)

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
  'ac-creation-attachments',
  'ac-creation-attachments',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/octet-stream'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ac_creation_attachments_public_read" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_attachments_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_attachments_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "ac_creation_attachments_authenticated_delete" ON storage.objects;

CREATE POLICY "ac_creation_attachments_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'ac-creation-attachments');

CREATE POLICY "ac_creation_attachments_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ac-creation-attachments'
  AND public.crm_user_is_active()
);

CREATE POLICY "ac_creation_attachments_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ac-creation-attachments'
  AND public.crm_user_is_active()
)
WITH CHECK (
  bucket_id = 'ac-creation-attachments'
  AND public.crm_user_is_active()
);

CREATE POLICY "ac_creation_attachments_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ac-creation-attachments'
  AND public.crm_user_is_active()
);
```

Puis vérifier :

1. **Authentication → Users** : votre email existe avec un mot de passe.
2. **Table `users`** : même email, statut **Actif** (pas « Désactivé »).
3. **Storage → Buckets** : `ac-creation-attachments` est **public** (lecture).
4. Reconnectez-vous au CRM et réessayez l'import de pièce jointe sur un devis.

### Alternative : politiques via l'interface Storage

Si le SQL Editor refuse encore la création de politiques (`CREATE POLICY` sur `storage.objects`), configurez-les dans le tableau de bord Supabase :

1. Ouvrir **Storage** → **Buckets**.
2. Si `ac-creation-attachments` n'existe pas : **New bucket** → nom `ac-creation-attachments`, cocher **Public bucket**, limites optionnelles (10 Mo, JPEG/PNG/WebP/GIF/PDF).
3. Cliquer sur **`ac-creation-attachments`** → onglet **Policies** → **New policy**.

Créer **quatre politiques** (bouton *For full customization* ou équivalent) :

| Nom suggéré | Opération | Rôles cibles | Expression |
|-------------|-----------|--------------|------------|
| Lecture publique | **SELECT** | `public` (ou anon + authenticated) | `bucket_id = 'ac-creation-attachments'` |
| Upload CRM | **INSERT** | `authenticated` | `bucket_id = 'ac-creation-attachments' AND public.crm_user_is_active()` |
| Mise à jour CRM | **UPDATE** | `authenticated` | `bucket_id = 'ac-creation-attachments' AND public.crm_user_is_active()` (USING et WITH CHECK) |
| Suppression CRM | **DELETE** | `authenticated` | `bucket_id = 'ac-creation-attachments' AND public.crm_user_is_active()` |

4. Exécuter d'abord la partie **fonction** `crm_user_is_active()` du bloc SQL ci-dessus (ou `20260524100000_secure_rls.sql`) — l'interface Storage ne la crée pas.
5. Vérifier que votre email est **Actif** dans la table `users`, reconnectez-vous au CRM, puis retestez l'import de pièce jointe.

Source versionnée : [`supabase/migrations/20260525120000_quote_attachments_storage.sql`](../supabase/migrations/20260525120000_quote_attachments_storage.sql)
