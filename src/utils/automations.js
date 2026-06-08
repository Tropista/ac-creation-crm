import { getStaleDraftQuotes, getStaleSentQuotes } from "./documentTracking";
import { isInvoiceOverdue, isPaidInvoice, isCancelledInvoice } from "./invoices";
import { isStaleAfterSalesCase, isUnassignedOpenCase } from "./afterSales";
import { getLowStockProductsByKind, isOutOfStock } from "./stock";
import { computeInvoiceProfitability } from "./profitability";

export const AUTOMATION_ALERT_TYPES = {
  STALE_QUOTE: "stale_quote",
  UNPAID_INVOICE: "unpaid_invoice",
  LOW_STOCK: "low_stock",
  ORDER_READY: "order_ready",
  STALE_SAV: "stale_sav",
  UNASSIGNED_SAV: "unassigned_sav",
  LOW_MARGIN: "low_margin",
  MISSING_COST: "missing_cost",
};

export function detectStaleQuoteAlerts(quotes = [], { draftDays = 7, sentDays = 14 } = {}) {
  const draft = getStaleDraftQuotes(quotes, { minAgeDays: draftDays }).map((quote) => ({
    type: AUTOMATION_ALERT_TYPES.STALE_QUOTE,
    severity: "warning",
    title: `Devis brouillon ${quote.number}`,
    message: "Brouillon sans activité depuis plusieurs jours.",
    quoteId: quote.id,
    clientId: quote.clientId,
    createdAt: quote.updatedAt || quote.createdAt,
  }));

  const sent = getStaleSentQuotes(quotes, { minAgeDays: sentDays }).map((quote) => ({
    type: AUTOMATION_ALERT_TYPES.STALE_QUOTE,
    severity: "info",
    title: `Devis envoyé ${quote.number}`,
    message: "Devis envoyé sans réponse depuis longtemps.",
    quoteId: quote.id,
    clientId: quote.clientId,
    createdAt: quote.sentAt || quote.updatedAt,
  }));

  return [...draft, ...sent];
}

export function detectUnpaidInvoiceAlerts(invoices = [], referenceDate = new Date()) {
  return (invoices || [])
    .filter(
      (invoice) =>
        !isPaidInvoice(invoice) &&
        !isCancelledInvoice(invoice) &&
        isInvoiceOverdue(invoice, referenceDate)
    )
    .map((invoice) => ({
      type: AUTOMATION_ALERT_TYPES.UNPAID_INVOICE,
      severity: "danger",
      title: `Facture impayée ${invoice.number}`,
      message: `Échéance dépassée — reste ${Number(invoice.remaining ?? invoice.totalTTC ?? 0).toFixed(2)} €`,
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      createdAt: invoice.dueDate || invoice.date,
    }));
}

export function detectLowStockAlerts(products = [], settings = {}) {
  const lowStock = getLowStockProductsByKind(products, settings);
  const outOfStock = (products || []).filter((product) => isOutOfStock(product));

  const alerts = lowStock.map((product) => ({
    type: AUTOMATION_ALERT_TYPES.LOW_STOCK,
    severity: "warning",
    title: `Stock bas — ${product.name}`,
    message: `Stock actuel : ${product.stock ?? 0}`,
    productId: product.id,
    createdAt: new Date().toISOString(),
  }));

  for (const product of outOfStock) {
    if (lowStock.some((entry) => entry.id === product.id)) continue;
    alerts.push({
      type: AUTOMATION_ALERT_TYPES.LOW_STOCK,
      severity: "danger",
      title: `Rupture — ${product.name}`,
      message: "Produit en rupture de stock.",
      productId: product.id,
      createdAt: new Date().toISOString(),
    });
  }

  return alerts;
}

export function detectOrderReadyAlerts(quotes = []) {
  return (quotes || [])
    .filter((quote) => String(quote.status || "").trim() === "Prêt")
    .map((quote) => ({
      type: AUTOMATION_ALERT_TYPES.ORDER_READY,
      severity: "success",
      title: `Commande prête ${quote.number}`,
      message: "Commande prête — notifier le client.",
      quoteId: quote.id,
      clientId: quote.clientId,
      createdAt: quote.updatedAt || quote.createdAt,
    }));
}

