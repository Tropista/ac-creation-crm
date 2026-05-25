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
| `npm run dist:win` | Build Vite + installeur Windows NSIS dans `release/` (lancer localement après bump de version) |
| `npm run dist:win -- --publish always` | Build + publication GitHub Releases (nécessite `GH_TOKEN`) |

### API banque (optionnel)

```bash
npm run bank
```

Le serveur écoute sur **`127.0.0.1:3001`** par défaut (`BANK_HOST=127.0.0.1`). Variables : `TINK_CLIENT_ID`, `PORT` (voir `.env.example`).

**Important :** l’API Tink n’est pas conçue pour un déploiement cloud public — réservée à Electron ou au poste local (`npm run bank`). Le frontend web (Vercel) peut afficher la page Banque avec saisie manuelle si Supabase est configuré, mais la connexion Tink automatique requiert le backend local.

## Publication automatique (tags `v*`)

Le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) se déclenche sur un tag `vX.Y.Z` :

1. lint + tests + build Vite
2. `electron-builder --win --publish always` → GitHub Release avec `.exe` et `latest.yml`

Secrets recommandés dans **Settings → Secrets → Actions** :

| Secret | Usage |
|--------|--------|
| `GITHUB_TOKEN` | Fourni automatiquement (permissions `contents: write`) |
| `VITE_SUPABASE_URL` | Build installeur avec sync cloud |
| `VITE_SUPABASE_ANON_KEY` | Idem |

Alternative manuelle : `GH_TOKEN=<token repo> npm run dist:win -- --publish always`

## RLS Supabase par rôle

Migration optionnelle : [`supabase/migrations/20260525180000_role_based_rls.sql`](supabase/migrations/20260525180000_role_based_rls.sql)

- **Comptable** : lecture factures, dépenses, banque
- **Employé** : pas de DELETE sur `users` / `settings`
- **Admin** : accès complet

Les permissions UI (`src/utils/permissions.js`) restent la première barrière.

## PWA / tablette

- `public/manifest.json` + service worker minimal (`public/sw.js`) — installable en navigateur
- Electron : `minWidth` 768 px pour usage atelier tablette

## Realtime Supabase (atelier)

L’Atelier s’abonne aux changements `quotes` / `invoices` si Supabase est configuré. Activer la réplication Realtime sur ces tables dans le dashboard Supabase (Database → Replication). Sinon, la resync manuelle reste disponible.

## Export fiduciaire Luxembourg

Depuis **Dépenses** ou **Paramètres** : export CSV mensuel (UTF-8 BOM, séparateur `;`) avec journal des ventes (factures, type acompte/solde, devis parent), journal des achats et récapitulatif TVA.

## E-facturation LU (Peppol)

Export **UBL stub** depuis Paramètres (non certifié Peppol). Intégration réseau Peppol : évolution future.

## Commandes fournisseur (réassort)

Dashboard → alertes stock : bouton **Commander** par produit, export CSV bon de commande.

## Variables d’environnement

Copier `.env.example` vers `.env`. Ne jamais committer le fichier `.env`.

