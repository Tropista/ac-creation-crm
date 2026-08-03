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
