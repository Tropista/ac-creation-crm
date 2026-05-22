/**
 * Supabase bank_transactions — si Rapprocher / Ignorer échouent, exécuter dans le SQL Editor :
 *
 * ALTER TABLE bank_transactions
 *   ADD COLUMN IF NOT EXISTS matched boolean DEFAULT false,
 *   ADD COLUMN IF NOT EXISTS matched_invoice text,
 *   ADD COLUMN IF NOT EXISTS matched_invoice_id text;
 *
 * CREATE POLICY "bank_transactions_update" ON bank_transactions
 *   FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
 *
 * CREATE POLICY "bank_transactions_delete" ON bank_transactions
 *   FOR DELETE TO anon, authenticated USING (true);
 */

export function logBankTransactionError(action, error) {
  console.error(`[Banque] ${action}`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
}

export function bankTransactionErrorHint(error) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();

  if (code === "PGRST204" || message.includes("column")) {
    return " Colonnes manquantes : exécutez la migration SQL (voir bankTransactionSync.js).";
  }
  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission")
  ) {
    return " Droits insuffisants : ajoutez une politique RLS UPDATE/DELETE sur bank_transactions.";
  }
  if (message.includes("invalid input syntax for type uuid")) {
    return " matched_invoice_id doit être en texte, pas en UUID.";
  }

  return error?.message ? ` (${error.message})` : "";
}

function isMissingColumnError(error) {
  const code = error?.code || "";
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST204" ||
    message.includes("column") ||
    message.includes("schema cache")
  );
}

function isStatusConstraintError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("check constraint") && message.includes("status");
}

async function tryPatch(supabase, transactionId, patch) {
  const { data, error } = await supabase
    .from("bank_transactions")
    .update(patch)
    .eq("id", transactionId)
    .select("id");

  if (error) {
    return { ok: false, error, rows: 0 };
  }

  return { ok: (data || []).length > 0, error: null, rows: (data || []).length };
}

export function reconcilePatchVariants(invoice) {
  const number = invoice?.number ?? null;
  const invoiceId = invoice?.id != null ? String(invoice.id) : null;

  return [
    {
      matched: true,
      matched_invoice: number,
      matched_invoice_id: invoiceId,
      status: "rapprochée",
    },
    {
      matched: true,
      matched_invoice: number,
      status: "rapprochée",
    },
    {
      matched: true,
      matched_invoice: number,
      status: "payée",
    },
  ];
}

export function ignorePatchVariants() {
  return [
    {
      matched: true,
      matched_invoice: null,
      matched_invoice_id: null,
      status: "ignorée",
    },
    {
      matched: true,
      matched_invoice: null,
      status: "ignorée",
    },
    {
      matched: true,
      matched_invoice: null,
      status: "payée",
    },
    {
      matched: true,
      status: "payée",
    },
  ];
}

export async function patchBankTransaction(supabase, transactionId, patchVariants) {
  let lastError = null;

  for (const patch of patchVariants) {
    const result = await tryPatch(supabase, transactionId, patch);
    if (result.ok) {
      return { ok: true, patch, error: null };
    }

    if (result.error) {
      lastError = result.error;
      if (
        !isMissingColumnError(result.error) &&
        !isStatusConstraintError(result.error)
      ) {
        break;
      }
      continue;
    }

    lastError = {
      message:
        "Aucune ligne mise à jour (vérifiez les politiques RLS UPDATE sur bank_transactions).",
      code: "BANK_TX_NO_ROWS",
    };
    break;
  }

  return { ok: false, patch: null, error: lastError };
}

export function applyLocalBankTransactionPatch(transactions, transactionId, patch) {
  return (transactions || []).map((tx) =>
    String(tx.id) === String(transactionId) ? { ...tx, ...patch } : tx
  );
}

export async function deleteBankTransaction(supabase, transactionId) {
  const { data, error } = await supabase
    .from("bank_transactions")
    .delete()
    .eq("id", transactionId)
    .select("id");

  if (error) {
    return { ok: false, error, rows: 0 };
  }

  if ((data || []).length === 0) {
    return {
      ok: false,
      error: {
        message:
          "Aucune ligne supprimée (vérifiez les politiques RLS DELETE sur bank_transactions).",
        code: "BANK_TX_NO_ROWS",
      },
      rows: 0,
    };
  }

  return { ok: true, error: null, rows: (data || []).length };
}

export function removeLocalBankTransaction(transactions, transactionId) {
  return (transactions || []).filter(
    (tx) => String(tx.id) !== String(transactionId)
  );
}
