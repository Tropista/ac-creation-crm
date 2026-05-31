# Archive — Configurateurs 3D (Vue3D + Vue3DTshirt)

Copie de sauvegarde des composants **Configurateur Mug 3D** (`Vue3D`) et **Configurateur T-shirt 3D** (`Vue3DTshirt`), avec leurs dépendances directes.

> **Note :** Les originaux dans `src/` et `public/` n'ont **pas** été modifiés ni supprimés. Ce dossier est une archive autonome à des fins de référence, migration ou restauration.

## Choix du nom et emplacement

| Décision | Valeur |
|----------|--------|
| Dossier | `archive/configurateurs-3d/` |
| Raison | Reprend les libellés CRM (« Configurateur Mug 3D », « Configurateur T-shirt 3D ») ; le préfixe `archive/` indique clairement qu'il s'agit d'une copie, pas du code actif. |

## Composants canoniques

| Composant | Chemin original | Rôle |
|-----------|-----------------|------|
| **Vue3D** | `src/components/Vue3D.jsx` | Configurateur mug 3D (éditeur 2D type Zakeke + aperçu Three.js sur modèle GLTF) |
| **Vue3D styles** | `src/components/Vue3D.css` | Styles `.vue3d-*` du mug |
| **Vue3DTshirt** | `src/components/Vue3DTshirt.jsx` | Configurateur t-shirt 3D (zones avant/dos/manches, devis, mode public) |
| **Vue3DTshirt styles** | `src/components/Vue3DTshirt.css` | Styles `.tshirt3d-*` du t-shirt |

## Graphe d'imports

```
Vue3D.jsx
├── Vue3D.css
├── ./3d/Product3DErrorBoundary
├── ../utils/assets          → MUG_MODEL_URL (models/scene.gltf)
├── ../utils/toast
├── ./CalculatorProjectLibrary
└── ../utils/calculatorProjects → CALCULATOR_TYPES.vue3d

Vue3DTshirt.jsx
├── Vue3DTshirt.css
├── ./3d/Product3DErrorBoundary
├── ../utils/assets          → TSHIRT_MODEL_URL (models/tshirt/t-shirt.gltf)
├── ../utils/toast
├── ../utils/quoteDraft      → devis CRM + mode public
├── ../services/leadsService → capture leads publics
├── ../utils/tshirtPricing   → estimation prix HT
└── ../utils/routes          → PUBLIC_TSHIRT_PATH, pageToPath

CalculatorProjectLibrary.jsx
├── ../utils/calculatorProjects
└── ../utils/toast

Product3DErrorBoundary.jsx
└── (aucune dépendance interne)

leadsService.js
└── ../supabase              ⚠ non copié (infra globale CRM)
```

## Fichiers copiés

### Composants React

| Fichier archive | Original | Description |
|-----------------|----------|-------------|
| `src/components/Vue3D.jsx` | `src/components/Vue3D.jsx` | Composant principal mug ; contient `MugModel`, `DesignEditor`, export ZIP |
| `src/components/Vue3D.css` | `src/components/Vue3D.css` | Mise en page éditeur + aperçu mug |
| `src/components/Vue3DTshirt.jsx` | `src/components/Vue3DTshirt.jsx` | Composant principal t-shirt ; contient `TshirtModel`, export PDF/SVG/PNG |
| `src/components/Vue3DTshirt.css` | `src/components/Vue3DTshirt.css` | Mise en page éditeur + aperçu t-shirt |
| `src/components/CalculatorProjectLibrary.jsx` | idem | Bibliothèque de projets sauvegardés (utilisé par Vue3D) |
| `src/components/3d/Product3DErrorBoundary.jsx` | idem | Error boundary affichée si le modèle GLTF ne charge pas |

### Utilitaires & services

