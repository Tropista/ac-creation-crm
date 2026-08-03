import { uid } from "./documents.js";
import {
  applyPartialPayment,
  deriveInvoiceStatus,
  getInvoicePaidAmount,
  getInvoiceRemaining,
} from "./invoices.js";

export const PAYMENT_METHODS = [
  "Virement",
  "Payconiq",
  "Espèces",
  "Carte",
  "Chèque",
  "Autre",
];

export const PAYMENT_STATUSES = ["En attente", "Reçu", "Remboursé", "Annulé"];

export function normalizePayment(payment = {}) {
  return {
    id: payment.id || uid(),
    invoiceId: payment.invoiceId || "",
    invoiceNumber: payment.invoiceNumber || "",
    clientId: payment.clientId || "",
    quoteId: payment.quoteId || "",
    saleId: payment.saleId || payment.invoiceId || "",
    documentType: payment.documentType || "invoice",
    amount: Math.round(Number(payment.amount || 0) * 100) / 100,
    method: PAYMENT_METHODS.includes(payment.method)
      ? payment.method
      : "Virement",
    status: PAYMENT_STATUSES.includes(payment.status) ? payment.status : "Reçu",
    date: payment.date || new Date().toISOString().slice(0, 10),
    paymentDate: payment.paymentDate || payment.date || "",
    receivedAt: payment.receivedAt || payment.date || "",
    notes: payment.notes || "",
    isDeposit: Boolean(payment.isDeposit),
    bankTransactionId: payment.bankTransactionId || "",
    source: payment.source || "manual",
    createdAt: payment.createdAt || new Date().toISOString(),
    updatedAt:
      payment.updatedAt || payment.createdAt || new Date().toISOString(),
  };
}

export function getPaymentsForInvoice(payments = [], invoiceId) {
  return (payments || [])
    .filter(
      (payment) =>
        String(payment.invoiceId) === String(invoiceId) &&
        payment.status !== "Annulé",
    )
    .sort(
      (a, b) =>
        new Date(b.date || b.createdAt || 0) -
        new Date(a.date || a.createdAt || 0),
    );
}

export function isPaymentLinkedToInvoice(payment = {}, invoice = {}) {
  const invoiceIds = [invoice.id, invoice.number].filter(Boolean).map(String);
  const paymentIds = [payment.invoiceId, payment.invoiceNumber]
    .filter(Boolean)
    .map(String);
  return paymentIds.some((id) => invoiceIds.includes(id));
}

export function isValidReceivedInvoicePayment(payment = {}) {
  const status = String(payment.status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    (status.includes("recu") ||
      status.includes("received") ||
      status.includes("paye")) &&
    Number(payment.amount || 0) > 0 &&
    Boolean(payment.date)
  );
}

export function hasValidPaymentForInvoice(payments = [], invoice = {}) {
  return (payments || []).some(
    (payment) =>
      isPaymentLinkedToInvoice(payment, invoice) &&
      isValidReceivedInvoicePayment(payment),
  );
}

