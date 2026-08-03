import { applyStockByLines } from "./stock.js";
import { buildCompanySnapshot } from "./companySnapshot.js";
import { computeDueDate } from "./invoiceReminders.js";
import { getInvoicePaidAmount } from "./invoices.js";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export function today() {
  return new Date().toLocaleDateString("fr-FR");
}

export function clientName(data, id) {
  return data.clients.find((c) => c.id === id)?.name || "Client supprimé";
}

/** TVA applicable au devis/facture : override client ou paramètre entreprise. */
export function resolveDocumentTaxRate(client, settings = {}) {
  const defaultRate = Number(settings.taxRate ?? 17);
  if (
    client?.taxRateOverride === null ||
    client?.taxRateOverride === undefined ||
    client?.taxRateOverride === ""
  ) {
    return defaultRate;
  }
  const override = Number(client.taxRateOverride);
  return Number.isFinite(override) ? override : defaultRate;
}

export function formatTaxRateLabel(rate, settings = {}) {
  const defaultRate = Number(settings.taxRate ?? 17);
  if (rate === defaultRate) return `TVA (${rate} % — défaut)`;
  if (rate === 0) return "TVA (0 % — autoliquidation / intra-UE)";
  return `TVA (${rate} %)`;
}

export function statusClass(status) {
  return (
    "badge " +
    String(status || "")
      .toLowerCase()
      .replaceAll(" ", "-")
      .replaceAll("é", "e")
      .replaceAll("è", "e")
      .replaceAll("ê", "e")
      .replaceAll("à", "a")
      .replaceAll("â", "a")
      .replaceAll("û", "u")
      .replaceAll("î", "i")
      .replaceAll("ô", "o")
  );
}

export function getDocumentBillingDetail(doc = {}) {
  return String(doc.billingDetail || "").trim();
}

export function dedupeDocuments(items = []) {
  const map = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const key = String(item.id || item.number || JSON.stringify(item));
    map.set(key, { ...map.get(key), ...item });
  }

  return Array.from(map.values());
}
export function createBackupSnapshot(data, label = "Sauvegarde automatique") {
  const safeData = normalizeData(data);

  return {
    id: uid(),
    label,
    createdAt: new Date().toISOString(),

    clientsCount: safeData.clients.length,
    productsCount: safeData.products.length,
    invoicesCount: safeData.invoices.length,
    quotesCount: safeData.quotes.length,

    data: {
      ...safeData,
      backups: [],
    },
  };
}
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
export function normalizeData(data) {
  return {
    ...data,

    users: data.users || [],
    clients: data.clients || [],
    products: data.products || [],
    categories: data.categories || [],

    quotes: data.quotes || [],
    invoices: data.invoices || [],
    deliveryNotes: data.deliveryNotes || [],
    creditNotes: data.creditNotes || [],
    afterSalesCases: data.afterSalesCases || [],
    payments: data.payments || [],

    backups: data.backups || [],
    logs: data.logs || [],

    settings: data.settings || {},
  };
}
export function pruneBackups(backups, max = 12) {
  return [...(backups || [])]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, max);
}

export function currentDocumentYear() {
  return new Date().getFullYear();
}

export function getInvoiceNumberSettings(settings = {}) {
  const prefix = String(settings.invoiceNumberPrefix || "FAC").trim() || "FAC";
  const rawPadding = Number(settings.invoiceNumberPadding);
  const padding = Number.isFinite(rawPadding)
    ? Math.min(6, Math.max(3, Math.round(rawPadding)))
    : 4;

  return { prefix, padding };
}

export function formatDocumentNumber(prefix, year, sequence, padding = 4) {
  return `${prefix}-${year}-${String(sequence).padStart(padding, "0")}`;
}

export function parseDocumentSequence(number, docPrefix, year, padding = 4) {
  const value = String(number || "");
  const pattern = new RegExp(
    `^${docPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-${year}-(\\d{${padding},})$`,
  );
  const match = value.match(pattern);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isNaN(sequence) ? null : sequence;
}

