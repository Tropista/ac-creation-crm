# Schéma Supabase — AC Creation CRM

Configuration PostgreSQL attendue par l’application. À exécuter dans le **SQL Editor** du projet Supabase (adapter selon votre instance existante).

## Auth

Activer **Email + mot de passe** dans Authentication → Providers. Les utilisateurs CRM sont aussi enregistrés dans la table `users` (rôle, statut).

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

### Politiques RLS (collections CRM)

Pour un usage interne avec la clé **anon** côté client, activer RLS et autoriser les opérations nécessaires à la sync (à durcir en production selon votre modèle d’auth) :

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Exemple : accès complet pour anon/authenticated (à restreindre si besoin)
CREATE POLICY "crm_full_access" ON clients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- Répéter pour chaque table CRM ou regrouper via rôles Supabase.
```

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

Sans politiques **UPDATE** et **DELETE**, les actions Rapprocher / Ignorer / Supprimer renvoient une erreur de permissions.

```sql
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transactions_select" ON bank_transactions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "bank_transactions_insert" ON bank_transactions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "bank_transactions_update" ON bank_transactions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "bank_transactions_delete" ON bank_transactions
  FOR DELETE TO anon, authenticated USING (true);
```

### Contrainte `status`

L’app tente plusieurs variantes de statut (`rapprochée`, `ignorée`, `payée`). Si une contrainte `CHECK` sur `status` bloque les mises à jour, élargir les valeurs autorisées ou assouplir la contrainte.

## Diagnostic rapide

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `PGRST205` / table introuvable | Table CRM non créée (ex. `suppliers`, `expenses`) | Exécuter le `CREATE TABLE` correspondant ci-dessus |
| `PGRST204` / colonne manquante | Migration non appliquée | `ALTER TABLE` ci-dessus |
| `42501` / row-level security | RLS sans politique UPDATE/DELETE | Créer les policies `bank_transactions_*` |
| `invalid input syntax for type uuid` sur `matched_invoice_id` | Colonne en UUID au lieu de text | `ALTER COLUMN matched_invoice_id TYPE text` |
| Aucune ligne mise à jour | RLS ou mauvais `id` | Vérifier policies et `eq("id", transactionId)` |

Messages d’aide côté app : `bankTransactionErrorHint()` dans `src/utils/bankTransactionSync.js`.

## Sync factures ↔ rapprochement

- Les factures restent dans `invoices.data` (jsonb).
- Le rapprochement met à jour `bank_transactions` **et** le statut local des factures (`Payée`) via le state React ; la sync Supabase des factures se fait via `syncSupabaseData` comme le reste du CRM.
