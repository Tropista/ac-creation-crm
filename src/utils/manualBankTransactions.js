export const MANUAL_BANK_SOURCE = "manual";
export const SYNCED_BANK_SOURCE = "synced";

export function createEmptyManualBankForm() {
  return {
    date: new Date().toISOString().split("T")[0],
    type: "credit",
    amount: "",
    description: "",
    category: "",
    reference: "",
    paymentMethod: "",
    notes: "",
  };
}

export function isManualBankTransaction(transaction) {
  if (transaction?.source) return transaction.source === MANUAL_BANK_SOURCE;
  return !transaction?.external_id && !transaction?.provider;
}

export function manualBankTransactionToForm(transaction) {
  const amount = Number(transaction?.amount || 0);
  return {
    date: transaction?.transaction_date || new Date().toISOString().split("T")[0],
    type: amount < 0 ? "debit" : "credit",
    amount: amount ? String(Math.abs(amount)) : "",
    description: transaction?.description || "",
    category: transaction?.category || "",
    reference: transaction?.reference || "",
    paymentMethod: transaction?.payment_method || "",
    notes: transaction?.notes || "",
  };
}

export function buildManualBankTransactionPayload(form) {
  const absoluteAmount = Number(String(form.amount).replace(",", "."));
  if (!form.date) throw new Error("Indiquez une date de transaction.");
  if (!form.description?.trim()) throw new Error("Indiquez un libellé.");
  if (!Number.isFinite(absoluteAmount) || absoluteAmount <= 0) {
    throw new Error("Le montant doit être strictement positif.");
  }

  return {
    transaction_date: form.date,
    description: form.description.trim(),
    amount: form.type === "debit" ? -absoluteAmount : absoluteAmount,
    currency: "EUR",
    category: form.category?.trim() || null,
    reference: form.reference?.trim() || null,
    payment_method: form.paymentMethod?.trim() || null,
    notes: form.notes?.trim() || null,
    source: MANUAL_BANK_SOURCE,
  };
}

export function buildSyncedBankTransactionPayload(transaction) {
  return {
    transaction_date: transaction.transaction_date,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency || "EUR",
    status: transaction.status || "non rapprochée",
    matched: false,
    external_id: transaction.external_id,
    provider: transaction.provider || "Tink",
    source: SYNCED_BANK_SOURCE,
  };
}
