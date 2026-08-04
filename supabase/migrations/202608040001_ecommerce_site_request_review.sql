-- Backfill non destructif du sas de validation des commandes e-commerce.
-- Les commandes deja en production restent traitees; les autres arrivent a controler.

update public.quotes
set data = jsonb_set(
  data,
  '{ecommerce}',
  coalesce(data -> 'ecommerce', '{}'::jsonb) || jsonb_build_object(
    'source', 'ecommerce',
    'externalOrderId', coalesce(data #>> '{ecommerce,externalOrderId}', data #>> '{ecommerce,sourceOrderId}'),
    'siteOrderNumber', coalesce(data #>> '{ecommerce,siteOrderNumber}', data ->> 'number'),
    'receivedAt', coalesce(data #>> '{ecommerce,receivedAt}', data ->> 'date', now()::text),
    'paymentStatus', coalesce(data #>> '{ecommerce,paymentStatus}', 'paid'),
    'reviewStatus', coalesce(
      data #>> '{ecommerce,reviewStatus}',
      case
        when data ->> 'status' in ('En production', 'Prêt', 'Livré') then 'sent_to_workshop'
        else 'new'
      end
    )
  ),
  true
)
where data #>> '{ecommerce,sourceOrderId}' is not null
  and coalesce(data #>> '{ecommerce,source}', '') <> 'ecommerce';
