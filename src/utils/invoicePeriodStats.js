import { getInvoicePaidAmount, parseDocumentDate } from "./invoices";

export const INVOICE_PERIOD_MODES = {
  MONTH: "month",
  YEAR: "year",
  ALL: "all",
};

/**
 * Vérifie si une date document (JJ/MM/AAAA ou ISO) tombe dans la période choisie.
 */
export function isInvoiceDateInPeriod(dateValue, { mode, year, month } = {}) {
  if (mode === INVOICE_PERIOD_MODES.ALL) return true;
  const date = parseDocumentDate(dateValue);
  if (!date) return false;
  const targetYear = Number(year);
  if (!Number.isFinite(targetYear)) return false;
  if (mode === INVOICE_PERIOD_MODES.YEAR) {
    return date.getFullYear() === targetYear;
  }
  if (mode === INVOICE_PERIOD_MODES.MONTH) {
    const targetMonth = Number(month);
    if (!Number.isFinite(targetMonth) || targetMonth < 0 || targetMonth > 11) {
      return false;
    }
    return date.getFullYear() === targetYear && date.getMonth() === targetMonth;
  }
  return false;
}

export function filterInvoicesByPeriod(invoices, period) {
  return (invoices || []).filter((invoice) =>
    isInvoiceDateInPeriod(invoice.date, period)
  );
}

export function computeInvoicePeriodTotals(invoices) {
  const list = invoices || [];
  const billedTTC = list.reduce(
    (sum, invoice) => sum + Number(invoice.totalTTC || 0),
    0
  );
  const paidTTC = list.reduce(
    (sum, invoice) => sum + getInvoicePaidAmount(invoice),
    0
  );
  const unpaidTTC = Math.max(0, billedTTC - paidTTC);
  return {
    billedTTC,
    paidTTC,
    unpaidTTC,
    count: list.length,
  };
}

export function formatInvoicePeriodLabel(period) {
  if (!period || period.mode === INVOICE_PERIOD_MODES.ALL) {
    return "Depuis la création";
  }
  if (period.mode === INVOICE_PERIOD_MODES.YEAR) {
    return String(period.year);
  }
  if (period.mode === INVOICE_PERIOD_MODES.MONTH) {
    return new Date(period.year, period.month, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  }
  return "";
}

export function collectInvoiceYears(invoices, fallbackYear = new Date().getFullYear()) {
  const years = new Set([Number(fallbackYear)]);
  for (const invoice of invoices || []) {
    const date = parseDocumentDate(invoice.date);
    if (date) years.add(date.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}
