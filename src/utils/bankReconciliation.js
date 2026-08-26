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

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textMatchScore(transaction, values = []) {
  const haystack = normalizeMatchText([
    transaction?.description,
    transaction?.reference,
    transaction?.notes,
  ].filter(Boolean).join(" "));
  const tokens = values
    .flatMap((value) => normalizeMatchText(value).split(/\s+/))
    .filter((token) => token.length >= 3);
  return tokens.some((token) => haystack.includes(token)) ? 15 : 0;
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
  if (Number(transaction?.amount || 0) <= 0) return [];
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

export function getExpenseAmount(expense) {
  return Math.abs(Number(expense?.totalTTC ?? expense?.amountTTC ?? expense?.amount ?? 0));
}

export function scoreExpenseMatch(transaction, expense) {
  let score = 0;
  const reasons = [];
  const txAmount = Math.abs(Number(transaction?.amount || 0));
  const expenseAmount = getExpenseAmount(expense);
  const delta = Math.abs(txAmount - expenseAmount);

  if (delta <= 0.01) {
    score += 40;
    reasons.push("Montant exact");
  } else if (expenseAmount > 0 && delta / expenseAmount <= 0.05) {
    score += 20;
    reasons.push("Montant proche");
  }

  const reference = normalizeMatchText(expense?.invoiceNumber || expense?.reference);
  const txText = normalizeMatchText([
    transaction?.description,
    transaction?.reference,
  ].filter(Boolean).join(" "));
  if (reference.length >= 3 && txText.includes(reference)) {
    score += 50;
    reasons.push("Référence dépense");
  }

  const textScore = textMatchScore(transaction, [expense?.supplierName]);
  if (textScore) {
    score += textScore;
    reasons.push("Fournisseur");
  }

  const proximity = dateProximityScore(transaction, { date: expense?.purchaseDate || expense?.date });
  if (proximity) {
    score += proximity;
    reasons.push("Date proche");
  }

  return { score, reasons };
}

export function suggestExpenseMatches(transaction, expenses, { limit = 3 } = {}) {
  if (Number(transaction?.amount || 0) >= 0) return [];
  return [...(expenses || [])]
    .map((expense) => ({ expense, ...scoreExpenseMatch(transaction, expense) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Math.abs(Math.abs(Number(transaction.amount)) - getExpenseAmount(a.expense)) - Math.abs(Math.abs(Number(transaction.amount)) - getExpenseAmount(b.expense)))
    .slice(0, limit);
}

function chooseUnambiguousSuggestion(suggestions, minScore, minGap) {
  const best = suggestions[0];
  const second = suggestions[1];
  if (!best || best.score < minScore) return null;
  if (second && best.score - second.score < minGap) return null;
  return best;
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
    if (Number(transaction.amount) <= 0) continue;
    const suggestions = suggestInvoiceMatches(transaction, openInvoices, data, { limit: 2 });
    const best = chooseUnambiguousSuggestion(suggestions, minScore, minGap);
    if (!best || usedInvoiceIds.has(String(best.invoice.id))) continue;

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

export function getAutoExpenseReconciliationCandidates(
  transactions = [],
  expenses = [],
  { minScore = 65, minGap = 15 } = {}
) {
  const usedExpenseIds = new Set();
  const candidates = [];
  for (const transaction of transactions || []) {
    if (transaction?.matched || Number(transaction?.amount || 0) >= 0) continue;
    const best = chooseUnambiguousSuggestion(
      suggestExpenseMatches(transaction, expenses, { limit: 2 }),
      minScore,
      minGap
    );
    if (!best || usedExpenseIds.has(String(best.expense.id))) continue;
    candidates.push({ transaction, expense: best.expense, score: best.score, reasons: best.reasons });
    usedExpenseIds.add(String(best.expense.id));
  }
  return candidates;
}

export function getBankTransactionStats(transactions = []) {
  const entries = transactions.filter((transaction) => Number(transaction.amount) > 0);
  const exits = transactions.filter((transaction) => Number(transaction.amount) < 0);
  const entriesTotal = entries.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const exitsTotal = exits.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0);
  return {
    total: transactions.length,
    pending: transactions.filter((transaction) => !transaction.matched).length,
    matched: transactions.filter((transaction) => transaction.matched).length,
    entriesTotal,
    exitsTotal,
    balance: entriesTotal - exitsTotal,
  };
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

export function getTransactionReconciliationState(transaction, invoices, expenses = []) {
  if (!transaction?.matched) {
    return {
      status: transaction?.category ? "categorized" : "pending",
      invoice: null,
      expense: null,
    };
  }

  const expense = (expenses || []).find(
    (entry) => String(entry.id) === String(transaction.matched_expense_id)
  ) || null;

  const invoice =
    findInvoiceByReference(invoices, transaction.matched_invoice) ||
    (invoices || []).find(
      (entry) => String(entry.id) === String(transaction.matched_invoice_id)
    ) ||
    null;

  return {
    status: invoice || expense
      ? "matched"
      : transaction.matched_invoice || transaction.matched_expense_id
        ? "orphan"
        : "ignored",
    invoice,
    expense,
  };
}
