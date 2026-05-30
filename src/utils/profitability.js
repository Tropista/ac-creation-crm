import { clientName } from "./documents";
import { isCancelledInvoice, isPaidInvoice } from "./invoices";
import { buildPaymentSummary, enrichInvoiceWithPayments } from "./payments";
import { resolveProcessType } from "./production";

const DEFAULT_MACHINE_HOURLY = 25;
const DEFAULT_OPERATOR_HOURLY = 18;

export function normalizeProductionCosts(quote = {}) {
  const sheet = quote.productionSheet || {};
  return {
    materialCost: Number(sheet.materialCost ?? quote.materialCost ?? 0),
    machineCost: Number(sheet.machineCost ?? quote.machineCost ?? 0),
    estimatedMinutes: Number(sheet.estimatedMinutes ?? quote.estimatedMinutes ?? 0),
    realMinutes: Number(sheet.realMinutes ?? quote.realMinutes ?? 0),
    machine: sheet.machine || quote.productionMachine || "",
    operatorId: sheet.operatorId || quote.assignedTo || "",
  };
}

export function computeOrderProfitability(quote, data = {}, options = {}) {
  const revenueHT = Number(quote?.totalHT || 0);
  const costs = normalizeProductionCosts(quote);
  const machineRate = Number(options.machineHourlyRate ?? DEFAULT_MACHINE_HOURLY);
  const operatorRate = Number(options.operatorHourlyRate ?? DEFAULT_OPERATOR_HOURLY);

  const minutes = costs.realMinutes > 0 ? costs.realMinutes : costs.estimatedMinutes;
  const timeCost =
    Math.round(((minutes / 60) * (machineRate + operatorRate)) * 100) / 100;

  const materialCost = costs.materialCost;
  const machineCost =
    costs.machineCost > 0
      ? costs.machineCost
      : Math.round(((minutes / 60) * machineRate) * 100) / 100;

  const totalCost = Math.round((materialCost + machineCost + timeCost) * 100) / 100;
  const marginHT = Math.round((revenueHT - totalCost) * 100) / 100;
  const marginRate = revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0;

  const process = resolveProcessType(quote);
  const operator = (data.users || []).find(
    (user) => String(user.id) === String(costs.operatorId)
  );

  return {
    quoteId: quote?.id,
    quoteNumber: quote?.number,
    clientId: quote?.clientId,
    clientName: clientName(data, quote?.clientId),
    processKey: process.key,
    processLabel: process.label,
    machine: costs.machine || process.label,
    operatorId: costs.operatorId,
    operatorName: operator?.name || operator?.email || "—",
    revenueHT,
    materialCost,
    machineCost,
    timeCost,
    totalCost,
    marginHT,
    marginRate,
    estimatedMinutes: costs.estimatedMinutes,
    realMinutes: costs.realMinutes,
  };
}