export function nextDocumentNumber(
  list,
  docPrefix,
  year = currentDocumentYear(),
  options = {},
) {
  const padding = options.padding ?? 4;
  const numbers = (list || [])
    .map((doc) => parseDocumentSequence(doc.number, docPrefix, year, padding))
    .filter((value) => value != null);

  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return formatDocumentNumber(docPrefix, year, nextNumber, padding);
}

export function nextInvoiceNumber(
  invoices,
  settings,
  year = currentDocumentYear(),
) {
  const { prefix, padding } = getInvoiceNumberSettings(settings);
  return nextDocumentNumber(invoices, prefix, year, { padding });
}

export function detectDocumentNumberGaps(
  docs,
  prefix,
  year = currentDocumentYear(),
  padding = 4,
) {
  const sequences = (docs || [])
    .map((doc) => parseDocumentSequence(doc.number, prefix, year, padding))
    .filter((value) => value != null)
    .sort((a, b) => a - b);

  if (sequences.length === 0) return [];

  const max = sequences[sequences.length - 1];
  const present = new Set(sequences);
  const missing = [];

  for (let index = 1; index < max; index += 1) {
    if (!present.has(index)) {
      missing.push(formatDocumentNumber(prefix, year, index, padding));
    }
  }

  return missing;
}

export function detectInvoiceNumberGaps(
  invoices,
  settings,
  year = currentDocumentYear(),
) {
  const { prefix, padding } = getInvoiceNumberSettings(settings);
  return detectDocumentNumberGaps(invoices, prefix, year, padding);
}

export function isFullInvoiceFromQuote(invoice, quoteNumber) {
  if (String(invoice?.convertedFrom || "") !== String(quoteNumber || ""))
    return false;
  const type = String(invoice?.invoiceType || "");
  return type !== "acompte" && type !== "solde";
}

export function getQuoteDepositInvoices(data, quote) {
  const quoteId = String(quote?.id || "");
  if (!quoteId) return [];
  return (data.invoices || []).filter(
    (invoice) =>
      String(invoice.invoiceType || "") === "acompte" &&
      String(invoice.parentQuoteId || "") === quoteId,
  );
}

export function getQuoteBalanceInvoice(data, quote) {
  const quoteId = String(quote?.id || "");
  if (!quoteId) return null;
  return (
    (data.invoices || []).find(
      (invoice) =>
        String(invoice.invoiceType || "") === "solde" &&
        String(invoice.parentQuoteId || "") === quoteId,
    ) || null
  );
}

export function quoteHasBalanceInvoice(data, quote) {
  return Boolean(getQuoteBalanceInvoice(data, quote));
}

export function getQuoteDepositSummary(data, quote) {
  const depositInvoices = getQuoteDepositInvoices(data, quote);
  const quoteTotalTTC = Number(quote?.totalTTC || 0);
  const invoicedDeposit = depositInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.totalTTC || 0),
    0,
  );
  const paidDeposit = depositInvoices.reduce(
    (sum, invoice) => sum + getInvoicePaidAmount(invoice),
    0,
  );
  const remainingBalance =
    Math.round((quoteTotalTTC - paidDeposit) * 100) / 100;
  const hasDeposits =
    depositInvoices.length > 0 || Number(quote?.depositPercent || 0) > 0;

  return {
    depositInvoices,
    invoicedDeposit: Math.round(invoicedDeposit * 100) / 100,
    paidDeposit: Math.round(paidDeposit * 100) / 100,
    remainingBalance,
    hasDeposits,
    hasBalanceInvoice: quoteHasBalanceInvoice(data, quote),
    canCreateBalance:
      depositInvoices.length > 0 &&
      !quoteHasBalanceInvoice(data, quote) &&
      remainingBalance > 0.01,
  };
}

export function quoteRequiresDepositFlow(data, quote) {
  const summary = getQuoteDepositSummary(data, quote);
  return summary.hasDeposits;
}

export function quoteAlreadyConverted(data, quote) {
  const quoteNumber = String(quote?.number || "");
  if (!quoteNumber) return false;
  return (data.invoices || []).some((invoice) =>
    isFullInvoiceFromQuote(invoice, quoteNumber),
  );
}

