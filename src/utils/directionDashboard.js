import { computeInvoiceProfitability } from "./profitability";
import { isCancelledInvoice, isPaidInvoice, parseDocumentDate } from "./invoices";
import { buildPaymentSummary } from "./payments";
import { clientName } from "./documents";
import { computeLineInternalCosts } from "./quoteMarginAssistant";

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function inYear(value, year) {
  const date = parseDocumentDate(value);
  return date && date.getFullYear() === Number(year);
}

function isAccepted(status) {
  return String(status || "").toLowerCase().includes("accept");
}

function isRefused(status) {
  const value = String(status || "").toLowerCase();
  return value.includes("refus") || value.includes("perdu");
}

function getOpenInvoiceAmount(invoice, payments = []) {
  if (isCancelledInvoice(invoice) || isPaidInvoice(invoice)) return 0;

  const storedRemaining = Number(invoice?.remaining);
  const hasStoredRemaining = !Number.isNaN(storedRemaining) && storedRemaining > 0.01;
  if (Number(invoice?.totalTTC || 0) <= 0 && hasStoredRemaining) {
    return round2(storedRemaining);
  }

  const summary = buildPaymentSummary(invoice, payments);
  if (
    isPaidInvoice({
      ...invoice,
      status: summary.status,
      paidAmount: summary.paidAmount,
      remaining: summary.remaining,
    })
  ) {
    return 0;
  }

  return summary.remaining > 0.01 ? round2(summary.remaining) : 0;
}

function pushMarginAggregate(map, key, label, row) {
  if (!key) return;
  const current = map.get(key) || {
    key,
    name: label || "Non renseigné",
    revenueHT: 0,
    marginHT: 0,
    totalCost: 0,
    count: 0,
  };
  current.revenueHT += Number(row.revenueHT || 0);
  current.marginHT += Number(row.marginHT || 0);
  current.totalCost += Number(row.totalCost || 0);
  current.count += 1;
  map.set(key, current);
}