| Variable | Obligatoire | Usage |
|----------|-------------|--------|
| `VITE_SUPABASE_URL` | Oui | URL du projet Supabase (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Oui | Clé anon Supabase (frontend) |
| `VITE_BANK_API_URL` | Non | URL API banque (défaut : `http://localhost:3001`) |
| `TINK_CLIENT_ID` | Non | Connexion bancaire Tink (backend) |
| `PORT` | Non | Port du serveur banque (défaut : 3001) |
| `BANK_HOST` | Non | Hôte d'écoute (défaut : `127.0.0.1` — ne pas changer en prod cloud) |

Sans Supabase configuré, l’app fonctionne en mode local (localStorage) ; le rapprochement bancaire reste désactivé.

## Déploiement web (Vercel)

Le dépôt inclut `vercel.json` (rewrite SPA, build Vite, **déploiements Git Vercel désactivés**) et un job CI **`deploy-vercel`** déclenché à chaque push sur `main` (après lint, tests et build).

`git.deploymentEnabled: false` dans `vercel.json` empêche l’intégration Git Vercel de déployer en parallèle du job GitHub Actions (source fréquente de page blanche : `index.html` et chunks JS de builds différents). Seul le job CI publie la production via `vercel build` + `vercel deploy --prebuilt --prod`.

### Secrets GitHub à configurer

Dans **Settings → Secrets and variables → Actions** du dépôt :

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Token Vercel ([Account → Tokens](https://vercel.com/account/tokens)) |
| `VERCEL_ORG_ID` | ID d’équipe ou de compte (`.vercel/project.json` ou `vercel link`) |
| `VERCEL_PROJECT_ID` | ID du projet Vercel |
| `VITE_SUPABASE_URL` | URL Supabase pour le build web (recommandé en prod) |
| `VITE_SUPABASE_ANON_KEY` | Clé anon Supabase pour le build web |

Sans `VERCEL_*`, le job de déploiement échoue — les autres jobs CI (lint, tests, build) restent indépendants.

Le build Vite utilise `base: "/"` lorsque `VERCEL=1` (défini dans le job CI). En local / Electron, `base: "./"` est conservé (`vite.config.js`).

Premier déploiement manuel possible avec `npx vercel link` puis `npx vercel --prod` depuis la racine du projet.

### Domaine personnalisé (ex. crm.ac-creation.lu)

Voir le guide détaillé [docs/DEPLOOIEMENT.md](docs/DEPLOOIEMENT.md) : ajout du domaine dans Vercel → **Settings → Domains**, enregistrement DNS CNAME `crm` → `cname.vercel-dns.com`, vérification HTTPS et routes SPA (`/devis`, `/factures`, etc.). Aucun achat de domaine côté code — configuration dans le tableau de bord Vercel et chez votre registrar.

**Page blanche après déploiement ?** Vérifier dans [Vercel → Deployments](https://vercel.com/dashboard) que la production pointe bien sur le dernier commit (`main`). Puis vider le cache navigateur (**Ctrl+Shift+R**) ou DevTools → Application → Service Workers → *Unregister* (l’ancien SW pouvait servir un `index.html` obsolète référençant des chunks JS supprimés).

## Electron (atelier)

Les variables `VITE_*` sont **figées au build Vite** (`npm run build`). Copier `.env` **avant** `npm run dist` — l’exe ne relit pas `.env` au démarrage pour Supabase.

1. `copy .env.example .env` puis renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
2. `npm run build` — génère `dist/index.html` et les assets (`base: ./`, compatible `file://`)
3. `npm run electron` — ouvre la fenêtre desktop (HashRouter automatique en `file://`)
4. `npm run dist` — installeur Windows NSIS dans `release/`

Sans dossier `dist/`, Electron affiche une page d’erreur avec les étapes à suivre.

Configuration : `electron.cjs`, cible `com.accreation.crm`, icône `public/icon.ico`.

### Mises à jour automatiques (Electron)

Les mises à jour automatiques ne fonctionnent **que dans l’installeur Windows** (`release/*.exe`), pas avec `npm run electron` en développement.

Au démarrage, l’app vérifie GitHub Releases ([Tropista/ac-creation-crm](https://github.com/Tropista/ac-creation-crm)). Si une version plus récente existe, elle est téléchargée en arrière-plan. Une bannière **Mise à jour disponible** apparaît dans **Paramètres** avec un bouton **Redémarrer pour mettre à jour**.

**Publier une nouvelle version :**

1. Incrémenter `"version"` dans `package.json` (ex. `1.0.3`).
2. Copier `.env` et lancer `npm run dist:win` — génère dans `release/` :
   - `AC Creation CRM Setup x.x.x.exe`
   - `latest.yml` (métadonnées auto-update)
3. Créer une **GitHub Release** avec un tag `vX.Y.Z` (ex. `v1.0.3`) sur le dépôt.
4. Joindre **`latest.yml`** et **`AC Creation CRM Setup x.x.x.exe`** aux assets de la release.

Publication automatique (optionnel) : définir `GH_TOKEN` (token GitHub avec droits `repo`) puis `npm run dist:win -- --publish always`.

Sans connexion Internet, sans release publiée ou sans config publish au build, la vérification est ignorée silencieusement.

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
