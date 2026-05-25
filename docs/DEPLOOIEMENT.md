# Déploiement web — AC Creation CRM

Guide pour publier le CRM sur Vercel et y associer un domaine personnalisé (ex. `crm.ac-creation.lu`).

## Prérequis

- Compte [Vercel](https://vercel.com)
- Accès au dépôt GitHub du projet
- Accès DNS du domaine `ac-creation.lu` (ou autre)

Le fichier `vercel.json` à la racine configure déjà :

- build Vite (`npm run build`, sortie `dist/`)
- rewrites SPA vers `index.html` (routes `/devis`, `/factures`, etc.)
- en-têtes cache pour assets et service worker

Aucune modification n'est requise dans `vercel.json` pour un domaine personnalisé : les rewrites s'appliquent à toutes les URLs du projet.

## Déploiement initial

1. Lier le projet : `npx vercel link` (racine du dépôt).
2. Configurer les variables d'environnement Vercel :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Déployer :
   - **Recommandé** : push sur `main` → job GitHub Actions `deploy-vercel`
   - **Manuel** : `npx vercel --prod` après `npm run build`

Voir aussi la section « Déploiement web (Vercel) » du [README](../README.md) pour les secrets GitHub (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

## Domaine personnalisé `crm.ac-creation.lu`

Projet Vercel : **`ac-creation-crm`**. L'achat du domaine se fait chez votre registrar (DNS.lu, OVH, Gandi, etc.) — Vercel n'achète pas le domaine pour vous.

**Aucune modification de code** n'est requise : sur le web (Vercel), l'app utilise `BrowserRouter` et `base: "/"` ; seul Electron (`file://`) bascule en `HashRouter` (`src/components/AppRouter.jsx`, `vite.config.js`).

### Checklist rapide

- [ ] Domaine `crm.ac-creation.lu` ajouté dans Vercel → **Settings** → **Domains**
- [ ] Enregistrement DNS **CNAME** `crm` → `cname.vercel-dns.com` (ou valeur exacte affichée par Vercel)
- [ ] Statut Vercel : **Valid Configuration** (icône verte)
- [ ] HTTPS actif (cadenas) sur `https://crm.ac-creation.lu`
- [ ] Routes SPA testées : `/`, `/devis`, `/factures` (F5 sans 404)
- [ ] *(Optionnel)* Redirection `ac-creation-crm.vercel.app` → `crm.ac-creation.lu`

### 1. Ajouter le domaine dans Vercel

1. Ouvrir [vercel.com/dashboard](https://vercel.com/dashboard) → projet **`ac-creation-crm`**.
2. **Settings** → **Domains**.
3. Saisir `crm.ac-creation.lu` → **Add**.
4. Vercel affiche les enregistrements DNS à créer. Pour un **sous-domaine** (`crm.…`), la configuration recommandée est presque toujours :
   - **Type** : CNAME
   - **Nom / Host** : `crm` (parfois `crm.ac-creation.lu` selon le registrar — voir ci-dessous)
   - **Valeur / Target** : `cname.vercel-dns.com` (ou la cible exacte indiquée par Vercel)

> **Ne pas** pointer la racine `ac-creation.lu` vers Vercel sauf si vous souhaitez héberger le site principal sur Vercel. Ici seul le sous-domaine `crm` est concerné.

### 2. Configurer le DNS chez le registrar

| Type  | Nom (host) | Valeur (cible)           | TTL      |
|-------|------------|--------------------------|----------|
| CNAME | `crm`      | `cname.vercel-dns.com`   | 3600 (défaut) |

**DNS.lu** (registrar `.lu` courant) :

1. Connexion sur [dns.lu](https://www.dns.lu) → domaine `ac-creation.lu`.
2. Zone DNS → **Ajouter un enregistrement** → type **CNAME**.
3. **Nom** : `crm` (sans le domaine parent si le formulaire l'ajoute automatiquement).
4. **Cible** : `cname.vercel-dns.com.` (point final optionnel selon l'interface).
5. Enregistrer. Propagation : souvent 5–30 min, parfois jusqu'à 48 h.

**OVH** : Zone DNS du domaine → ligne **CNAME** → sous-domaine `crm` → cible `cname.vercel-dns.com`.

**Gandi** : Enregistrements DNS → **Ajouter** → CNAME, nom `@` remplacé par `crm`, valeur `cname.vercel-dns.com`.

**Si CNAME impossible** (cas rare sur un sous-domaine) : suivre les instructions Vercel pour un enregistrement **A** vers l'IP affichée (souvent `76.76.21.21`). Ne pas mélanger A et CNAME sur le même nom `crm`.

Retourner dans Vercel → **Domains** : le statut passe de « Pending » à **Valid Configuration** une fois le DNS propagé. Bouton **Refresh** si besoin.

### 3. HTTPS (SSL)

Vercel provisionne automatiquement un certificat Let's Encrypt pour `crm.ac-creation.lu` dès que le DNS est valide. Aucune action manuelle (pas de certificat à importer chez le registrar).

### 4. Vérifier le SPA

Après activation du domaine, tester dans un navigateur (navigation privée ou Ctrl+Shift+R) :

- `https://crm.ac-creation.lu/` → tableau de bord
- `https://crm.ac-creation.lu/devis` → page devis
- `https://crm.ac-creation.lu/devis?id=<id-devis>` → ouverture du devis (lien partageable staff)
- `https://crm.ac-creation.lu/factures` → page factures

Un rechargement direct (F5) sur une route profonde ne doit **pas** renvoyer une 404 : le rewrite `vercel.json` sert `index.html` pour toutes les routes hors `/assets/` et `/api/`.

### 5. Redirections (optionnel)

**URL Vercel par défaut** — rediriger `ac-creation-crm.vercel.app` vers le domaine custom :

1. **Settings** → **Domains** → ajouter `ac-creation-crm.vercel.app` si absent.
2. Cliquer sur **⋯** à côté du domaine → **Edit** → **Redirect to** → `https://crm.ac-creation.lu` (301).

**www** — si vous ajoutez `www.crm.ac-creation.lu`, rediriger vers `crm.ac-creation.lu` de la même façon dans **Domains**.

## Dépannage

| Symptôme | Piste |
|----------|--------|
| Page blanche | Vérifier le dernier déploiement prod ; vider le cache (Ctrl+Shift+R) ; désinscrire l'ancien service worker |
| 404 sur `/devis` | Confirmer que `vercel.json` est bien déployé ; pas de règle DNS pointant ailleurs |
| Domaine « Pending » | Attendre propagation DNS ; vérifier CNAME sans typo |
| Build OK mais ancienne version | `git.deploymentEnabled: false` — seul le CI GitHub doit publier la prod |

## Variables utiles en production

| Variable | Rôle |
|----------|------|
| `VERCEL=1` | Défini par le CI pour `base: "/"` dans Vite |
| `VITE_SUPABASE_*` | Sync cloud et auth |

Sans Supabase, l'application fonctionne en localStorage côté navigateur.
