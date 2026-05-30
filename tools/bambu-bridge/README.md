# Pont Bambu Lab (MQTT LAN) — AC Creation CRM

Ce programme Node.js tourne **sur le PC de l'atelier** (même réseau LAN que l'imprimante). Le CRM dans le navigateur ne peut pas se connecter au broker MQTT de Bambu (TLS port 8883, accès LAN uniquement).

## Architecture (résumé)

```
Imprimante Bambu (LAN)
    │  MQTT TLS :8883  topic device/{serial}/report
    ▼
tools/bambu-bridge (Node.js, PC atelier)
    │  POST REST (service role) ou JSON console
    ▼
Supabase bambu_print_jobs  ←── sync ──→  CRM Impression 3D Pro
                                              │
                                              ▼
                                    applyFilamentForPrint (stock)
```

1. L'imprimante publie l'état toutes les ~0,5–2 s sur `device/{serial}/report`.
2. Le pont détecte la **transition** vers `gcode_state === FINISH` (pas chaque rapport MQTT tant que l'imprimante reste en FINISH) et crée **une** ligne `finished` dans `bambu_print_jobs`.
3. Le pont parse aussi `print.ams.ams[].tray[]` (structure ha-bambulab) et pousse l'état des bobines dans `bambu_ams_trays` (throttle 30 s, push immédiat si changement).
4. Dans le CRM, onglet **Bambu Lab → État AMS** : vue 2× AMS × 4 slots, liaison stock, Realtime Supabase.
5. Onglet **File d'attente** : valider **Appliquer au stock** ou **Ignorer**.
6. Le code d'accès LAN reste dans le **stockage local du CRM** (`settings.bambuBridge`), jamais dans git.

## Prérequis imprimante (X1 / P1 / A1 / **H2C**, firmware récent)

Sans ces étapes, MQTT renvoie souvent **« Not authorized »** même si le ping vers l'IP fonctionne.

1. **Mode LAN seul** (ou équivalent « LAN Mode ») : écran imprimante → **Paramètres** → **WLAN / Réseau** → activer **Mode LAN uniquement** (selon modèle).
2. **Mode développeur** : dans le même menu réseau, activer **Mode développeur**, lire l'avertissement, confirmer, puis **redémarrer l'imprimante** (couper l'alimentation ou redémarrage menu).
3. Noter sur papier :
   - **IP LAN** (ex. `192.168.178.21`)
   - **Numéro de série** (15 caractères, ex. `31B8BP611200939`) — **pas** l'adresse MAC Wi‑Fi
   - **Code d'accès LAN** (souvent **6 ou 8 chiffres** uniquement)

> Sur firmware récent, le mode développeur désactive la vérification stricte des commandes MQTT tierces. Voir [wiki Bambu — Developer mode](https://wiki.bambulab.com/en/knowledge-sharing/enable-developer-mode).

### Obtenir le code d'accès LAN (H2C / Studio)

**Sur l'écran de l'imprimante (H2C)**

1. **Paramètres** → **WLAN** ou **Réseau**.
2. Activer **Mode LAN uniquement** si demandé.
3. Activer **Mode développeur** et redémarrer.
4. Le **code d'accès** (Access Code) s'affiche dans les infos réseau / LAN — recopiez **tous** les chiffres, sans espace.

**Dans Bambu Studio (PC)**

1. Connecter l'imprimante (LAN ou lien direct).
2. Panneau imprimantes → sélectionner **H2C** → icône **engrenage** / **Device**.
3. Onglet réseau / **LAN** : noter **IP**, **Serial number**, **Access code** (ou « Code d'accès »).
4. Si le code a changé après activation LAN/développeur, mettre à jour `config.json` **et** le CRM (onglet Bambu Lab).

**Important** : désactiver puis réactiver le mode LAN ou développeur **génère un nouveau code**. Utilisez toujours le code **actuel**.

## Installation

```bash
cd tools/bambu-bridge
npm install
cp config.example.json config.json
```

Éditer `config.json` (voir champs ci-dessous). **Ne pas** laisser `accessCode` à `000000` ou `12345678` (valeurs d'exemple).

### Fichier `config.json` — champs exacts

| Champ | Obligatoire | Exemple (H2C) | Description |
|-------|-------------|---------------|-------------|
| `host` | oui | `192.168.178.21` | IP LAN de l'imprimante (ping OK depuis le PC). |
| `serial` | oui | `31B8BP611200939` | Numéro de série imprimante (topic MQTT). |
| `accessCode` | oui | `482917` ou `48291763` | Code LAN **chiffres seuls**, 6 ou 8 selon firmware. |
| `printerId` | non | *(omis)* | Même id que l'imprimante dans le CRM (Bambu Lab). **Si omis**, le pont utilise le `serial`. Ne pas laisser la valeur d'exemple `optionnel-id-crm`. |
| `model` | non | `H2C` | Libellé libre. |
| `gramsDefault` | non | `50` | Grammes par défaut si non détectés dans MQTT. |
| `supabaseUrl` | non | `https://xxx.supabase.co` | URL projet (jobs cloud). |
| `supabaseServiceKey` | non | `eyJ...` ou `sb_secret_...` | Clé backend privilégiée : JWT **service_role** (legacy) **ou** nouvelle **Secret key** (`sb_secret_…`, Project Settings → API → Secret keys). **Pas** la clé `anon` / publishable du front CRM. Les en-têtes REST utilisent la même valeur pour `apikey` et `Authorization: Bearer`. |

Paramètres MQTT utilisés par le pont (alignés Home Assistant / ha-bambulab) :

- Port **8883**, protocole **MQTTS**
- Utilisateur **`bblp`**
- Mot de passe = **`accessCode`**
- `clientId` = `bblp_{serial}`
- Topics : `device/{serial}/report` et `device/{serial}/request`
- TLS : certificat imprimante auto-signé → `rejectUnauthorized: false`

Variables d'environnement optionnelles (prioritaires sur `config.json`) :

| Variable | Description |
|----------|-------------|
| `BAMBU_HOST` | IP LAN de l'imprimante |
| `BAMBU_SERIAL` | Numéro de série |
| `BAMBU_ACCESS_CODE` | Code d'accès LAN |
| `BAMBU_PRINTER_ID` | ID imprimante dans le CRM (sinon = serial) |
| `BAMBU_GRAMS_DEFAULT` | Grammes par défaut si non détectés (défaut 50) |
| `SUPABASE_URL` | URL projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service_role **ou** Secret key `sb_secret_…` (serveur uniquement, **ne pas** commiter) |

## Lancer le pont

```bash
npm run validate   # vérifie host / serial / accessCode sans se connecter
npm start
```

Au démarrage, le pont affiche un avertissement si `accessCode` est encore un placeholder (`000000`, `12345678`, etc.).

Laisser la fenêtre ouverte pendant les impressions. Le CRM peut rester ouvert dans le navigateur ; le pont est indépendant.

### Test sans imprimante

```bash
npm run simulate
```

Ou dans le CRM : **Simuler fin d'impression** (onglet Bambu).

### Tests unitaires (logique MQTT / config)

```bash
npm test
```

Couvre la config MQTT, la déduplication FINISH (`index.test.js`) et le parse AMS (`amsSync.test.js`).

## Synchronisation avec le CRM

1. Exécuter dans **Supabase → SQL Editor** (dans l'ordre) :
   - `supabase/migrations/20260530150000_bambu_print_bridge.sql`
   - `supabase/migrations/20260530150100_bambu_bridge_rls_service.sql`
   - `supabase/migrations/20260530160000_bambu_ams_trays.sql`
2. Dans **Impression 3D Pro → Bambu Lab → Connexion**, enregistrer l'imprimante et le code d'accès (stockage local).
3. **Aligner l'id imprimante** : l'id affiché dans le CRM (UUID ou libellé choisi à la création) doit être identique à `printerId` dans `config.json`, **ou** omettez `printerId` dans `config.json` pour que le pont utilise le numéro de série (`serial`) — dans ce cas, créez l'imprimante dans le CRM avec le même id que le `serial` (ex. `31B8BP611200939`).
4. Synchroniser le cloud depuis le CRM (les imprimantes passent dans `bambu_printers` via `pushBambuChangesToSupabase`). Au démarrage, le pont peut aussi **créer** la ligne imprimante en base si elle n'existe pas encore (`ensurePrinterRegistered`).
5. Mapper les emplacements **AMS1 A1–A4** et **AMS2 A1–A4** vers les bobines du stock (onglet Connexion).
6. Démarrer `npm start` sur le PC atelier — l'onglet **État AMS** affiche matière, couleur, RFID, reste estimé et liaison CRM.
7. Démarrer le pont avant d'imprimer pour la file d'attente FINISH.

## Guide utilisateur — État AMS en direct (CRM)

**Cas typique : H2C + 2× AMS 2 Pro (8 slots)**

1. **Migration Supabase** : exécuter `20260530160000_bambu_ams_trays.sql` (table `bambu_ams_trays` + colonne `ams_unit` sur les mappings).
2. **Pont atelier** : `cd tools/bambu-bridge && npm start` (même `serial` / `printerId` que le CRM).
3. **CRM → Impression 3D Pro → Bambu Lab → État AMS** :
   - Sélectionner l'imprimante (ex. H2C `31B8BP611200939`).
   - Voir **AMS1** et **AMS2**, chaque slot **A1–A4** : matière, pastille couleur, RFID, reste en g / % avec badge **estimé AMS**.
   - **Actualiser** ou attendre la sync Realtime (debounce ~700 ms).
4. **Lier au stock** : menu « Lier une bobine… » ou **Créer bobine** (pré-remplit nom, matière, emplacement `AMS 1` / `AMS 2`, grammes estimés si connus).
5. **Mapping persistant** : onglet **Connexion Bambu** — associer chaque slot aux bobines pour la déduction auto à la fin d'impression.

> Les valeurs `remain` / `remain_g` viennent du firmware Bambu (souvent % × poids bobine RFID). Elles ne remplacent pas le stock CRM tant que vous n'avez pas validé une impression dans la file d'attente.

### Champs MQTT parsés (réf. ha-bambulab)

| Chemin MQTT | Usage CRM |
|-------------|-----------|
| `print.ams.ams[n].id` | Unité AMS (0 = AMS1, 1 = AMS2) |
| `print.ams.ams[n].tray[i].id` | Slot A1–A4 (0–3) |
| `tray_type` / `tray_info_idx` | Matière |
| `tray_color` / `cols[0]` | Couleur (RRGGBBAA) |
| `tag_uid` | RFID bobine |
| `remain` + `tray_weight` | % restant → grammes estimés |

### `printerId` et erreur 409 (clé étrangère)

Si le pont affiche `Supabase REST 409` avec `bambu_print_jobs_printer_id_fkey`, l'id envoyé dans les jobs n'existe pas dans `bambu_printers`.

**Option A — CRM d'abord**

1. Onglet **Bambu Lab** : ajoutez l'imprimante (IP, série, nom).
2. Notez son **id** (généré à la création, visible dans les données / export si besoin).
3. Mettez exactement cet id dans `config.json` → `"printerId": "…"`.
4. Sauvegardez le CRM et laissez la sync cloud pousser `bambu_printers`.
5. Redémarrez le pont : `npm start`.

**Option B — Série comme id (plus simple)**

1. Dans `config.json`, **supprimez** la ligne `printerId` (ou mettez la même valeur que `serial`).
2. Dans le CRM, créez l'imprimante en utilisant le **numéro de série** comme id si l'interface le permet, ou laissez le pont créer la ligne au démarrage puis resynchronisez depuis le CRM.
3. `npm run validate` puis `npm start`.

## Limitations (MVP)

- Pas d'API cloud Bambu dans le navigateur (choix sécurité / LAN).
- Les grammes réels ne sont pas toujours dans le flux MQTT : valeur par défaut (`gramsDefault` / saisie CRM) ou import 3MF manuel.
- Un seul profil imprimante par `config.json` (multi-imprimantes : plusieurs instances ou extension future).
- Le pont ne modifie pas le stock directement : validation humaine dans la file d'attente.
- `access_code_encrypted` en base = mention « stocké localement » ; le secret reste dans le CRM local.

## Dépannage

| Symptôme | Piste |
|----------|--------|
| `Not authorized` / connexion refusée | Code LAN faux, mode développeur off, imprimante non redémarrée après activation LAN, ou `accessCode` encore `12345678` / `000000` dans config.json |
| Ping OK mais pas de MQTT | Port 8883 ; pare-feu Windows ; attendre 30–60 s après allumage |
| Aucun message après connexion | Mauvais `serial` (MAC au lieu du numéro de série) — topic doit être `device/31B8BP611200939/report` |
| Aucun job dans le CRM | Vérifier Supabase URL/clé service, Realtime, sync cloud |
| État AMS vide dans le CRM | Migration `20260530160000` appliquée ? Pont `npm start` actif ? Même `printerId` / `serial` ? |
| Slots AMS toujours « Vide » | Attendre 30–60 s après `pushall` ; vérifier que les AMS sont allumés et reconnus par l'imprimante |
| `Supabase REST 401` / `42501` / `row-level security` sur `bambu_print_jobs` | **Cause la plus fréquente** : `supabaseServiceKey` = clé **anon** au lieu d'une clé backend. Dans le tableau de bord : Project Settings → API → copier le JWT **service_role** (legacy) **ou** une **Secret key** (`sb_secret_…`). Les deux en-têtes REST doivent utiliser cette même valeur : `Authorization: Bearer <clé>` et `apikey: <clé>`. Exécuter aussi la migration `20260530150100_bambu_bridge_rls_service.sql`, puis `npm run validate` et redémarrer le pont. |
| Pont refuse de démarrer (clé anon) | `npm run validate` affiche une erreur explicite — remplacer la clé dans `config.json` ou `SUPABASE_SERVICE_ROLE_KEY` |
| `Supabase REST 409` / `bambu_print_jobs_printer_id_fkey` | `printerId` invalide ou placeholder (`optionnel-id-crm`). **Corriger** : ajouter l'imprimante dans le CRM (Bambu Lab) avec le même id, ou omettre `printerId` pour utiliser `serial`, puis `npm start` (le pont enregistre l'imprimante si besoin). Message détaillé en français dans la console. |
| Jobs en double | Vérifier que le pont est à jour : un seul job par transition FINISH (pas de cooldown 15 s). Redémarrer `npm start` après mise à jour. Supprimer les doublons manuellement dans Supabase si besoin. |
| Stock non déduit | Mapper AMS + cliquer **Appliquer au stock** |

Exemple `config.json` pour une **Bambu Lab H2C** sur `192.168.178.21` :

```json
{
  "host": "192.168.178.21",
  "serial": "31B8BP611200939",
  "accessCode": "REMPLACER_PAR_CODE_LAN",
  "model": "H2C",
  "gramsDefault": 50,
  "supabaseUrl": "",
  "supabaseServiceKey": ""
}
```

Remplacez `REMPLACER_PAR_CODE_LAN` par le code affiché **après** activation du mode développeur (6 ou 8 chiffres).
