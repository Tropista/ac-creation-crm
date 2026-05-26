import { parseDocumentDate } from "./invoices";

/**
 * Date d'achat (purchaseDate) ou date de création, formats JJ/MM/AAAA ou ISO.
 */
export function parseExpenseDate(expense) {
  const value = expense?.purchaseDate || expense?.createdAt;
  if (!value) return null;
  return parseDocumentDate(value);
}

export function isExpenseInYear(expense, year) {
  const date = parseExpenseDate(expense);
  if (!date) return false;
  const targetYear = Number(year);
  if (!Number.isFinite(targetYear)) return false;
  return date.getFullYear() === targetYear;
}

export function filterExpensesByYear(expenses, year) {
  return (expenses || []).filter((expense) => isExpenseInYear(expense, year));
}

export function collectExpenseYears(
  expenses,
  fallbackYear = new Date().getFullYear()
) {
  const years = new Set([Number(fallbackYear)]);
  for (const expense of expenses || []) {
    const date = parseExpenseDate(expense);
    if (date) years.add(date.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export function computeExpenseYearTotals(expenses) {
  return (expenses || []).reduce(
    (acc, expense) => {
      acc.count += 1;
      acc.ht += Number(expense.amountHT || 0);
      acc.vat += Number(expense.vatAmount || 0);
      acc.ttc += Number(expense.totalTTC || 0);
      return acc;
    },
    { count: 0, ht: 0, vat: 0, ttc: 0 }
  );
}

export function computeExpenseMonthlyBreakdown(expenses, year) {
  const targetYear = Number(year);
  const byMonth = Array.from({ length: 12 }, () => ({
    count: 0,
    ht: 0,
    vat: 0,
    ttc: 0,
  }));

  for (const expense of expenses || []) {
    const date = parseExpenseDate(expense);
    if (!date || date.getFullYear() !== targetYear) continue;
    const month = date.getMonth();
    byMonth[month].count += 1;
    byMonth[month].ht += Number(expense.amountHT || 0);
    byMonth[month].vat += Number(expense.vatAmount || 0);
    byMonth[month].ttc += Number(expense.totalTTC || 0);
  }

  return byMonth.map((totals, month) => ({
    month,
    label: new Date(targetYear, month, 1).toLocaleDateString("fr-FR", {
      month: "long",
    }),
    ...totals,
  }));
}
