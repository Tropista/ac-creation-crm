# AC Creation CRM

[![CI](https://github.com/Tropista/ac-creation-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/Tropista/ac-creation-crm/actions/workflows/ci.yml)

Application CRM interne pour **AC Creation** : clients, produits, devis, factures, rapprochement bancaire, configurateurs 3D et export desktop (Electron).

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Vite 8, React Router |
| Backend cloud | Supabase (Auth + PostgreSQL) |
| Desktop | Electron + electron-builder (Windows NSIS) |
| Banque (optionnel) | API Express + Tink (`backend/server.js`) |
| 3D | Three.js, React Three Fiber |

## Prérequis

- Node.js 18+
- Compte [Supabase](https://supabase.com) (Auth + base PostgreSQL)
- *(Optionnel)* Client Tink pour la connexion bancaire automatisée

## Installation

```bash
npm install
cp .env.example .env
# Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
```

Créer les tables Supabase : coller [`docs/supabase-migration.sql`](docs/supabase-migration.sql) dans le SQL Editor Supabase (détails dans [`docs/SUPABASE.md`](docs/SUPABASE.md)).

## Scripts npm

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement Vite (http://localhost:5173) |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualisation du build |
| `npm run lint` | ESLint sur le projet |
| `npm test` | Tests unitaires Vitest (utilisés en CI) |
| `npm run electron` | Lance l’app Electron (nécessite `npm run build` au préalable) |
| `npm run dist` | Build + empaquetage Windows (sortie dans `release/`) |
| `npm run dist:win` | Idem, cible Windows explicite |

### API banque (optionnel)

```bash
node backend/server.js
```

Le serveur écoute sur le port `3001` par défaut. Variables : `TINK_CLIENT_ID`, `PORT` (voir `.env.example`).

## Variables d’environnement

Copier `.env.example` vers `.env`. Ne jamais committer le fichier `.env`.

| Variable | Obligatoire | Usage |
|----------|-------------|--------|
| `VITE_SUPABASE_URL` | Oui | URL du projet Supabase (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Oui | Clé anon Supabase (frontend) |
| `VITE_BANK_API_URL` | Non | URL API banque (défaut : `http://localhost:3001`) |
| `TINK_CLIENT_ID` | Non | Connexion bancaire Tink (backend) |
| `PORT` | Non | Port du serveur banque (défaut : 3001) |

Sans Supabase configuré, l’app fonctionne en mode local (localStorage) ; le rapprochement bancaire reste désactivé.

## Electron (atelier)

Les variables `VITE_*` sont **figées au build Vite** (`npm run build`). Copier `.env` **avant** `npm run dist` — l’exe ne relit pas `.env` au démarrage pour Supabase.

1. `copy .env.example .env` puis renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
2. `npm run build` — génère `dist/index.html` et les assets (`base: ./`, compatible `file://`)
3. `npm run electron` — ouvre la fenêtre desktop (HashRouter automatique en `file://`)
4. `npm run dist` — installeur Windows NSIS dans `release/`

Sans dossier `dist/`, Electron affiche une page d’erreur avec les étapes à suivre.

Configuration : `electron.cjs`, cible `com.accreation.crm`, icône `public/icon.ico`.

## Configurateur t-shirt → Devis

| Contexte | Route | Comportement « Créer un devis » |
|----------|-------|----------------------------------|
| Public (web) | `/configurateur-tshirt` | Brouillon `localStorage` + lien vers `/devis` (même navigateur) |
| CRM / Electron | `/t-shirt-3d` | Navigation directe vers Devis avec lignes pré-remplies |

Le devis inclut taille, couleur, techniques (DTF / UV-DTF / Flex), quantité et estimation HT par marquage.

## Routes

| Page | Chemin | Description |
|------|--------|-------------|
| Dashboard | `/dashboard` | Tableau de bord |
| Clients | `/clients` | Fiches clients |
| Produits | `/produits` | Catalogue produits |
| Étiquettes | `/etiquettes` | Impression étiquettes |
| Scan | `/scan` | Scan QR / codes-barres |
| Catégories | `/categories` | Catégories produits |
| Devis | `/devis` | Devis |
| Factures | `/factures` | Factures |
| Utilisateurs | `/utilisateurs` | Gestion des comptes CRM |
| Paramètres | `/parametres` | Réglages société |
| Import | `/import` | Import Excel |
| Sauvegardes | `/sauvegardes` | Backups cloud |
| Journal | `/journal` | Logs d’activité |
| Calculateur 3D | `/calculateur-3d` | Estimation impression 3D |
| Vue 3D | `/vue-3d` | Prévisualisation 3D |
| T-shirt 3D | `/t-shirt-3d` | Configurateur t-shirt |
| Banque | `/banque` | Rapprochement bancaire |
| Configurateur public | `/configurateur-tshirt` | Route publique (sans auth CRM) |

En mode Electron (`file://`), le routeur utilise le hash (`#/dashboard`, etc.).

## Rôles et permissions

Définis dans `src/utils/permissions.js`. L’auth passe par Supabase ; le rôle est résolu depuis la table `users` (emails admin hardcodés → rôle **Admin**).

| Rôle | Pages accessibles | Droits |
|------|-------------------|--------|
| **Admin** | Toutes | Suppression, paramètres, utilisateurs, import |
| **Employé** | Dashboard, clients, produits, étiquettes, scan, devis, factures, banque, calculateur 3D | Lecture/écriture métier, pas de suppression globale |
| **Comptable** | Dashboard, factures, banque | Comptabilité et rapprochement |
| **Utilisateur** | Dashboard uniquement | Consultation limitée |

## Supabase

Script SQL unique (tables CRM + `bank_transactions` + RLS) : **[docs/supabase-migration.sql](docs/supabase-migration.sql)**. Référence détaillée : **[docs/SUPABASE.md](docs/SUPABASE.md)**.

## Structure utile

```
src/
  supabase.js              # Client Supabase
  services/supabaseSync.js # Sync CRM ↔ cloud
  utils/permissions.js     # Rôles
  utils/routes.js          # Chemins et helpers routeur
  utils/bankTransactionSync.js  # Rapprochement + snippets SQL
backend/
  server.js                # API Tink (optionnel)
electron.cjs               # Point d’entrée Electron
```