export function quoteIsFullyInvoiced(data, quote) {
  return (
    quoteAlreadyConverted(data, quote) || quoteHasBalanceInvoice(data, quote)
  );
}

const CONVERTIBLE_QUOTE_STATUSES = new Set([
  "Accepté",
  "En production",
  "Prêt",
  "Livré",
]);

export function isQuoteConvertible(data, quote) {
  const status = String(quote?.status || "").trim();
  if (!CONVERTIBLE_QUOTE_STATUSES.has(status)) return false;
  return !quoteAlreadyConverted(data, quote);
}

export function convertQuoteToInvoiceData(data, quote) {
  const depositSummary = getQuoteDepositSummary(data, quote);
  if (depositSummary.depositInvoices.length > 0) {
    throw new Error(
      "Ce devis possède des factures d'acompte. Utilisez « Facture de solde ».",
    );
  }
  if (Number(quote?.depositPercent || 0) > 0) {
    throw new Error(
      "Ce devis prévoit un acompte. Créez d'abord la facture d'acompte, puis la facture de solde.",
    );
  }

  const invoice = {
    ...quote,
    id: uid(),
    number: nextInvoiceNumber(data.invoices || [], data.settings),
    companySnapshot:
      quote.companySnapshot || buildCompanySnapshot(data.settings || {}),
    date: today(),
    status: "Non payée",
    dueDate: computeDueDate(today(), data.settings?.paymentDays),
    stockAdjusted: true,
    convertedFrom: quote.number,
    paidAmount: 0,
    remaining: Number(quote.totalTTC || 0),
  };

  return {
    ...data,
    products: applyStockByLines(
      data.products || [],
      invoice.lines || [],
      "remove",
      {
        type: "invoice",
        reason: "Conversion devis en facture",
        reference: invoice.number,
      },
    ),
    invoices: [...(data.invoices || []), invoice],
  };
}

export const DELIVERY_NOTE_ELIGIBLE_STATUSES = ["Prêt", "Livré"];

export function isQuoteDeliveryNoteEligible(quote) {
  return DELIVERY_NOTE_ELIGIBLE_STATUSES.includes(
    String(quote?.status || "").trim(),
  );
}

export function quoteHasDeliveryNote(data, quote) {
  const quoteNumber = String(quote?.number || "");
  if (!quoteNumber) return false;
  return (data.deliveryNotes || []).some(
    (note) =>
      String(note.quoteNumber || "") === quoteNumber ||
      String(note.quoteId || "") === String(quote?.id || ""),
  );
}

export function getDeliveryNoteForQuote(data, quote) {
  const quoteNumber = String(quote?.number || "");
  return (data.deliveryNotes || []).find(
    (note) =>
      String(note.quoteNumber || "") === quoteNumber ||
      String(note.quoteId || "") === String(quote?.id || ""),
  );
}

function normalizeDeliveryLines(quote, products = []) {
  const sourceLines = quote?.lines?.length
    ? quote.lines
    : [
        {
          productId: quote?.productId,
          sku: quote?.sku,
          description: quote?.description,
          quantity: quote?.quantity || 1,
        },
      ];

  return sourceLines
    .filter((line) => line.description && Number(line.quantity || 0) > 0)
    .map((line) => {
      const product = products.find(
        (p) => String(p.id) === String(line.productId),
      );
      return {
        productId: line.productId || product?.id || "",
        sku: line.sku || product?.sku || "",
        description: line.description || product?.name || "",
        quantity: Number(line.quantity || 0),
      };
    });
}

