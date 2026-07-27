import { clientName } from "./documents";
import { getExpenseDate } from "./expenseSuppliers";
import { isCancelledInvoice, parseDocumentDate } from "./invoices";
import { inferProcessType } from "./production";
import { computeLineInternalCosts } from "./quoteMarginAssistant";

export const FINANCIAL_PERIOD_MODES = {
  MONTH: "month",
  YEAR: "year",
  ALL: "all",
};

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function percent(value, total) {
  return total > 0 ? round2((value / total) * 100) : 0;
}

function isInvoiceInPeriod(invoice, period) {
  if (isCancelledInvoice(invoice)) return false;
  if (period.mode === FINANCIAL_PERIOD_MODES.ALL) return true;
  const date = parseDocumentDate(invoice.date);
  if (!date || date.getFullYear() !== Number(period.year)) return false;
  return period.mode !== FINANCIAL_PERIOD_MODES.MONTH || date.getMonth() === Number(period.month);
}

function isExpenseInPeriod(expense, period) {
  if (period.mode === FINANCIAL_PERIOD_MODES.ALL) return true;
  const date = getExpenseDate(expense);
  if (!date || date.getFullYear() !== Number(period.year)) return false;
  return period.mode !== FINANCIAL_PERIOD_MODES.MONTH || date.getMonth() === Number(period.month);
}

function summarize(invoices, expenses) {
  const revenueHT = round2(invoices.reduce((sum, invoice) => sum + Number(invoice.totalHT || 0), 0));
  const expensesHT = round2(expenses.reduce((sum, expense) => sum + Number(expense.amountHT || 0), 0));
  const resultHT = round2(revenueHT - expensesHT);
  return {
    revenueHT,
    expensesHT,
    resultHT,
    marginRate: percent(resultHT, revenueHT),
    invoiceCount: invoices.length,
    averageCostPerInvoice: invoices.length ? round2(expensesHT / invoices.length) : 0,
    averageRevenuePerInvoice: invoices.length ? round2(revenueHT / invoices.length) : 0,
  };
}

function buildMonthlySeries(invoices, expenses, year) {
  const rows = Array.from({ length: 12 }, (_, month) => ({
    month,
    label: new Date(Number(year), month, 1).toLocaleDateString("fr-LU", { month: "short" }),
    revenueHT: 0,
    expensesHT: 0,
    resultHT: 0,
  }));

  for (const invoice of invoices) {
    if (isCancelledInvoice(invoice)) continue;
    const date = parseDocumentDate(invoice.date);
    if (date?.getFullYear() === Number(year)) rows[date.getMonth()].revenueHT += Number(invoice.totalHT || 0);
  }
  for (const expense of expenses) {
    const date = getExpenseDate(expense);
    if (date?.getFullYear() === Number(year)) rows[date.getMonth()].expensesHT += Number(expense.amountHT || 0);
  }

  return rows.map((row) => ({
    ...row,
    revenueHT: round2(row.revenueHT),
    expensesHT: round2(row.expensesHT),
    resultHT: round2(row.revenueHT - row.expensesHT),
  }));
}

function allocateByRevenue(entries, totalExpensesHT) {
  const totalRevenueHT = entries.reduce((sum, entry) => sum + entry.revenueHT, 0);
  return entries.map((entry) => {
    const expensesHT = totalRevenueHT > 0 ? round2(totalExpensesHT * (entry.revenueHT / totalRevenueHT)) : 0;
    const resultHT = round2(entry.revenueHT - expensesHT);
    return { ...entry, expensesHT, resultHT, marginRate: percent(resultHT, entry.revenueHT) };
  });
}