function isHistoricalPaymentEligible(invoice = {}) {
  const status = String(invoice.status || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (status.includes("annul") || status.includes("non payee")) return false;
  return (
    status.includes("payee") ||
    status.includes("partiellement") ||
    Number(invoice.paidAmount ?? invoice.amountPaid ?? 0) > 0
  );
}

export function sumPayments(payments = []) {
  return (
    Math.round(
      (payments || [])
        .filter((p) => p.status === "Reçu")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100,
    ) / 100
  );
}

export function buildPaymentSummary(invoice, payments = []) {
  const invoicePayments = getPaymentsForInvoice(payments, invoice?.id);
  const paidFromLedger = sumPayments(invoicePayments);
  const totalTTC = Number(invoice?.totalTTC || 0);
  const depositRequested = Number(invoice?.depositAmount || 0);
  const depositPaid = invoicePayments
    .filter((p) => p.isDeposit && p.status === "Reçu")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paidAmount =
    paidFromLedger > 0 ? paidFromLedger : getInvoicePaidAmount(invoice);
  const remaining = Math.max(0, totalTTC - paidAmount);

  return {
    totalTTC,
    depositRequested,
    depositPaid: Math.round(depositPaid * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    paymentHistory: invoicePayments,
    status: deriveInvoiceStatus({ ...invoice, paidAmount, remaining }),
  };
}

export function enrichInvoiceWithPayments(invoice, payments = []) {
  const summary = buildPaymentSummary(invoice, payments);
  return {
    ...invoice,
    paidAmount: summary.paidAmount,
    remaining: summary.remaining,
    depositPaidAmount: summary.depositPaid || invoice.depositPaidAmount || 0,
    paymentHistory: summary.paymentHistory.map((p) => p.id),
    status: summary.status,
  };
}

export function recordInvoicePayment(
  data,
  invoice,
  { amount, method, date, notes, isDeposit = false } = {},
) {
  if (!invoice?.id) throw new Error("Facture introuvable.");

  const paymentAmount = Math.round(Number(amount || 0) * 100) / 100;
  if (paymentAmount <= 0) throw new Error("Montant invalide.");

  const remaining = getInvoiceRemaining(invoice);
  if (paymentAmount > remaining + 0.01) {
    throw new Error(
      `Montant supérieur au reste dû (${remaining.toFixed(2)} €).`,
    );
  }

  const payment = normalizePayment({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    clientId: invoice.clientId,
    amount: paymentAmount,
    method,
    date: date || new Date().toISOString().slice(0, 10),
    notes,
    isDeposit,
    status: "Reçu",
  });

  const nextPayments = [...(data.payments || []), payment];
  const updatedInvoice = enrichInvoiceWithPayments(
    applyPartialPayment(invoice, paymentAmount),
    nextPayments,
  );

  const nextInvoices = (data.invoices || []).map((entry) =>
    String(entry.id) === String(invoice.id) ? updatedInvoice : entry,
  );

  return {
    ...data,
    payments: nextPayments,
    invoices: nextInvoices,
    payment,
    invoice: updatedInvoice,
  };
}

export function upsertHistoricalInvoicePayment(
  data,
  invoice,
  { paymentId = "", amount, method, date, notes, bankTransactionId = "" } = {},
) {
  if (!invoice?.id) throw new Error("Facture introuvable.");

  const paymentAmount = Math.round(Number(amount || 0) * 100) / 100;
  if (paymentAmount <= 0) throw new Error("Montant invalide.");
  if (!date) throw new Error("Date d'encaissement obligatoire.");

  const normalizedMethod = PAYMENT_METHODS.includes(method) ? method : "Autre";
  const existingPayment = (data.payments || []).find(
    (payment) => String(payment.id) === String(paymentId),
  );
  const existingValidPayment =
    !existingPayment && hasValidPaymentForInvoice(data.payments || [], invoice);
  if (existingValidPayment) {
    return {
      ...data,
      invoice,
      payment: null,
      skipped: true,
    };
  }
  const payment = normalizePayment({
    ...existingPayment,
    id: existingPayment?.id || paymentId || uid(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    saleId: invoice.id,
    documentType: "invoice",
    clientId: invoice.clientId,
    quoteId: invoice.quoteId || "",
    amount: paymentAmount,
    method: normalizedMethod,
    status: "Reçu",
    date,
    paymentDate: date,
    receivedAt: date,
    notes: notes || "Paiement historique saisi manuellement",
    bankTransactionId,
    source: bankTransactionId ? "manual_bank_reconciled" : "manual",
    isDeposit: invoice.invoiceType === "acompte",
    updatedAt: new Date().toISOString(),
  });

  const payments = existingPayment
    ? (data.payments || []).map((entry) =>
        String(entry.id) === String(payment.id) ? payment : entry,
      )
    : [...(data.payments || []), payment];

  const updatedInvoice = enrichInvoiceWithPayments(
    {
      ...invoice,
      paymentMethod: normalizedMethod,
      paymentDate: date,
      bankTransactionId: bankTransactionId || invoice.bankTransactionId || "",
    },
    payments,
  );

  return {
    ...data,
    invoices: (data.invoices || []).map((entry) =>
      String(entry.id) === String(invoice.id) ? updatedInvoice : entry,
    ),
    payments,
    invoice: updatedInvoice,
    payment,
  };
}

export function createHistoricalInvoicePaymentsBatch(data, entries = []) {
  let nextData = data;
  const result = {
    data,
    created: 0,
    skipped: 0,
    needsReview: 0,
    errors: [],
  };

  for (const entry of entries || []) {
    const invoice = (nextData.invoices || []).find(
      (item) =>
        String(item.id) === String(entry.invoiceId) ||
        String(item.number) === String(entry.invoiceNumber),
    );
    if (!invoice) {
      result.needsReview += 1;
      result.errors.push({
        invoiceId: entry.invoiceId,
        reason: "Facture introuvable.",
      });
      continue;
    }
    if (!isHistoricalPaymentEligible(invoice)) {
      result.skipped += 1;
      continue;
    }
    if (hasValidPaymentForInvoice(nextData.payments || [], invoice)) {
      result.skipped += 1;
      continue;
    }
    if (!entry.date) {
      result.needsReview += 1;
      result.errors.push({
        invoiceId: invoice.id,
        reason: "Date d'encaissement obligatoire.",
      });
      continue;
    }
    const amount = Number(entry.amount || 0);
    if (!amount || amount <= 0) {
      result.needsReview += 1;
      result.errors.push({
        invoiceId: invoice.id,
        reason: "Montant invalide.",
      });
      continue;
    }
    const updated = upsertHistoricalInvoicePayment(nextData, invoice, {
      amount,
      method:
        entry.method ||
        invoice.paymentMethod ||
        invoice.paymentMode ||
        "Virement",
      date: entry.date,
      notes:
        entry.notes ||
        "Paiement historique cree en masse depuis la declaration TVA",
      bankTransactionId: entry.bankTransactionId || "",
    });
    if (updated.skipped) {
      result.skipped += 1;
      nextData = updated;
      continue;
    }
    result.created += 1;
    nextData = updated;
  }

  return {
    ...result,
    data: nextData,
  };
}

export function formatPaymentDate(value) {
  if (!value) return "—";
  if (String(value).includes("/")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}
