-- Adds an optional per-document billing detail in the JSON payload.
-- The CRM stores quotes/invoices/delivery notes as { id, data, created_at } rows,
-- so no physical column is required.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['quotes', 'invoices', 'delivery_notes']
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.%I
           SET data = jsonb_set(coalesce(data, ''{}''::jsonb), ''{billingDetail}'', ''""''::jsonb, true)
         WHERE NOT (coalesce(data, ''{}''::jsonb) ? ''billingDetail'')',
        tbl
      );
    END IF;
  END LOOP;
END $$;