export function createDeliveryNoteFromQuote(data, quote, options = {}) {
  if (!isQuoteDeliveryNoteEligible(quote)) {
    throw new Error("Le devis doit être au statut Prêt ou Livré.");
  }

  const existing = getDeliveryNoteForQuote(data, quote);
  if (existing && !options.regenerate) {
    return { ...data, deliveryNote: existing, created: false };
  }

  const client = (data.clients || []).find((c) => c.id === quote.clientId);
  const lines = normalizeDeliveryLines(quote, data.products || []);
  if (lines.length === 0) {
    throw new Error("Aucune ligne à livrer sur ce devis.");
  }

  const deliveryNote = {
    id: uid(),
    number: nextDocumentNumber(data.deliveryNotes || [], "BL"),
    companySnapshot:
      quote.companySnapshot || buildCompanySnapshot(data.settings || {}),
    date: today(),
    quoteNumber: quote.number,
    quoteId: quote.id,
    clientId: quote.clientId,
    billingDetail: quote.billingDetail || "",
    status: quote.status === "Livré" ? "Livré" : "Prêt",
    lines,
    deliveryAddress: options.deliveryAddress || client?.address || "",
    deliveryInfo: options.deliveryInfo || "",
    notes: options.notes || "",
  };

  const nextNotes = existing
    ? (data.deliveryNotes || []).map((note) =>
        String(note.id) === String(existing.id) ? deliveryNote : note,
      )
    : [...(data.deliveryNotes || []), deliveryNote];

  return {
    ...data,
    deliveryNotes: nextNotes,
    deliveryNote,
    created: !existing,
  };
}

export function createDepositInvoiceFromQuote(data, quote, percent) {
  const rate = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  if (rate <= 0) {
    throw new Error("Le pourcentage d'acompte doit être supérieur à 0.");
  }

  const quoteTotalTTC = Number(quote.totalTTC || 0);
  if (quoteTotalTTC <= 0) {
    throw new Error("Le devis n'a pas de montant TTC valide.");
  }

  const totalHT = Math.round(Number(quote.totalHT || 0) * rate * 100) / 100;
  const taxAmount = Math.round(Number(quote.taxAmount || 0) * rate * 100) / 100;
  const totalTTC = Math.round(quoteTotalTTC * rate * 100) / 100;
  const taxRate = Number(quote.taxRate ?? data.settings?.taxRate ?? 0);

  const invoice = {
    id: uid(),
    number: nextInvoiceNumber(data.invoices || [], data.settings),
    companySnapshot:
      quote.companySnapshot || buildCompanySnapshot(data.settings || {}),
    date: today(),
    clientId: quote.clientId,
    billingDetail: quote.billingDetail || "",
    status: "Non payée",
    dueDate: computeDueDate(today(), data.settings?.paymentDays),
    invoiceType: "acompte",
    depositPercent: rate * 100,
    convertedFrom: quote.number,
    parentQuoteId: quote.id,
    description: `Acompte ${Math.round(rate * 100)}% — Devis ${quote.number}`,
    lines: [
      {
        productId: "",
        sku: "",
        description: `Acompte ${Math.round(rate * 100)}% — Devis ${quote.number}`,
        quantity: 1,
        price: totalHT,
        discount: 0,
        subtotal: totalHT,
        totalHT,
      },
    ],
    globalDiscount: 0,
    subtotal: totalHT,
    lineDiscountAmount: 0,
    globalDiscountAmount: 0,
    totalHT,
    taxRate,
    taxAmount,
    totalTTC,
    paidAmount: 0,
    remaining: totalTTC,
    stockAdjusted: false,
  };

  return {
    ...data,
    invoices: [...(data.invoices || []), invoice],
    invoice,
  };
}