export function detectStaleSavAlerts(cases = [], staleDays = 14) {
  return (cases || [])
    .filter((entry) => isStaleAfterSalesCase(entry, staleDays))
    .map((entry) => ({
      type: AUTOMATION_ALERT_TYPES.STALE_SAV,
      severity: "warning",
      title: `SAV en attente — ${entry.subject || entry.type}`,
      message: "Dossier SAV sans mise à jour récente.",
      caseId: entry.id,
      clientId: entry.clientId,
      createdAt: entry.updatedAt || entry.openedAt,
    }));
}

export function detectUnassignedSavAlerts(cases = []) {
  return (cases || [])
    .filter((entry) => isUnassignedOpenCase(entry))
    .map((entry) => ({
      type: AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV,
      severity: "warning",
      title: `SAV non assigné — ${entry.subject || entry.type}`,
      message: "Dossier ouvert sans responsable assigné.",
      caseId: entry.id,
      clientId: entry.clientId,
      createdAt: entry.updatedAt || entry.openedAt,
    }));
}

export function detectMarginAlerts(data = {}, { lowMarginThreshold = 30 } = {}) {
  const safeData = {
    clients: [],
    products: [],
    quotes: [],
    invoices: [],
    ...data,
  };
  const rows = (safeData.invoices || []).map((invoice) => computeInvoiceProfitability(invoice, safeData));
  const lowMargin = rows
    .filter((row) => row.costSource !== "unknown" && row.revenueHT > 0 && row.marginRate < lowMarginThreshold)
    .map((row) => ({
      type: AUTOMATION_ALERT_TYPES.LOW_MARGIN,
      severity: row.marginHT < 0 ? "danger" : "warning",
      title: `Marge faible ${row.invoiceNumber || ""}`.trim(),
      message: `${row.clientName} · marge ${row.marginRate} %`,
      invoiceId: row.invoiceId,
      clientId: row.clientId,
      createdAt: new Date().toISOString(),
    }));

  const missingCost = rows
    .filter((row) => row.costSource === "unknown" && row.revenueHT > 0)
    .map((row) => ({
      type: AUTOMATION_ALERT_TYPES.MISSING_COST,
      severity: "warning",
      title: `Coûts à compléter ${row.invoiceNumber || ""}`.trim(),
      message: `${row.clientName} · ${Number(row.revenueHT || 0).toFixed(2)} € HT sans coût connu`,
      invoiceId: row.invoiceId,
      clientId: row.clientId,
      createdAt: new Date().toISOString(),
    }));

  return [...lowMargin, ...missingCost];
}

export function buildAutomationAlerts(data = {}, options = {}) {
  const alerts = [
    ...detectStaleQuoteAlerts(data.quotes, options),
    ...detectUnpaidInvoiceAlerts(data.invoices),
    ...detectLowStockAlerts(data.products, data.settings),
    ...detectOrderReadyAlerts(data.quotes),
    ...detectStaleSavAlerts(data.afterSalesCases, options.savStaleDays),
    ...detectUnassignedSavAlerts(data.afterSalesCases),
    ...detectMarginAlerts(data, {
      lowMarginThreshold: Number(data.settings?.lowMarginAlertThreshold ?? options.lowMarginThreshold ?? 30),
    }),
  ];

  return alerts.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}

function severityRank(severity) {
  if (severity === "danger") return 3;
  if (severity === "warning") return 2;
  if (severity === "success") return 1;
  return 0;
}

export function countAutomationAlerts(data = {}, options = {}) {
  const alerts = buildAutomationAlerts(data, options);
  const byType = {};

  for (const alert of alerts) {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  }

  return {
    total: alerts.length,
    byType,
    alerts,
  };
}

export function getSidebarAutomationBadgeCount(data = {}) {
  const { total } = countAutomationAlerts(data);
  return total > 99 ? "99+" : total > 0 ? String(total) : "";
}