export function aggregateProfitabilityByClient(quotes = [], data = {}, options = {}) {
  const map = new Map();

  for (const quote of quotes || []) {
    if (!quote?.clientId) continue;
    const row = computeOrderProfitability(quote, data, options);
    const current = map.get(quote.clientId) || {
      clientId: quote.clientId,
      name: row.clientName,
      revenueHT: 0,
      totalCost: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.revenueHT += row.revenueHT;
    current.totalCost += row.totalCost;
    current.marginHT += row.marginHT;
    current.orderCount += 1;
    map.set(quote.clientId, current);
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      revenueHT: Math.round(entry.revenueHT * 100) / 100,
      totalCost: Math.round(entry.totalCost * 100) / 100,
      marginHT: Math.round(entry.marginHT * 100) / 100,
      marginRate:
        entry.revenueHT > 0
          ? Math.round((entry.marginHT / entry.revenueHT) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.marginHT - a.marginHT);
}

export function aggregateProfitabilityByMachine(quotes = [], data = {}, options = {}) {
  const map = new Map();

  for (const quote of quotes || []) {
    const row = computeOrderProfitability(quote, data, options);
    const key = row.machine || row.processLabel || "Autre";
    const current = map.get(key) || {
      machine: key,
      revenueHT: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.revenueHT += row.revenueHT;
    current.marginHT += row.marginHT;
    current.orderCount += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.marginHT - a.marginHT);
}

export function findQuoteForInvoice(invoice, quotes = []) {
  const quoteId = invoice?.parentQuoteId || invoice?.quoteId || "";
  if (!quoteId) return null;
  return quotes.find((quote) => String(quote.id) === String(quoteId)) || null;
}

export function quoteHasProductionCosts(quote) {
  if (!quote) return false;
  const costs = normalizeProductionCosts(quote);
  return (
    costs.materialCost > 0 ||
    costs.machineCost > 0 ||
    costs.estimatedMinutes > 0 ||
    costs.realMinutes > 0
  );
}

export function computeLineCostsFromProducts(lines = [], products = []) {
  return Math.round(
    (lines || []).reduce((sum, line) => {
      const product = (products || []).find(
        (entry) => String(entry.id) === String(line.productId)
      );
      const unitCost = Number(
        line.purchasePrice ?? line.unitCost ?? product?.purchasePrice ?? 0
      );
      const qty = Number(line.quantity || 0);
      return sum + unitCost * qty;
    }, 0) * 100
  ) / 100;
}

function resolveInvoiceRevenueHT(invoice) {
  const direct = Number(invoice?.totalHT || 0);
  if (direct > 0) return Math.round(direct * 100) / 100;
  const fromLines = (invoice?.lines || []).reduce(
    (sum, line) => sum + Number(line.totalHT || line.subtotal || 0),
    0
  );
  return Math.round(fromLines * 100) / 100;
}

export function computeInvoiceProfitability(invoice, data = {}, options = {}) {
  const revenueHT = resolveInvoiceRevenueHT(invoice);
  const quote = findQuoteForInvoice(invoice, data.quotes);

  if (quoteHasProductionCosts(quote)) {
    const quoteRow = computeOrderProfitability(quote, data, options);
    const totalCost = quoteRow.totalCost;
    const marginHT = Math.round((revenueHT - totalCost) * 100) / 100;
    return {
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.number,
      quoteId: quote.id,
      quoteNumber: quote.number,
      clientId: invoice?.clientId,
      clientName: clientName(data, invoice?.clientId),
      processKey: quoteRow.processKey,
      processLabel: quoteRow.processLabel,
      machine: quoteRow.machine,
      revenueHT,
      totalCost,
      marginHT,
      marginRate: revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0,
      costSource: "atelier",
    };
  }

  const totalCost = computeLineCostsFromProducts(invoice?.lines, data.products);
  const marginHT = Math.round((revenueHT - totalCost) * 100) / 100;
  const process = quote ? resolveProcessType(quote) : { key: "catalogue", label: "Catalogue" };

  return {
    invoiceId: invoice?.id,
    invoiceNumber: invoice?.number,
    quoteId: quote?.id || "",
    quoteNumber: quote?.number || "",
    clientId: invoice?.clientId,
    clientName: clientName(data, invoice?.clientId),
    processKey: process.key,
    processLabel: process.label,
    machine: quote?.productionSheet?.machine || quote?.productionMachine || process.label,
    revenueHT,
    totalCost,
    marginHT,
    marginRate: revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0,
    costSource: totalCost > 0 ? "products" : "unknown",
  };
}

export function getPaidInvoicesWithLedger(invoices = [], payments = []) {
  return (invoices || [])
    .filter((invoice) => !isCancelledInvoice(invoice))
    .map((invoice) => {
      const summary = buildPaymentSummary(invoice, payments);
      return enrichInvoiceWithPayments(
        {
          ...invoice,
          paidAmount: summary.paidAmount,
          remaining: summary.remaining,
          status: summary.status,
        },
        payments
      );
    })
    .filter((invoice) => isPaidInvoice(invoice));
}

export function hasPaidInvoiceForQuote(quote, invoices = []) {
  if (!quote?.id) return false;
  return (invoices || []).some(
    (invoice) =>
      isPaidInvoice(invoice) &&
      String(invoice.parentQuoteId || invoice.quoteId || "") === String(quote.id)
  );
}

function finalizeClientAggregate(entry) {
  return {
    ...entry,
    revenueHT: Math.round(entry.revenueHT * 100) / 100,
    totalCost: Math.round(entry.totalCost * 100) / 100,
    marginHT: Math.round(entry.marginHT * 100) / 100,
    marginRate:
      entry.revenueHT > 0
        ? Math.round((entry.marginHT / entry.revenueHT) * 1000) / 10
        : 0,
  };
}

export function aggregateProfitabilityByClientFromInvoices(
  invoices = [],
  data = {},
  options = {}
) {
  const map = new Map();

  for (const invoice of invoices || []) {
    if (!invoice?.clientId) continue;
    const row = computeInvoiceProfitability(invoice, data, options);
    const current = map.get(invoice.clientId) || {
      clientId: invoice.clientId,
      name: row.clientName,
      revenueHT: 0,
      totalCost: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.revenueHT += row.revenueHT;
    current.totalCost += row.totalCost;
    current.marginHT += row.marginHT;
    current.orderCount += 1;
    map.set(invoice.clientId, current);
  }

  return [...map.values()]
    .map(finalizeClientAggregate)
    .sort((a, b) => b.marginHT - a.marginHT);
}

export function aggregateProfitabilityByMachineFromInvoices(
  invoices = [],
  data = {},
  options = {}
) {
  const map = new Map();

  for (const invoice of invoices || []) {
    const row = computeInvoiceProfitability(invoice, data, options);
    const key = row.machine || row.processLabel || "Autre";
    const current = map.get(key) || {
      machine: key,
      revenueHT: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.revenueHT += row.revenueHT;
    current.marginHT += row.marginHT;
    current.orderCount += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.marginHT - a.marginHT);
}

export function mergeProfitabilityClientRows(rowsA = [], rowsB = []) {
  const map = new Map();

  for (const row of [...rowsA, ...rowsB]) {
    if (!row?.clientId) continue;
    const current = map.get(row.clientId) || {
      clientId: row.clientId,
      name: row.name,
      revenueHT: 0,
      totalCost: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.name = row.name || current.name;
    current.revenueHT += Number(row.revenueHT || 0);
    current.totalCost += Number(row.totalCost || 0);
    current.marginHT += Number(row.marginHT || 0);
    current.orderCount += Number(row.orderCount || 0);
    map.set(row.clientId, current);
  }

  return [...map.values()]
    .map(finalizeClientAggregate)
    .sort((a, b) => b.marginHT - a.marginHT);
}

export function mergeProfitabilityMachineRows(rowsA = [], rowsB = []) {
  const map = new Map();

  for (const row of [...rowsA, ...rowsB]) {
    const key = row.machine || "Autre";
    const current = map.get(key) || {
      machine: key,
      revenueHT: 0,
      marginHT: 0,
      orderCount: 0,
    };
    current.revenueHT += Number(row.revenueHT || 0);
    current.marginHT += Number(row.marginHT || 0);
    current.orderCount += Number(row.orderCount || 0);
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.marginHT - a.marginHT);
}

const PRODUCTION_QUOTE_STATUSES = ["En production", "Prêt", "Livré"];

export function buildDashboardProfitability(data = {}, options = {}) {
  const invoices = data.invoices || [];
  const payments = data.payments || [];
  const quotes = data.quotes || [];

  const paidInvoices = getPaidInvoicesWithLedger(invoices, payments);
  const fromInvoicesClient = aggregateProfitabilityByClientFromInvoices(
    paidInvoices,
    data,
    options
  );
  const fromInvoicesMachine = aggregateProfitabilityByMachineFromInvoices(
    paidInvoices,
    data,
    options
  );

  const supplementalQuotes = quotes.filter(
    (quote) =>
      PRODUCTION_QUOTE_STATUSES.includes(String(quote.status || "")) &&
      !hasPaidInvoiceForQuote(quote, invoices)
  );

  return {
    byClient: mergeProfitabilityClientRows(
      fromInvoicesClient,
      aggregateProfitabilityByClient(supplementalQuotes, data, options)
    ),
    byMachine: mergeProfitabilityMachineRows(
      fromInvoicesMachine,
      aggregateProfitabilityByMachine(supplementalQuotes, data, options)
    ),
    paidInvoiceCount: paidInvoices.length,
    supplementalQuoteCount: supplementalQuotes.length,
  };
}

export function aggregateProfitabilityByOperator(quotes = [], data = {}, options = {}) {
  const map = new Map();

  for (const quote of quotes || []) {
    const row = computeOrderProfitability(quote, data, options);
    const key = row.operatorId || "unassigned";
    const current = map.get(key) || {
      operatorId: row.operatorId,
      operatorName: row.operatorName,
      revenueHT: 0,
      marginHT: 0,
      orderCount: 0,
      realMinutes: 0,
    };
    current.revenueHT += row.revenueHT;
    current.marginHT += row.marginHT;
    current.orderCount += 1;
    current.realMinutes += row.realMinutes || row.estimatedMinutes;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.marginHT - a.marginHT);
}

export const PRODUCTION_CHECKLIST_ITEMS = [
  "Fichiers vérifiés",
  "Matériau préparé",
  "Machine calibrée",
  "Contrôle qualité",
  "Emballage prêt",
];

export function normalizeProductionSheet(quote = {}) {
  const existing = quote.productionSheet || {};
  const checklist = PRODUCTION_CHECKLIST_ITEMS.map((label, index) => {
    const entry = (existing.checklist || [])[index];
    return {
      label,
      done: Boolean(entry?.done),
    };
  });

  return {
    machine: existing.machine || quote.productionMachine || "",
    material: existing.material || "",
    estimatedMinutes: Number(existing.estimatedMinutes || 0),
    realMinutes: Number(existing.realMinutes || 0),
    operatorId: existing.operatorId || quote.assignedTo || "",
    materialCost: Number(existing.materialCost || 0),
    machineCost: Number(existing.machineCost || 0),
    productionNote: existing.productionNote || quote.atelierNotes || "",
    files: Array.isArray(existing.files) ? existing.files : [],
    checklist,
  };
}

export function mergeProductionSheetUpdate(quote, patch = {}) {
  const current = normalizeProductionSheet(quote);
  return {
    ...quote,
    productionSheet: {
      ...current,
      ...patch,
      checklist: patch.checklist ?? current.checklist,
      files: patch.files ?? current.files,
    },
    atelierNotes: patch.productionNote ?? current.productionNote,
    assignedTo: patch.operatorId ?? current.operatorId ?? quote.assignedTo,
    productionMachine: patch.machine ?? current.machine,
  };
}