export function createBalanceInvoiceFromQuote(data, quote) {
  const summary = getQuoteDepositSummary(data, quote);
  if (!summary.depositInvoices.length) {
    throw new Error("Aucune facture d'acompte pour ce devis.");
  }
  if (summary.hasBalanceInvoice) {
    throw new Error("Une facture de solde existe déjà pour ce devis.");
  }
  if (summary.remainingBalance <= 0.01) {
    throw new Error(
      "Le solde restant est nul ou déjà couvert par les acomptes payés.",
    );
  }

  const quoteTotalTTC = Number(quote.totalTTC || 0);
  const balanceTTC = summary.remainingBalance;
  const ratio = quoteTotalTTC > 0 ? balanceTTC / quoteTotalTTC : 1;
  const totalHT = Math.round(Number(quote.totalHT || 0) * ratio * 100) / 100;
  const taxAmount =
    Math.round(Number(quote.taxAmount || 0) * ratio * 100) / 100;
  const taxRate = Number(quote.taxRate ?? data.settings?.taxRate ?? 0);
  const paidDepositLabel = summary.paidDeposit.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const scaledLines = quote.lines?.length
    ? scaleDocumentLinesByRatio(quote.lines, ratio)
    : [
        {
          productId: quote.productId || "",
          sku: quote.sku || "",
          description: quote.description || `Solde — Devis ${quote.number}`,
          quantity: quote.quantity || 1,
          price: totalHT,
          discount: 0,
          subtotal: totalHT,
          totalHT,
        },
      ];

  const invoice = {
    id: uid(),
    number: nextInvoiceNumber(data.invoices || [], data.settings),
    companySnapshot:
      quote.companySnapshot || buildCompanySnapshot(data.settings || {}),
    date: today(),
    clientId: quote.clientId,
    billingDetail: quote.billingDetail || "",
    status: "Non payée",
    dueDate: computeDueDate(today(), data.settings?.paymentDays),
    invoiceType: "solde",
    convertedFrom: quote.number,
    parentQuoteId: quote.id,
    depositPaidAmount: summary.paidDeposit,
    description: `Solde — Devis ${quote.number} (acomptes payés : ${paidDepositLabel} €)`,
    lines: scaledLines,
    globalDiscount: quote.globalDiscount || 0,
    subtotal: totalHT,
    lineDiscountAmount: quote.lineDiscountAmount || 0,
    globalDiscountAmount:
      Math.round(Number(quote.globalDiscountAmount || 0) * ratio * 100) / 100,
    totalHT,
    taxRate,
    taxAmount,
    totalTTC: balanceTTC,
    paidAmount: 0,
    remaining: balanceTTC,
    stockAdjusted: true,
  };

  return {
    ...data,
    products: applyStockByLines(
      data.products || [],
      invoice.lines || [],
      "remove",
      {
        type: "invoice",
        reason: "Facture de solde",
        reference: invoice.number,
      },
    ),
    invoices: [...(data.invoices || []), invoice],
    invoice,
  };
}

/** Réduit chaque ligne au ratio solde / devis (prix unitaire et totaux HT). */
export function scaleDocumentLinesByRatio(lines = [], ratio = 1) {
  const r = Math.max(0, Number(ratio) || 0);
  if (r <= 0 || !lines.length) return lines;

  return lines.map((line) => {
    const quantity = Number(line.quantity || 0);
    const price = Math.round(Number(line.price || 0) * r * 100) / 100;
    const discount = Math.min(100, Math.max(0, Number(line.discount || 0)));
    const subtotal = Math.round(quantity * price * 100) / 100;
    const totalHT = Math.round(subtotal * (1 - discount / 100) * 100) / 100;
    return {
      ...line,
      price,
      subtotal,
      totalHT,
    };
  });
}

