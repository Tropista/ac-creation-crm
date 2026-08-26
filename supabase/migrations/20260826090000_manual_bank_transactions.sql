-- Transactions bancaires manuelles : métadonnées et origine.
-- Migration additive et idempotente, sans modification des données existantes.

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Les lignes historiques sans identifiant/provider proviennent du formulaire manuel existant.
UPDATE public.bank_transactions
SET source = CASE
  WHEN external_id IS NOT NULL OR provider IS NOT NULL THEN 'synced'
  ELSE 'manual'
END
WHERE source IS NULL;

ALTER TABLE public.bank_transactions
  ALTER COLUMN source SET DEFAULT 'manual',
  ALTER COLUMN source SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_external_id_unique
  ON public.bank_transactions (external_id);

-- Toute personne autorisée à gérer la banque peut supprimer ses saisies manuelles,
-- mais une ligne synchronisée reste protégée au niveau de la base.
DROP POLICY IF EXISTS "bank_tx_delete" ON public.bank_transactions;
CREATE POLICY "bank_tx_delete_manual" ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (
    source = 'manual'
    AND public.crm_role_in(ARRAY['Admin', 'Employé', 'Comptable'])
  );
