import { uid } from "./documents";
import {
  applyPartialPayment,
  deriveInvoiceStatus,
  getInvoicePaidAmount,
  getInvoiceRemaining,
} from "./invoices";

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
    amount: Math.round(Number(payment.amount || 0) * 100) / 100,
    method: PAYMENT_METHODS.includes(payment.method) ? payment.method : "Virement",
    status: PAYMENT_STATUSES.includes(payment.status) ? payment.status : "Reçu",
    date: payment.date || new Date().toISOString().slice(0, 10),
    notes: payment.notes || "",
    isDeposit: Boolean(payment.isDeposit),
    createdAt: payment.createdAt || new Date().toISOString(),
  };
}

export function getPaymentsForInvoice(payments = [], invoiceId) {
  return (payments || [])
    .filter(
      (payment) =>
        String(payment.invoiceId) === String(invoiceId) &&
        payment.status !== "Annulé"
    )
    .sort(
      (a, b) =>
        new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
    );
}

export function sumPayments(payments = []) {
  return Math.round(
    (payments || [])
      .filter((p) => p.status === "Reçu")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100
  ) / 100;
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

export function recordInvoicePayment(data, invoice, { amount, method, date, notes, isDeposit = false } = {}) {
  if (!invoice?.id) throw new Error("Facture introuvable.");

  const paymentAmount = Math.round(Number(amount || 0) * 100) / 100;
  if (paymentAmount <= 0) throw new Error("Montant invalide.");

  const remaining = getInvoiceRemaining(invoice);
  if (paymentAmount > remaining + 0.01) {
    throw new Error(`Montant supérieur au reste dû (${remaining.toFixed(2)} €).`);
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
    nextPayments
  );

  const nextInvoices = (data.invoices || []).map((entry) =>
    String(entry.id) === String(invoice.id) ? updatedInvoice : entry
  );

  return {
    ...data,
    payments: nextPayments,
    invoices: nextInvoices,
    payment,
    invoice: updatedInvoice,
  };
}

export function formatPaymentDate(value) {
  if (!value) return "—";
  if (String(value).includes("/")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}