function finalizeMarginAggregate(entries, limit = 5) {
  return [...entries]
    .map((entry) => ({
      ...entry,
      revenueHT: round2(entry.revenueHT),
      marginHT: round2(entry.marginHT),
      totalCost: round2(entry.totalCost),
      marginRate: entry.revenueHT > 0 ? Math.round((entry.marginHT / entry.revenueHT) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.marginHT - a.marginHT)
    .slice(0, limit);
}

export function buildDirectionDashboard(data = {}, { year = new Date().getFullYear() } = {}) {
  const invoices = (data.invoices || []).filter((invoice) => inYear(invoice.date, year));
  const quotes = (data.quotes || []).filter((quote) => inYear(quote.date || quote.createdAt, year));
  const monthlyRevenue = Array.from({ length: 12 }, (_, month) => ({
    month,
    label: new Date(Number(year), month, 1).toLocaleDateString("fr-FR", { month: "short" }),
    revenueHT: 0,
  }));

  for (const invoice of invoices) {
    const date = parseDocumentDate(invoice.date);
    if (date) monthlyRevenue[date.getMonth()].revenueHT += Number(invoice.totalHT || 0);
  }
  for (const entry of monthlyRevenue) entry.revenueHT = round2(entry.revenueHT);

  const acceptedQuotes = quotes.filter((quote) => isAccepted(quote.status));
  const refusedQuotes = quotes.filter((quote) => isRefused(quote.status));
  const decidedQuotes = acceptedQuotes.length + refusedQuotes.length;
  const unpaidInvoices = invoices
    .map((invoice) => ({ invoice, openAmount: getOpenInvoiceAmount(invoice, data.payments || []) }))
    .filter((entry) => entry.openAmount > 0.01);
  const profitabilityRows = invoices.map((invoice) => computeInvoiceProfitability(invoice, data));
  const lowMarginThreshold = Number(data.settings?.lowMarginAlertThreshold ?? 30);

  const topClientsMap = new Map();
  for (const invoice of invoices) {
    const current = topClientsMap.get(invoice.clientId) || {
      clientId: invoice.clientId,
      name: clientName(data, invoice.clientId),
      revenueHT: 0,
    };
    current.revenueHT += Number(invoice.totalHT || 0);
    topClientsMap.set(invoice.clientId, current);
  }

  const productMap = new Map();
  for (const invoice of invoices) {
    for (const line of invoice.lines || []) {
      const key = line.productId || line.description || "ligne";
      const product = (data.products || []).find((entry) => String(entry.id) === String(line.productId));
      const current = productMap.get(key) || {
        key,
        name: product?.name || line.description || "Produit",
        revenueHT: 0,
        costHT: 0,
        quantity: 0,
      };
      const qty = Number(line.quantity || 0);
      const revenue = Number(line.totalHT || line.subtotal || qty * Number(line.price || 0));
      current.revenueHT += revenue;
      current.costHT += computeLineInternalCosts(line, data.products || []).totalCost;
      current.quantity += qty;
      productMap.set(key, current);
    }
  }

  const knownProfitabilityRows = profitabilityRows.filter((row) => row.costSource !== "unknown");
  const unknownProfitabilityRows = profitabilityRows.filter((row) => row.costSource === "unknown");
  const marginByClientMap = new Map();
  const marginByProcessMap = new Map();
  const marginByOperatorMap = new Map();

  for (const row of knownProfitabilityRows) {
    pushMarginAggregate(marginByClientMap, row.clientId || "unknown", row.clientName, row);
    pushMarginAggregate(marginByProcessMap, row.processKey || row.processLabel || "other", row.processLabel, row);
    const quote = (data.quotes || []).find((entry) => String(entry.id) === String(row.quoteId));
    const operatorId = quote?.productionSheet?.operatorId || quote?.assignedTo || "";
    const operator = (data.users || []).find((user) => String(user.id) === String(operatorId));
    pushMarginAggregate(
      marginByOperatorMap,
      operatorId || "unassigned",
      operator?.name || operator?.email || "Non assigné",
      row
    );
  }

  const lowMarginRows = knownProfitabilityRows
    .filter((row) => row.revenueHT > 0 && row.marginRate < lowMarginThreshold)
    .sort((a, b) => a.marginRate - b.marginRate)
    .slice(0, 8);

  const marginAlerts = [
    ...lowMarginRows.map((row) => ({
      type: "low_margin",
      severity: row.marginHT < 0 ? "danger" : "warning",
      title: `Marge faible ${row.invoiceNumber || ""}`.trim(),
      message: `${row.clientName} · ${row.marginRate} % · ${round2(row.marginHT)} €`,
      invoiceId: row.invoiceId,
    })),
    ...unknownProfitabilityRows.slice(0, 8).map((row) => ({
      type: "missing_cost",
      severity: "warning",
      title: `Coûts à compléter ${row.invoiceNumber || ""}`.trim(),
      message: `${row.clientName} · ${round2(row.revenueHT)} € HT sans coût connu`,
      invoiceId: row.invoiceId,
    })),
  ];

  const marginHT = round2(knownProfitabilityRows.reduce((sum, row) => sum + row.marginHT, 0));
  const marginKnownRevenueHT = round2(knownProfitabilityRows.reduce((sum, row) => sum + row.revenueHT, 0));
  const revenueHT = round2(invoices.reduce((sum, invoice) => sum + Number(invoice.totalHT || 0), 0));
  const marginUnknownRevenueHT = round2(Math.max(0, revenueHT - marginKnownRevenueHT));

  return {
    year: Number(year),
    revenueHT,
    monthlyRevenue,
    acceptedQuoteCount: acceptedQuotes.length,
    refusedQuoteCount: refusedQuotes.length,
    conversionRate: decidedQuotes > 0 ? Math.round((acceptedQuotes.length / decidedQuotes) * 1000) / 10 : 0,
    unpaidAmount: round2(unpaidInvoices.reduce((sum, entry) => sum + entry.openAmount, 0)),
    unpaidCount: unpaidInvoices.length,
    marginHT,
    marginRate: marginKnownRevenueHT > 0 ? Math.round((marginHT / marginKnownRevenueHT) * 1000) / 10 : 0,
    marginKnownRevenueHT,
    marginUnknownRevenueHT,
    marginCoverageRate: revenueHT > 0 ? Math.round((marginKnownRevenueHT / revenueHT) * 1000) / 10 : 0,
    hasCompleteMargin: revenueHT > 0 && marginUnknownRevenueHT <= 0.01,
    lowMarginThreshold,
    marginByClient: finalizeMarginAggregate(marginByClientMap.values()),
    marginByProcess: finalizeMarginAggregate(marginByProcessMap.values()),
    marginByOperator: finalizeMarginAggregate(marginByOperatorMap.values()),
    lowMarginOrders: lowMarginRows.map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName,
      revenueHT: round2(row.revenueHT),
      marginHT: round2(row.marginHT),
      marginRate: row.marginRate,
    })),
    missingCostOrders: unknownProfitabilityRows.slice(0, 8).map((row) => ({
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName,
      revenueHT: round2(row.revenueHT),
    })),
    marginAlerts,
    topClients: [...topClientsMap.values()]
      .map((entry) => ({ ...entry, revenueHT: round2(entry.revenueHT) }))
      .sort((a, b) => b.revenueHT - a.revenueHT)
      .slice(0, 5),
    profitableProducts: [...productMap.values()]
      .map((entry) => ({
        ...entry,
        revenueHT: round2(entry.revenueHT),
        costHT: round2(entry.costHT),
        marginHT: round2(entry.revenueHT - entry.costHT),
      }))
      .sort((a, b) => b.marginHT - a.marginHT)
      .slice(0, 5),
  };
}
