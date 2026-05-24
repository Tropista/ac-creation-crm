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
