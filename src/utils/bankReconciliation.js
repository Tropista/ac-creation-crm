import { clientName } from "./documents";
import { isCancelledInvoice, isPaidInvoice, parseDocumentDate } from "./invoices";

const INVOICE_NUMBER_PATTERN = /FAC[-\s]?(?:\d{4}[-\s])?\d{2,4}/gi;

export function normalizeInvoiceNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function extractInvoiceNumbers(text) {
  if (!text) return [];
  const matches = String(text).match(INVOICE_NUMBER_PATTERN) || [];
  return [...new Set(matches.map(normalizeInvoiceNumber))];
}

export function invoiceNumbersMatch(left, right) {
  const a = normalizeInvoiceNumber(left);
  const b = normalizeInvoiceNumber(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const suffixA = a.split("-").pop();
  const suffixB = b.split("-").pop();
  return suffixA === suffixB && suffixA.length >= 2;
}

export function findInvoiceByReference(invoices, reference) {
  const normalized = normalizeInvoiceNumber(reference);
  if (!normalized) return null;

  return (
    (invoices || []).find((invoice) =>
      invoiceNumbersMatch(invoice.number, normalized)
    ) || null
  );
}

export function getInvoiceOpenAmount(invoice) {
  const remaining = Number(invoice?.remaining);
  if (!Number.isNaN(remaining) && remaining > 0) return remaining;

  const total = Number(invoice?.totalTTC || 0);
  const paid = Number(invoice?.paidAmount || 0);
  return Math.max(0, total - paid);
}

function amountDelta(transaction, invoice) {
  const txAmount = Math.abs(Number(transaction?.amount || 0));
  const invoiceAmount = getInvoiceOpenAmount(invoice) || Number(invoice?.totalTTC || 0);
  return Math.abs(txAmount - invoiceAmount);
}

function dateProximityScore(transaction, invoice) {
  const txDate = parseDocumentDate(transaction?.transaction_date);
  const invoiceDate = parseDocumentDate(invoice?.date);
  if (!txDate || !invoiceDate) return 0;

  const diffDays = Math.abs(txDate.getTime() - invoiceDate.getTime()) / 86400000;
  if (diffDays <= 7) return 10;
  if (diffDays <= 30) return 5;
  return 0;
}

export function scoreInvoiceMatch(transaction, invoice, invoiceClientName = "") {
  let score = 0;
  const reasons = [];
  const description = String(transaction?.description || "");
  const numbers = extractInvoiceNumbers(description);

  if (numbers.some((number) => invoiceNumbersMatch(number, invoice?.number))) {
    score += 50;
    reasons.push("Numéro facture");
  }

  const delta = amountDelta(transaction, invoice);
  const invoiceAmount = getInvoiceOpenAmount(invoice) || Number(invoice?.totalTTC || 0);

  if (delta <= 0.01) {
    score += 40;
    reasons.push("Montant exact");
  } else if (invoiceAmount > 0 && delta / invoiceAmount <= 0.05) {
    score += 20;
    reasons.push("Montant proche");
  }

  const client = String(invoiceClientName || "").trim();
  if (client.length >= 3) {
    const haystack = description.toLowerCase();
    const tokens = client.toLowerCase().split(/\s+/).filter((part) => part.length >= 3);
    if (tokens.some((token) => haystack.includes(token))) {
      score += 15;
      reasons.push("Client");
    }
  }

  const proximity = dateProximityScore(transaction, invoice);
  if (proximity > 0) {
    score += proximity;
    reasons.push("Date proche");
  }

  return { score, reasons };
}

export function suggestInvoiceMatches(transaction, invoices, data, { limit = 3 } = {}) {
  return [...(invoices || [])]
    .filter((invoice) => !isCancelledInvoice(invoice))
    .map((invoice) => ({
      invoice,
      ...scoreInvoiceMatch(
        transaction,
        invoice,
        clientName(data, invoice.clientId)
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return amountDelta(transaction, a.invoice) - amountDelta(transaction, b.invoice);
    })
    .slice(0, limit);
}

export function getAutoReconciliationCandidates(
  transactions = [],
  invoices = [],
  data = {},
  { minScore = 85, minGap = 15 } = {}
) {
  const usedInvoiceIds = new Set();
  const pendingTransactions = (transactions || []).filter(
    (transaction) => !transaction?.matched && Number(transaction?.amount || 0) !== 0
  );
  const openInvoices = getReconcilableInvoices(invoices);
  const candidates = [];

  for (const transaction of pendingTransactions) {
    const suggestions = suggestInvoiceMatches(transaction, openInvoices, data, { limit: 2 });
    const best = suggestions[0];
    const second = suggestions[1];
    if (!best || best.score < minScore) continue;
    if (second && best.score - second.score < minGap) continue;
    if (usedInvoiceIds.has(String(best.invoice.id))) continue;

    candidates.push({
      transaction,
      invoice: best.invoice,
      score: best.score,
      reasons: best.reasons,
    });
    usedInvoiceIds.add(String(best.invoice.id));
  }

  return candidates;
}

export function getReconcilableInvoices(invoices) {
  return [...(invoices || [])]
    .filter((invoice) => !isCancelledInvoice(invoice) && !isPaidInvoice(invoice))
    .sort((a, b) => String(a.number || "").localeCompare(String(b.number || "")));
}

export function buildPaidInvoiceUpdate(invoice, transaction) {
  const total = Number(invoice.totalTTC || 0);
  return {
    ...invoice,
    status: "Payée",
    paidAmount: total,
    remaining: 0,
    bankReconciledAt: new Date().toISOString(),
    bankTransactionId: transaction?.id || null,
  };
}

/** Annule le rapprochement bancaire si la transaction liée est supprimée. */
export function buildUnpaidInvoiceRevert(invoice) {
  const total = Number(invoice.totalTTC || 0);
  return {
    ...invoice,
    status: "Non payée",
    paidAmount: 0,
    remaining: total,
    bankReconciledAt: null,
    bankTransactionId: null,
  };
}

export function getTransactionReconciliationState(transaction, invoices) {
  if (!transaction?.matched) {
    return { status: "pending", invoice: null };
  }

  const invoice =
    findInvoiceByReference(invoices, transaction.matched_invoice) ||
    (invoices || []).find(
      (entry) => String(entry.id) === String(transaction.matched_invoice_id)
    ) ||
    null;

  return {
    status: invoice ? "matched" : transaction.matched_invoice ? "orphan" : "ignored",
    invoice,
  };
}
