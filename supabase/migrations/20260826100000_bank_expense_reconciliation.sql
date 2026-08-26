-- Rapprochement bancaire avec une dépense CRM existante.
-- Additif, rétrocompatible : les anciens liens facture restent inchangés.

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS matched_expense_id text,
  ADD COLUMN IF NOT EXISTS matched_expense_reference text,
  ADD COLUMN IF NOT EXISTS match_type text;

UPDATE public.bank_transactions
SET match_type = 'invoice'
WHERE match_type IS NULL
  AND (matched_invoice_id IS NOT NULL OR matched_invoice IS NOT NULL);

CREATE INDEX IF NOT EXISTS bank_transactions_matched_expense_idx
  ON public.bank_transactions (matched_expense_id)
  WHERE matched_expense_id IS NOT NULL;