function buildTechniquePerformance(invoices, expensesHT) {
  const byTechnique = new Map();
  for (const invoice of invoices) {
    const process = inferProcessType(invoice);
    const key = process?.key || "other";
    const current = byTechnique.get(key) || { key, name: process?.label || "Autre", revenueHT: 0, count: 0 };
    current.revenueHT += Number(invoice.totalHT || 0);
    current.count += 1;
    byTechnique.set(key, current);
  }
  return allocateByRevenue([...byTechnique.values()], expensesHT)
    .map((entry) => ({ ...entry, revenueHT: round2(entry.revenueHT) }))
    .sort((left, right) => right.resultHT - left.resultHT);
}

function buildClientPerformance(invoices, data, expensesHT) {
  const byClient = new Map();
  for (const invoice of invoices) {
    const key = invoice.clientId || "unknown";
    const current = byClient.get(key) || { clientId: key, name: clientName(data, invoice.clientId), revenueHT: 0, count: 0 };
    current.revenueHT += Number(invoice.totalHT || 0);
    current.count += 1;
    byClient.set(key, current);
  }
  return allocateByRevenue([...byClient.values()], expensesHT)
    .map((entry) => ({ ...entry, revenueHT: round2(entry.revenueHT) }))
    .sort((left, right) => right.resultHT - left.resultHT)
    .slice(0, 10);
}

function buildProductPerformance(invoices, products = []) {
  const byProduct = new Map();
  for (const invoice of invoices) {
    for (const line of invoice.lines || []) {
      const key = line.productId || line.description || "other";
      const product = products.find((entry) => String(entry.id) === String(line.productId));
      const quantity = Number(line.quantity || 0);
      const revenueHT = Number(line.totalHT ?? line.subtotal ?? quantity * Number(line.price || 0));
      const current = byProduct.get(key) || {
        key,
        name: product?.name || line.description || "Produit",
        revenueHT: 0,
        costHT: 0,
        quantity: 0,
      };
      current.revenueHT += revenueHT;
      current.costHT += Number(computeLineInternalCosts(line, products).totalCost || 0);
      current.quantity += quantity;
      byProduct.set(key, current);
    }
  }
  return [...byProduct.values()]
    .map((entry) => {
      const revenueHT = round2(entry.revenueHT);
      const costHT = round2(entry.costHT);
      const resultHT = round2(revenueHT - costHT);
      return { ...entry, revenueHT, costHT, resultHT, marginRate: percent(resultHT, revenueHT) };
    })
    .sort((left, right) => right.resultHT - left.resultHT)
    .slice(0, 10);
}

function buildAlerts(monthly, selected, period) {
  const alerts = [];
  if (selected.resultHT < 0) alerts.push({ type: "negative_result", severity: "danger", label: "Résultat négatif" });
  if (selected.expensesHT > selected.revenueHT && selected.expensesHT > 0) {
    alerts.push({ type: "expenses_over_revenue", severity: "danger", label: "Charges supérieures au CA" });
  }
  if (selected.revenueHT > 0 && selected.marginRate < 20) {
    alerts.push({ type: "low_margin", severity: "warning", label: "Marge inférieure à 20 %" });
  }
  if (period.mode === FINANCIAL_PERIOD_MODES.MONTH && Number(period.month) > 0) {
    const current = monthly[Number(period.month)];
    const previous = monthly[Number(period.month) - 1];
    if (current.revenueHT < previous.revenueHT) alerts.push({ type: "revenue_down", severity: "warning", label: "CA en baisse par rapport au mois précédent" });
    if (previous.expensesHT > 0 && current.expensesHT > previous.expensesHT * 1.3) {
      alerts.push({ type: "expense_spike", severity: "warning", label: "Hausse importante des dépenses" });
    }
  }
  return alerts;
}