export function roundDocumentAmount(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function computeDocumentLineTotals(line = {}) {
  const quantity = Number(line.quantity || 0);
  const price = Number(line.price || 0);
  const discount = Math.min(100, Math.max(0, Number(line.discount || 0)));
  const subtotal = roundDocumentAmount(quantity * price);
  const totalHT = roundDocumentAmount(subtotal * (1 - discount / 100));

  return { subtotal, totalHT };
}

export function computeDocumentTotals(lines = [], options = {}) {
  const subtotal = roundDocumentAmount(
    (lines || []).reduce((sum, line) => {
      const lineTotals = computeDocumentLineTotals(line);
      return sum + lineTotals.totalHT;
    }, 0),
  );
  const globalDiscountRate = Math.min(
    100,
    Math.max(0, Number(options.globalDiscount || 0)),
  );
  const globalDiscountAmount = roundDocumentAmount(
    subtotal * (globalDiscountRate / 100),
  );
  const totalHT = roundDocumentAmount(
    Math.max(0, subtotal - globalDiscountAmount),
  );
  const taxRate = Number(options.taxRate || 0);
  const taxAmount = roundDocumentAmount(totalHT * (taxRate / 100));
  const totalTTC = roundDocumentAmount(totalHT + taxAmount);
  const deposit = computeDepositTotals(totalTTC, options.depositPercent);

  return {
    subtotal,
    globalDiscountRate,
    globalDiscountAmount,
    totalHT,
    taxAmount,
    totalTTC,
    ...deposit,
  };
}

export function getInvoiceAmountPaid(invoice = {}) {
  const direct = Number(invoice.amountPaid);
  if (!Number.isNaN(direct) && direct >= 0) return direct;

  const paid = Number(invoice.paidAmount);
  if (!Number.isNaN(paid) && paid >= 0) return paid;

  return 0;
}

export function recalculateInvoicePaymentFields(invoice = {}) {
  const totalTTC = roundDocumentAmount(invoice.totalTTC || 0);
  const paidAmount = roundDocumentAmount(getInvoiceAmountPaid(invoice));
  const remaining = roundDocumentAmount(Math.max(0, totalTTC - paidAmount));

  return {
    ...invoice,
    paidAmount,
    remaining,
    remainingAmount: remaining,
    balanceDue: remaining,
    amountDue: remaining,
  };
}

export function recalculateDocumentAmounts(document = {}, options = {}) {
  const lines = (document.lines || []).map((line) => ({
    ...line,
    ...computeDocumentLineTotals(line),
  }));
  const totals = computeDocumentTotals(lines, {
    globalDiscount: document.globalDiscount,
    depositPercent: document.depositPercent,
    taxRate: document.taxRate,
  });
  const nextDocument = {
    ...document,
    lines,
    ...totals,
  };

  return options.type === "invoice"
    ? recalculateInvoicePaymentFields(nextDocument)
    : nextDocument;
}

export function computeDepositTotals(totalTTC, depositPercent = 0) {
  const rate = Math.min(100, Math.max(0, Number(depositPercent) || 0));
  const total = Number(totalTTC || 0);
  const depositAmount = Math.round(total * (rate / 100) * 100) / 100;
  const balanceAfterDeposit = Math.round((total - depositAmount) * 100) / 100;
  return { depositPercent: rate, depositAmount, balanceAfterDeposit };
}

/**
 * Lignes Acompte / Solde du pied de page : uniquement sur les devis.
 * Sur une facture d'acompte, totalTTC est déjà le montant à payer (ne pas re-appliquer %).
 */
export function getDocumentFooterTotals(doc, type) {
  const isQuote = type === "quote";
  const isSolde = type === "invoice" && doc.invoiceType === "solde";
  const depositPercent = Number(doc.depositPercent || 0);
  const showQuoteDepositSplit = isQuote && depositPercent > 0;
  const quoteDeposit = showQuoteDepositSplit
    ? computeDepositTotals(doc.totalTTC, depositPercent)
    : { depositPercent: 0, depositAmount: 0, balanceAfterDeposit: 0 };
  const depositPaidAmount = Number(doc.depositPaidAmount || 0);
  const showSoldeBreakdown = isSolde && depositPaidAmount > 0.01;
  const quoteTotalTTCForSolde = showSoldeBreakdown
    ? Math.round((Number(doc.totalTTC || 0) + depositPaidAmount) * 100) / 100
    : 0;

  return {
    showQuoteDepositSplit,
    quoteDeposit,
    showSoldeBreakdown,
    quoteTotalTTCForSolde,
    depositPaidAmount,
  };
}

/** Montant « À payer » sur PDF / aperçu. */
export function getDocumentAmountDue(doc, type, { remaining } = {}) {
  if (type === "delivery") return 0;
  if (type === "quote" && Number(doc.depositPercent || 0) > 0) {
    return computeDepositTotals(doc.totalTTC, doc.depositPercent).depositAmount;
  }
  const rem = remaining != null ? Number(remaining) : Number(doc.remaining);
  if (rem != null && !Number.isNaN(rem)) return Math.max(0, rem);
  if (doc.status === "Payée") return 0;
  return Number(doc.totalTTC || 0);
}

export function enrichInvoicePaymentFields(invoice) {
  if (!invoice) return invoice;
  const totalTTC = roundDocumentAmount(invoice.totalTTC || 0);
  const paidAmount = roundDocumentAmount(getInvoiceAmountPaid(invoice));

  return recalculateInvoicePaymentFields({
    ...invoice,
    totalTTC,
    paidAmount,
  });
}
