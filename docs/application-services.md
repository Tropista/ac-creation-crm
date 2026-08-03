# Application Services du CRM AC Création

## Architecture

Le CRM conserve ses règles métier existantes et introduit une frontière applicative réutilisable :

```text
React UI
   ↓ commandes et affichage des résultats
Application Services
   ↓ transactions et orchestration des cas d'usage
Repositories
   ↓ persistance
Supabase / snapshot CRM local
```

La future API appellera les mêmes Application Services que l'interface actuelle. Aucun endpoint HTTP n'est créé à cette étape.

## Cartographie des services existants

| Domaine             | Règles et services existants réutilisés                          | Ancienne orchestration UI principale |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| Clients             | `authService`, `clientFileStorage`, validations                  | `Clients.jsx`                        |
| Devis et factures   | `utils/documents`, `utils/invoices`, `utils/companySnapshot`     | `Documents.jsx`                      |
| Numérotation        | `nextDocumentNumber`, `nextInvoiceNumber`                        | `Documents.jsx`                      |
| Paiements           | `utils/payments`, `utils/onlinePayments`                         | `Documents.jsx`, `Banque.jsx`        |
| Atelier             | `utils/production`, `utils/productionPdf`, `utils/quoteDelivery` | `Atelier.jsx`                        |
| Production et stock | `utils/stock`, `utils/quoteMarginAssistant`                      | `Documents.jsx`, `Atelier.jsx`       |
| Synchronisation     | `supabaseSync`, `useCloudSync`, `syncMerge`                      | `App.jsx` et hook de synchronisation |
| Journalisation      | `logService`, `utils/auditTrail`                                 | callback injecté depuis `App.jsx`    |

Les règles de calcul restent dans les modules utilitaires testés. Les Application Services les composent ; ils ne les recopient pas.

## Responsabilités

### CustomerApplicationService

Recherche, création, modification et suppression d'un client dans un snapshot. La clé d'idempotence permet à une future commande distante de rejouer une création sans doublon.

### InvoiceApplicationService

Conversion devis-facture et génération des factures d'acompte ou de solde. Il délègue la numérotation, le stock, les dates et les contraintes aux fonctions historiques de `utils/documents`.

### PaymentApplicationService

Enregistrement d'un paiement courant ou historique. Le ledger et le recalcul de la facture restent fournis par `utils/payments`.

### WorkshopApplicationService

Mise à jour de la fiche atelier, transition de statut, retrait d'une commande et création d'un bon de livraison. Les impacts de stock sont appliqués dans le même résultat d'état.

### ProductionApplicationService

Orchestre l'avancement d'une commande sur le pipeline déjà défini par `utils/production` et délègue l'application atomique au service Atelier.

### OrderApplicationService

Fournit l'enveloppe transactionnelle du futur flux commande → facture → atelier → production → journal. Les étapes sont injectées : le service ne crée aucune nouvelle règle métier. Une exception restaure intégralement le snapshot précédent.

### CRMEventApplicationService

Point d'entrée unique prévu pour les événements provenant du site. Il valide l'enveloppe, choisit un handler injecté, exécute celui-ci dans une transaction et empêche le retraitement d'un identifiant déjà traité pendant la durée de vie du service.

## Repositories

`CrmStateRepository` représente le snapshot métier et garantit le rollback synchrone d'une transaction. Il permet aux tests, à React, à Electron ou à une future API d'utiliser le même contrat.

`SupabaseRepository` centralise les primitives `findById`, `upsert` et `remove`. Les repositories spécialisés pourront l'utiliser progressivement au lieu d'importer le client Supabase dans les composants. Les flux de synchronisation historiques restent inchangés afin d'éviter toute régression de stockage.

## Dépendances

- aucune dépendance à React ;
- aucune dépendance à Vite ;
- aucune dépendance à Electron ;
- fonctions métier historiques injectées ou importées depuis `src/utils` ;
- repository et journal optionnels injectés aux orchestrateurs ;
- aucun accès réseau dans les Application Services.

## Idempotence

Les commandes externes devront fournir une clé stable : identifiant de commande du site, identifiant de paiement ou identifiant d'événement. Les services Client, Paiement, Commande et Événement refusent ou réutilisent un résultat déjà associé à cette clé.

Avant l'ouverture d'une API, les clés traitées par `OrderApplicationService` et `CRMEventApplicationService` devront être persistées dans un repository Supabase dédié. La mémoire locale actuelle prépare le contrat sans introduire de migration ni de table prématurée.

## Transactions

Le repository exécute une opération sur le snapshot courant et ne publie le nouvel état qu'après succès. Toute exception conserve la référence précédente. Pour Supabase, le futur repository serveur devra mapper le même contrat vers une fonction SQL transactionnelle : une succession de requêtes HTTP indépendantes ne sera pas suffisante pour le flux critique.

## Branchement futur de l'API

Une future Route Handler sécurisée devra uniquement :

1. authentifier et vérifier la signature de la requête ;
2. parser l'enveloppe et la clé d'idempotence ;
3. construire les repositories serveur ;
4. appeler `CRMEventApplicationService.handle(event)` ;
5. traduire le résultat ou l'erreur en réponse HTTP.

Elle ne devra contenir aucune règle de client, facture, paiement, atelier ou production.

## Migration progressive restante

Les accès directs encore recensés dans `Banque.jsx`, `UsersAdmin.jsx` et `AuthPage.jsx` concernent respectivement les transactions bancaires et l'administration/authentification. Ils doivent être déplacés vers des repositories spécialisés lors de leur prochaine évolution, sans modifier le pipeline de synchronisation déjà validé. Les composants `Clients`, `Documents` et `Atelier` appellent désormais les Application Services pour leurs cas d'usage métier centraux.
