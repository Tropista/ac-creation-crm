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
  const status = String(invoice?.status || "").toLowerCase();
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