export function buildFinancialPerformance(data = {}, {
  period = { mode: FINANCIAL_PERIOD_MODES.MONTH, year: new Date().getFullYear(), month: new Date().getMonth() },
  referenceDate = new Date(),
} = {}) {
  const invoices = data.invoices || [];
  const expenses = data.expenses || [];
  const selectedInvoices = invoices.filter((invoice) => isInvoiceInPeriod(invoice, period));
  const selectedExpenses = expenses.filter((expense) => isExpenseInPeriod(expense, period));
  const selected = summarize(selectedInvoices, selectedExpenses);
  const analysisYear = Number(period.year) || referenceDate.getFullYear();
  const annualPeriod = { mode: FINANCIAL_PERIOD_MODES.YEAR, year: analysisYear };
  const annual = summarize(
    invoices.filter((invoice) => isInvoiceInPeriod(invoice, annualPeriod)),
    expenses.filter((expense) => isExpenseInPeriod(expense, annualPeriod))
  );
  const previousAnnualPeriod = { mode: FINANCIAL_PERIOD_MODES.YEAR, year: analysisYear - 1 };
  const previousAnnual = summarize(
    invoices.filter((invoice) => isInvoiceInPeriod(invoice, previousAnnualPeriod)),
    expenses.filter((expense) => isExpenseInPeriod(expense, previousAnnualPeriod))
  );
  const monthly = buildMonthlySeries(invoices, expenses, analysisYear);
  const elapsedMonths = analysisYear === referenceDate.getFullYear() ? referenceDate.getMonth() + 1 : 12;
  const elapsed = monthly.slice(0, Math.max(1, elapsedMonths));
  const elapsedRevenueHT = elapsed.reduce((sum, row) => sum + row.revenueHT, 0);
  const elapsedResultHT = elapsed.reduce((sum, row) => sum + row.resultHT, 0);
  const averageRevenueHT = round2(elapsedRevenueHT / elapsed.length);
  const averageResultHT = round2(elapsedResultHT / elapsed.length);
  const projectedRevenueHT = round2((elapsedRevenueHT / elapsed.length) * 12);
  const projectedResultHT = round2((elapsedResultHT / elapsed.length) * 12);
  const configuredMonthlyGoal = Number(data.settings?.monthlyRevenueGoal ?? 5000);
  const monthlyGoalHT = Number.isFinite(configuredMonthlyGoal) && configuredMonthlyGoal > 0
    ? configuredMonthlyGoal
    : 5000;
  const monthForGoal = period.mode === FINANCIAL_PERIOD_MODES.MONTH
    ? monthly[Number(period.month)]
    : monthly[Math.min(referenceDate.getMonth(), 11)];
  const bestMonth = monthly.reduce((best, row) => row.resultHT > best.resultHT ? row : best, monthly[0]);
  const worstMonth = monthly.reduce((worst, row) => row.resultHT < worst.resultHT ? row : worst, monthly[0]);

  return {
    period,
    selected,
    annual,
    previousAnnual,
    annualResultDeltaHT: round2(annual.resultHT - previousAnnual.resultHT),
    monthly,
    bestMonth,
    worstMonth,
    averageMonthlyResultHT: averageResultHT,
    monthlyGoal: {
      targetHT: monthlyGoalHT,
      revenueHT: monthForGoal?.revenueHT || 0,
      progress: percent(monthForGoal?.revenueHT || 0, monthlyGoalHT),
    },
    forecast: {
      averageRevenueHT,
      projectedRevenueHT,
      projectedResultHT,
      remainingRevenueHT: round2(Math.max(0, projectedRevenueHT - annual.revenueHT)),
    },
    financeBreakdown: {
      revenueHT: selected.revenueHT,
      purchaseCostHT: selected.expensesHT,
      grossMarginHT: selected.resultHT,
      resultHT: selected.resultHT,
    },
    resultTtcEstimate: round2(selected.resultHT * (1 + Number(data.settings?.taxRate || 17) / 100)),
    techniquePerformance: buildTechniquePerformance(selectedInvoices, selected.expensesHT),
    clientPerformance: buildClientPerformance(selectedInvoices, data, selected.expensesHT),
    productPerformance: buildProductPerformance(selectedInvoices, data.products || []),
    alerts: buildAlerts(monthly, selected, period),
  };
}
