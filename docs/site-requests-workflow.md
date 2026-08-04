# Flux des demandes du site

## Principe

Le CRM reste la source de vérité. Une commande e-commerce payée est enregistrée dans les collections CRM existantes (client, commande/devis, facture et paiement), mais elle n'entre plus automatiquement dans l'Atelier.

Le flux est : `Site → API CRM → Demandes du site → contrôle humain → Atelier → Production`.

La demande n'est pas dupliquée dans une nouvelle table : elle est portée par la commande CRM et ses métadonnées `quote.ecommerce` persistées dans Supabase.

## Identification et statuts

Une demande est identifiée par `source: ecommerce`, `externalOrderId`, `siteOrderNumber` et `receivedAt`. Son traitement utilise `reviewStatus` :

- `new` : reçue et non ouverte ;
- `opened` : consultée ;
- `awaiting_review` : contrôle commencé ;
- `incomplete` : informations ou fichiers manquants ;
- `approved` : contrôle validé ;
- `sent_to_workshop` : transférée de manière idempotente ;
- `rejected` : refusée ;
- `cancelled` : annulée.

Le badge rouge est le nombre de demandes actives sans `openedAt`. Il est calculé depuis les commandes synchronisées, donc reste cohérent après rechargement ou changement de poste.

## Complétude et permissions

L'envoi exige un paiement confirmé, un client, au moins un article, un snapshot et des données de production. Un aperçu est exigé lorsque le snapshot le déclare explicitement. Seuls les rôles disposant de `manageWorkshop` peuvent envoyer une demande.

## Atelier, historique et idempotence

Les utilitaires Atelier excluent toute commande e-commerce dont le statut n'est pas `sent_to_workshop`. L'action « Envoyer à l'atelier » met à jour la commande via `WorkshopApplicationService`; une seconde exécution ne crée rien et renvoie un résultat dupliqué.

Chaque transition ajoute une entrée append-only avec date, utilisateur, action, commentaire, ancien/nouveau statut, correlation ID et external order ID.

## Commandes existantes

La migration `202608040001_ecommerce_site_request_review.sql` est idempotente et non destructive. Elle détecte uniquement les commandes possédant déjà `ecommerce.sourceOrderId`. Les commandes déjà en production/prêtes/livrées sont marquées `sent_to_workshop`; les autres deviennent `new`. Les commandes CRM internes ne sont jamais modifiées.

La migration doit être examinée puis appliquée explicitement à Supabase. Elle ne doit pas être remplacée par une réimportation ou une remise à zéro des données.