| Fichier archive | Original | Description |
|-----------------|----------|-------------|
| `src/utils/assets.js` | idem | `MUG_MODEL_URL`, `TSHIRT_MODEL_URL`, `resolveAssetUrl()` |
| `src/utils/assets.test.js` | idem | Tests unitaires des URLs d'assets |
| `src/utils/toast.js` | idem | Notifications toast (upload, export, erreurs) |
| `src/utils/calculatorProjects.js` | idem | Persistance localStorage des projets calculateur |
| `src/utils/calculatorProjects.test.js` | idem | Tests unitaires |
| `src/utils/quoteDraft.js` | idem | Brouillon devis, navigation vers `/devis` |
| `src/utils/quoteDraft.test.js` | idem | Tests unitaires |
| `src/utils/tshirtPricing.js` | idem | Estimation prix HT par technique (DTF, flex, UV) |
| `src/utils/tshirtPricing.test.js` | idem | Tests unitaires |
| `src/utils/routes.js` | idem | Routes `/vue-3d`, `/t-shirt-3d`, `/configurateur-tshirt` |
| `src/utils/permissions.js` | idem | Pages `vue3d` et `tshirt3d` par rôle |
| `src/services/leadsService.js` | idem | Soumission leads depuis le configurateur public t-shirt |

### Modèles 3D (assets)

| Fichier archive | Original | Description |
|-----------------|----------|-------------|
| `public/models/scene.gltf` | idem | Modèle 3D du mug |
| `public/models/scene.bin` | idem | Buffer binaire du mug |
| `public/models/tshirt/t-shirt.gltf` | idem | Modèle 3D du t-shirt |
| `public/models/tshirt/scene.bin` | idem | Buffer binaire du t-shirt |

### Documentation & patches

| Fichier archive | Original | Description |
|-----------------|----------|-------------|
| `docs/README-CORRECTION.txt` | racine | Notes correction Vue3DTshirt v2 |
| `docs/README-CORRECTION-V3.txt` | racine | Notes correction Vue3DTshirt v3 (miroir, redimensionnement) |
| `docs/App.integration.patch` | racine | Patch d'intégration historique dans App.jsx |

## Intégration CRM (non copiés — références uniquement)

Ces fichiers **référencent** les configurateurs mais ne leur sont pas exclusifs. Ils restent dans le projet actif :

| Fichier | Usage |
|---------|-------|
| `src/App.jsx` | Lazy import `Vue3D` / `Vue3DTshirt`, routes React Router, route publique t-shirt |
| `src/components/Sidebar.jsx` | Entrées menu « Configurateur Mug 3D » / « Configurateur T-shirt 3D » |
| `src/App.css` | Classe partagée `.vue3d-stage` (ligne ~864) |
| `src/supabase.js` | Dépendance de `leadsService.js` pour l'envoi Supabase |

Routes concernées (`src/utils/routes.js`) :
- Mug CRM : `/vue-3d` → page `vue3d`
- T-shirt CRM : `/t-shirt-3d` → page `tshirt3d`
- T-shirt public : `/configurateur-tshirt` → `PUBLIC_TSHIRT_PATH`

## Dépendances npm (externes)

Les composants utilisent notamment :
- `react`, `react-router-dom`
- `@react-three/fiber`, `@react-three/drei`, `three`
- `jspdf` (Vue3DTshirt — export PDF)

## Fichiers exclus (volontairement)

| Fichier | Raison d'exclusion |
|---------|-------------------|
| `src/components/3d/Product3DViewer.jsx` | Utilisé par d'autres modules, **non importé** par Vue3D/Vue3DTshirt |
| `src/components/3d/MugDesignPatch.jsx` | Utilisé par Product3DViewer, pas par Vue3D |
| `src/components/3d/MugCustomizerPreview.jsx` | Idem, non référencé |
| `src/components/3d/Product3DModel.jsx` | Idem, non référencé |
| `src/components/Print3DCalculator.jsx` | Calculateur 3D distinct (impression), pas lié à Vue3D/Vue3DTshirt |
| `src/supabase.js` | Infrastructure globale CRM, pas spécifique aux configurateurs |
| `dist/models/**`, `release/**` | Artefacts de build (copies dérivées de `public/models/`) |
| Tests Vue3D/Vue3DTshirt | Aucun test dédié trouvé dans le dépôt |

## Date de copie

Copie créée le 28 mai 2026 — originaux intacts dans le dépôt principal.
