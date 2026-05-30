import { isInvoiceOverdue, sortOverdueInvoices } from "./invoices";
import { getQuoteDepositSummary } from "./documents";
import { getStaleSentQuotes } from "./documentTracking";
import { getQuotesToLaunchToday } from "./quoteDelivery";

export const MONDAY_QUEUE_KINDS = {
  QUOTE_FOLLOWUP: "quote_followup",
  INVOICE_OVERDUE: "invoice_overdue",
  MISSING_DEPOSIT: "missing_deposit",
  LAUNCH_TODAY: "launch_today",
};

export function getQuotesMissingDeposit(data = {}, quotes = []) {
  const invoices = data.invoices || [];

  return (quotes || []).filter((quote) => {
    if (String(quote?.status || "").trim() !== "Accepté") return false;
    if (Number(quote?.depositPercent || 0) <= 0) return false;

    const summary = getQuoteDepositSummary({ invoices }, quote);
    return summary.depositInvoices.length === 0;
  });
}

export function buildMondayWorkQueue({
  quotes = [],
  invoices = [],
  data = {},
  minSentAgeDays = 7,
} = {}) {
  const items = [];

  for (const quote of getStaleSentQuotes(quotes, { minAgeDays: minSentAgeDays })) {
    items.push({
      kind: MONDAY_QUEUE_KINDS.QUOTE_FOLLOWUP,
      id: `quote-followup-${quote.id}`,
      quoteId: quote.id,
      label: quote.number,
      detail: quote.date,
      amount: quote.totalTTC,
      priority: 2,
    });
  }

  for (const invoice of sortOverdueInvoices(invoices.filter(isInvoiceOverdue))) {
    items.push({
      kind: MONDAY_QUEUE_KINDS.INVOICE_OVERDUE,
      id: `invoice-overdue-${invoice.id}`,
      invoiceId: invoice.id,
      label: invoice.number,
      detail: invoice.dueDate || invoice.date,
      amount: invoice.totalTTC,
      priority: 1,
    });
  }

  for (const quote of getQuotesMissingDeposit(data, quotes)) {
    items.push({
      kind: MONDAY_QUEUE_KINDS.MISSING_DEPOSIT,
      id: `missing-deposit-${quote.id}`,
      quoteId: quote.id,
      label: quote.number,
      detail: `${quote.depositPercent}%`,
      amount: quote.totalTTC,
      priority: 3,
    });
  }

  for (const quote of getQuotesToLaunchToday(quotes)) {
    items.push({
      kind: MONDAY_QUEUE_KINDS.LAUNCH_TODAY,
      id: `launch-today-${quote.id}`,
      quoteId: quote.id,
      label: quote.number,
      detail: quote.promisedDeliveryDate || "—",
      priority: 4,
    });
  }

  return items.sort((a, b) => a.priority - b.priority || String(a.label).localeCompare(String(b.label)));
}

export function countMondayWorkQueueItems(queue = []) {
  return queue.length;
}
