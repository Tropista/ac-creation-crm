# API privée d'intégration CRM

## Architecture

```text
Site AC Création
  → CRM Sync Engine
  → /api/integration/v1
  → validation + HMAC + anti-rejeu
  → CRMEventApplicationService
  → Application Services métier
  → SupabaseCrmIntegrationRepository
  → Supabase (source de vérité)
```

L'API est servie par le serveur Express existant du CRM. Elle n'importe jamais React, Electron ou Vite. Aucun endpoint ne contient de règle métier : `/events` délègue exclusivement à `CRMEventApplicationService`, qui compose les autres Application Services.

## Configuration

Variables serveur obligatoires :

```dotenv
CRM_SUPABASE_URL=https://project.supabase.co
CRM_SUPABASE_SERVICE_ROLE_KEY=secret-service-role
CRM_HMAC_KEY_ID=site
CRM_HMAC_SECRET=minimum-32-random-bytes
CRM_HMAC_TTL_MS=300000
```

Appliquer auparavant `supabase/migrations/20260804000000_crm_integration_api.sql`. La Service Role ne doit jamais être préfixée par `VITE_`, exposée au navigateur ou transmise au site.

## Authentification HMAC

Chaque route exige :

- `X-CRM-Key-Id`
- `X-CRM-Timestamp` : epoch en millisecondes
- `X-CRM-Nonce` : valeur aléatoire de 16 à 128 caractères
- `X-CRM-Signature` : SHA-256 hexadécimal

Chaîne signée :

```text
<timestamp>.<nonce>.<corps HTTP brut>
```

Pour une requête GET, le corps est une chaîne vide. Le serveur utilise une comparaison en temps constant. Un timestamp hors TTL est refusé. Le couple `(key_id, nonce)` est réservé dans Supabase avec une contrainte unique : sa réutilisation reste impossible après un redémarrage ou sur plusieurs instances.

## Endpoints

### `GET /api/integration/v1/health`

Retourne l'état de l'application, de la base, des repositories, des services, de l'atelier et de la production. Un échec de lecture Supabase produit HTTP 503 ; HTTP 200 signifie que tous les contrôles ont réussi.

### `GET /api/integration/v1/version`

Retourne `version`, `build`, `commit`, `date` et `environment`.

### `GET /api/integration/v1/status`

Retourne `healthy`, l'uptime, les compteurs d'événements, événements en attente, dead letters et retries, ainsi que l'état production/atelier et la version.

### `POST /api/integration/v1/events`

Enveloppe versionnée :

```json
{
  "version": "1.0",
  "id": "evt_unique",
  "type": "customer.created",
  "occurredAt": "2026-08-04T10:00:00.000Z",
  "payload": {}
}
```

Types acceptés : `customer.created`, `customer.updated`, `order.created`, `order.updated`, `payment.completed`, `payment.failed`, `production.created`, `production.updated`.

L'identifiant est la clé d'idempotence durable. Une nouvelle demande retourne HTTP 202. Un événement déjà connu retourne HTTP 200 avec `duplicate: true`, sans retraitement.

### `POST /api/integration/v1/ack`

```json
{
  "version": "1.0",
  "eventId": "evt_unique",
  "receivedAt": "2026-08-04T10:00:01.000Z",
  "metadata": {}
}
```

L'ACK est idempotent par `eventId` et prépare une future synchronisation bidirectionnelle.

## Transactions et rollback

Les Application Services calculent un nouvel état dans `CrmStateRepository`. Une exception restaure le snapshot précédent. Les modifications de collections sont ensuite envoyées en une seule RPC `persist_crm_integration_state`, donc dans une transaction PostgreSQL unique. L'événement n'est marqué `completed` qu'après cette transaction.

## Journalisation

Chaque appel écrit dans `crm_integration_logs` : date, IP, méthode, chemin, identifiant d'événement, durée, résultat et code d'erreur. Le corps, la signature, les clés et secrets ne sont jamais enregistrés.

## Codes d'erreur principaux

