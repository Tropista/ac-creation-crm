export const INVOICES_FILTER_KEY = "crm_invoices_filter";

export function parseDocumentDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const parts = str.split("/");
  if (parts.length === 3) {
    const parsed = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function isPaidInvoice(invoice) {
  const status = String(invoice?.status || "").toLowerCase().trim();
  if (
    status === "non payée" ||
    status === "non payee" ||
    status.includes("partiellement")
  ) {
    return false;
  }
  if (status.includes("payée") || status.includes("payee") || status.includes("payé") || status.includes("paye")) {
    return true;
  }
  if (status.includes("régl") || status.includes("regl")) return true;

  const remaining = Number(invoice?.remaining);
  if (!Number.isNaN(remaining) && remaining <= 0.01) return true;

  const total = Number(invoice?.totalTTC || 0);
  const paid = Number(invoice?.paidAmount || 0);
  if (total > 0 && paid >= total - 0.01) return true;

  return false;
}

export function isCancelledInvoice(invoice) {
  return String(invoice?.status || "").toLowerCase().includes("annul");
}

export function isInvoiceOverdue(invoice, referenceDate = new Date()) {
  if (!invoice || isPaidInvoice(invoice) || isCancelledInvoice(invoice)) {
    return false;
  }

  const status = String(invoice.status || "").toLowerCase();
  if (status.includes("attente de paiement")) return false; // En attente de paiement = pas en retard
  if (status.includes("retard")) return true;

  const due = parseDocumentDate(invoice.dueDate);
  if (!due) return false;

  return startOfDay(due) < startOfDay(referenceDate);
}

export function sortOverdueInvoices(invoices) {
  return [...(invoices || [])].sort((a, b) => {
    const dueA = parseDocumentDate(a.dueDate)?.getTime() || 0;
    const dueB = parseDocumentDate(b.dueDate)?.getTime() || 0;
    if (dueA !== dueB) return dueA - dueB;
    return Number(b.totalTTC || 0) - Number(a.totalTTC || 0);
  });
}

export function getInvoicePaidAmount(invoice) {
  if (isPaidInvoice(invoice)) {
    return Number(invoice?.totalTTC || invoice?.amountPaid || invoice?.paidAmount || 0);
  }
  const direct = Number(invoice?.amountPaid);
  if (!Number.isNaN(direct) && direct >= 0) return direct;
  const paid = Number(invoice?.paidAmount);
  if (!Number.isNaN(paid) && paid >= 0) return paid;
  return 0;
}

export function getInvoiceRemaining(invoice) {
  const total = Number(invoice?.totalTTC || 0);
  if (isPaidInvoice(invoice)) return 0;
  const directPaid = Number(invoice?.amountPaid ?? invoice?.paidAmount);
  if (!Number.isNaN(directPaid) && directPaid >= 0) {
    return Math.max(0, total - directPaid);
  }
  const remaining = Number(invoice?.remaining);
  if (!Number.isNaN(remaining) && remaining >= 0) return remaining;
  return Math.max(0, total - getInvoicePaidAmount(invoice));
}

export function isPartiallyPaidInvoice(invoice) {
  if (!invoice || isPaidInvoice(invoice) || isCancelledInvoice(invoice)) {
    return false;
  }
  const paid = getInvoicePaidAmount(invoice);
  const total = Number(invoice?.totalTTC || 0);
  return paid > 0.01 && paid < total - 0.01;
}

export function deriveInvoiceStatus(invoice) {
  if (isCancelledInvoice(invoice)) return "Annulée";
  if (isPaidInvoice(invoice)) return "Payée";
  if (isPartiallyPaidInvoice(invoice)) return "Partiellement payée";
  if (isInvoiceOverdue(invoice)) return "En retard";
  return invoice?.status || "Non payée";
}

export function applyPartialPayment(invoice, paymentAmount) {
  const total = Number(invoice?.totalTTC || 0);
  const currentPaid = getInvoicePaidAmount(invoice);
  const amount = Math.max(0, Number(paymentAmount) || 0);
  const nextPaid = Math.min(total, currentPaid + amount);
  const remaining = Math.max(0, total - nextPaid);

  const status =
    remaining <= 0.01
      ? "Payée"
      : nextPaid > 0.01
        ? "Partiellement payée"
        : "Non payée";

  return {
    ...invoice,
    paidAmount: nextPaid,
    remaining,
    status,
  };
}

export function computeDepositAmounts(quoteTotalTTC, percent) {
  const rate = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  const totalTTC = Math.round(Number(quoteTotalTTC || 0) * rate * 100) / 100;
  return { percent: rate * 100, totalTTC };
}

export const DEPOSIT_PRESETS = [30, 50, 70];
