import { parseDocumentDate } from "./invoices";
import { collectExpenseYears, filterExpensesByYear } from "./expenseYearStats";
import { clientName } from "./documents";

export function collectAnnualYears(quotes = [], invoices = [], expenses = [], fallbackYear = new Date().getFullYear()) {
  const years = new Set([Number(fallbackYear)]);

  for (const invoice of invoices || []) {
    const date = parseDocumentDate(invoice.date);
    if (date) years.add(date.getFullYear());
  }

  for (const quote of quotes || []) {
    const date = parseDocumentDate(quote.date);
    if (date) years.add(date.getFullYear());
  }

  for (const year of collectExpenseYears(expenses, fallbackYear)) {
    years.add(year);
  }

  return [...years].sort((a, b) => b - a);
}

export function filterInvoicesByYear(invoices, year) {
  const targetYear = Number(year);
  return (invoices || []).filter((invoice) => {
    const date = parseDocumentDate(invoice.date);
    return date && date.getFullYear() === targetYear;
  });
}

export function filterQuotesByYear(quotes, year) {
  const targetYear = Number(year);
  return (quotes || []).filter((quote) => {
    const date = parseDocumentDate(quote.date);
    return date && date.getFullYear() === targetYear;
  });
}

export function computeMonthlyRevenueHT(invoices, year) {
  const targetYear = Number(year);
  const byMonth = Array.from({ length: 12 }, () => 0);

  for (const invoice of invoices || []) {
    const date = parseDocumentDate(invoice.date);
    if (!date || date.getFullYear() !== targetYear) continue;
    byMonth[date.getMonth()] += Number(invoice.totalHT || 0);
  }

  return byMonth.map((ht, month) => ({
    month,
    label: new Date(targetYear, month, 1).toLocaleDateString("fr-FR", { month: "short" }),
    ht: Math.round(ht * 100) / 100,
  }));
}

export function computeQuoteAcceptanceRate(quotes, year) {
  const yearQuotes = filterQuotesByYear(quotes, year);
  const sent = yearQuotes.filter((quote) => {
    const status = String(quote?.status || "").trim();
    return status === "Envoyé" || status === "Accepté" || status === "Refusé" || quote?.sentAt;
  });
  const accepted = yearQuotes.filter((quote) => String(quote?.status || "").trim() === "Accepté");

  const rate = sent.length > 0 ? accepted.length / sent.length : null;
  return {
    sentCount: sent.length,
    acceptedCount: accepted.length,
    rate,
  };
}

export function computeTopClientsByRevenue(invoices, data, { year, limit = 5 } = {}) {
  const yearInvoices = filterInvoicesByYear(invoices, year);
  const totals = new Map();

  for (const invoice of yearInvoices) {
    const clientId = invoice.clientId;
    if (!clientId) continue;
    const current = totals.get(clientId) || 0;
    totals.set(clientId, current + Number(invoice.totalHT || 0));
  }

  return [...totals.entries()]
    .map(([clientId, revenueHT]) => ({
      clientId,
      name: clientName(data, clientId),
      revenueHT: Math.round(revenueHT * 100) / 100,
    }))
    .sort((a, b) => b.revenueHT - a.revenueHT)
    .slice(0, limit);
}

export function computeAnnualStats({ quotes = [], invoices = [], expenses = [], data = {}, year } = {}) {
  const targetYear = Number(year) || new Date().getFullYear();
  const yearInvoices = filterInvoicesByYear(invoices, targetYear);
  const yearExpenses = filterExpensesByYear(expenses, targetYear);

  const revenueHT = yearInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.totalHT || 0),
    0
  );
  const expensesHT = yearExpenses.reduce(
    (sum, expense) => sum + Number(expense.amountHT || 0),
    0
  );

  return {
    year: targetYear,
    revenueHT: Math.round(revenueHT * 100) / 100,
    expensesHT: Math.round(expensesHT * 100) / 100,
    marginHT: Math.round((revenueHT - expensesHT) * 100) / 100,
    monthlyRevenue: computeMonthlyRevenueHT(invoices, targetYear),
    acceptance: computeQuoteAcceptanceRate(quotes, targetYear),
    topClients: computeTopClientsByRevenue(invoices, data, { year: targetYear }),
  };
}