| Code                            | HTTP | Signification                |
| ------------------------------- | ---: | ---------------------------- |
| `CRM_AUTH_HEADERS_REQUIRED`     |  401 | Headers incomplets           |
| `CRM_AUTH_KEY_UNKNOWN`          |  401 | Key ID inconnu               |
| `CRM_AUTH_SIGNATURE_INVALID`    |  401 | Signature incorrecte         |
| `CRM_AUTH_TIMESTAMP_EXPIRED`    |  401 | Timestamp hors TTL           |
| `CRM_AUTH_NONCE_REPLAYED`       |  409 | Nonce déjà consommé          |
| `CRM_EVENT_VERSION_UNSUPPORTED` |  400 | Version non supportée        |
| `CRM_EVENT_TYPE_UNSUPPORTED`    |  400 | Type inconnu                 |
| `CRM_EVENT_PAYLOAD_INVALID`     |  400 | Payload invalide             |
| `CRM_ACK_EVENT_NOT_FOUND`       |  404 | Événement à acquitter absent |

Les erreurs ne contiennent jamais de secret ni de stack trace.

## Flux commande complet

Le site envoie une version `1.0` et l'un des types suivants : `customer.created`, `customer.updated`, `order.created`, `payment.completed`, `production.created`, `production.updated`. Une commande contient le client, les adresses, les lignes, les snapshots, les personnalisations, les polices, les ressources, la production, le paiement, les taxes et les totaux.

`order.created` orchestre exclusivement les Application Services : upsert client, commande/devis acceptÃ©, facture brouillon, paiement, entrÃ©e atelier et suivi production. Le handler HTTP ne contient aucune mutation mÃ©tier et le repository persiste l'ensemble via la RPC transactionnelle.

La rÃ©ponse contient `customerId`, `orderId`, `invoiceId`, `workshopId`, `productionId`, `status` et `version`. Le rejeu du mÃªme `event.id` retourne la rÃ©ponse enregistrÃ©e sans recrÃ©er de document. Une erreur conserve l'Ã©vÃ©nement en statut `failed` et la transaction empÃªche toute persistance partielle.

## Mise en service locale

1. Appliquer `supabase/migrations/20260804000000_crm_integration_api.sql` au projet Supabase du CRM.
2. Renseigner cÃ´tÃ© CRM `CRM_SUPABASE_URL`, `CRM_SUPABASE_SERVICE_ROLE_KEY`, `CRM_HMAC_KEY_ID` et `CRM_HMAC_SECRET`.
3. Renseigner cÃ´tÃ© site l'endpoint complet, le mÃªme identifiant de clÃ© et le mÃªme secret.
4. DÃ©marrer le CRM sur le port 3001 et valider `/health` avec une requÃªte signÃ©e.
5. Activer les flags du site et passer une commande sandbox.

Sans service role CRM, le serveur indique explicitement que l'API est inactive. Cette protection ne doit jamais Ãªtre contournÃ©e avec la clÃ© anon.

## DÃ©veloppement local

| Processus               | Commande           | Adresse                 |
| ----------------------- | ------------------ | ----------------------- |
| SPA CRM                 | `npm run dev:spa`  | `http://localhost:5173` |
| API CRM                 | `npm run api:dev`  | `http://127.0.0.1:3001` |
| SPA et API              | `npm run dev`      | ports 5173 et 3001      |
| Validation HTTP signÃ©e | `npm run api:test` | cinq endpoints v1       |

Vite ne relaie pas l'API et son fallback HTML ne constitue jamais une rÃ©ponse d'intÃ©gration. Les cinq endpoints sont servis exclusivement par `backend/server.js`. Le test runtime vÃ©rifie le type JSON, HMAC valide/invalide, timestamp expirÃ©, rejeu de nonce, duplicata d'Ã©vÃ©nement et accusÃ© de rÃ©ception.

Si le runtime retourne `Could not find the table 'public.crm_integration_nonces' in the schema cache`, appliquer la migration au projet rÃ©fÃ©rencÃ© par `CRM_SUPABASE_URL`, puis exÃ©cuter `NOTIFY pgrst, 'reload schema';` dans le SQL Editor avant de relancer l'API. La prÃ©sence de la migration dans Git ne prouve pas son application au projet configurÃ©.
