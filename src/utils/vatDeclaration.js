import { parseDocumentDate } from "./invoices";
import { EU_COUNTRY_CODES as EU_COUNTRIES, isEuCountry } from "./countries";

export { EU_COUNTRIES };

export const VAT_CALCULATION_VERSION = "1.0.0";
export const ECDF_FORM_VERSION = "2026";
export const DEFAULT_TAX_YEAR = null;

export const SALE_TAX_CATEGORY = {
  MANUFACTURED_PRODUCT: "manufactured_product",
  RESOLD_GOODS: "resold_goods",
  SERVICE: "service",
  FIXED_ASSET_DISPOSAL: "fixed_asset_disposal",
  OTHER: "other",
  TO_REVIEW: "to_review",
};

export const REVERSE_CHARGE_RATE_STATUS = {
  CONFIRMED: "confirmed",
  SUGGESTED: "suggested",
  TO_REVIEW: "to_review",
};

export const VAT_ANOMALY_CODES = {
  UNREVIEWED_EXPENSE_CLASSIFICATION: "UNREVIEWED_EXPENSE_CLASSIFICATION",
  SALE_CLASSIFICATION_TO_REVIEW: "SALE_CLASSIFICATION_TO_REVIEW",
  UNKNOWN_INVOICE_STATUS: "UNKNOWN_INVOICE_STATUS",
  EU_ZERO_MISSING_TRANSACTION_TYPE: "EU_ZERO_MISSING_TRANSACTION_TYPE",
  EU_EXPENSE_CATEGORY_MISSING: "EU_EXPENSE_CATEGORY_MISSING",
  REVERSE_CHARGE_RATE_NOT_CONFIRMED: "REVERSE_CHARGE_RATE_NOT_CONFIRMED",
  CASH_BASIS_PAYMENTS_INCOMPLETE: "CASH_BASIS_PAYMENTS_INCOMPLETE",
};

const BALANCE_AFFECTING_ERROR_CODES = new Set([
  VAT_ANOMALY_CODES.UNREVIEWED_EXPENSE_CLASSIFICATION,
  VAT_ANOMALY_CODES.SALE_CLASSIFICATION_TO_REVIEW,
  VAT_ANOMALY_CODES.UNKNOWN_INVOICE_STATUS,
  VAT_ANOMALY_CODES.EU_ZERO_MISSING_TRANSACTION_TYPE,
  VAT_ANOMALY_CODES.EU_EXPENSE_CATEGORY_MISSING,
  VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE,
  "sale_ttc_mismatch",
  "expense_ttc_mismatch",
]);

export const ACCOUNTING_BASIS = {
  INVOICE: "invoice",
  CASH: "cash",
};

export const VAT_REVIEW_STATUS = {
  TO_REVIEW: "to_review",
  REVIEWED: "reviewed",
  AUTO_SUGGESTED: "auto_suggested",
};

export const EXPENSE_TAX_CATEGORY = {
  MERCHANDISE: "merchandise",
  RAW_MATERIAL: "raw_material",
  INVESTMENT: "investment",
  GENERAL_EXPENSE: "general_expense",
  SERVICE: "service",
  VEHICLE: "vehicle",
  NON_DEDUCTIBLE: "non_deductible",
  OTHER: "other",
};

export const VAT_ORIGIN = {
  LU: "LU",
  EU: "EU",
  NON_EU: "NON_EU",
};

export const EU_TRANSACTION_TYPE = {
  GOODS: "eu_goods",
  SERVICE: "eu_service",
  NONE: "none",
};

export const VAT_DEDUCTIBILITY = {
  FULLY: "fully_deductible",
  PARTIALLY: "partially_deductible",
  NONE: "non_deductible",
};

export const REPORT_VALIDATION_STATUS = {
  INCOMPLETE: "incomplete",
  READY_FOR_REVIEW: "ready_for_review",
  REVIEWED: "reviewed",
  FILED: "filed",
};

export const LUXEMBOURG_VAT_RATES = [0, 3, 8, 14, 17];
export const FOREIGN_EU_VAT_RATES = [19, 20, 21];

export const ECDF_BOXES = {
  [ECDF_FORM_VERSION]: {
    "001": "Ventes de produits fabriques dans l'entreprise",
    "002": "Ventes de marchandises revendues en l'etat",
    "004": "Prestations de services",
    "005": "Cessions d'immobilisations corporelles",
    "012": "Chiffre d'affaires global",
    "022": "Chiffre d'affaires imposable",
    "031": "Base HT des ventes au taux de 3 %",
    "040": "TVA correspondante au taux de 3 %",
    "051": "Total des bases des acquisitions intracommunautaires",
    "056": "Total de la TVA due sur acquisitions intracommunautaires",
    "076": "Total de la TVA en aval",
    "077": "TVA luxembourgeoise facturee sur entrees de marchandises",
    "078": "TVA autoliquidee sur acquisitions intracommunautaires de marchandises",
    "080": "Total taxe en amont sur marchandises",
    "081": "TVA luxembourgeoise sur immobilisations",
    "082": "TVA autoliquidee sur acquisitions intracommunautaires d'immobilisations",
    "084": "Total taxe en amont sur immobilisations",
    "085": "TVA luxembourgeoise sur frais generaux",
    "086": "TVA autoliquidee sur acquisitions intracommunautaires liees aux frais generaux",
    "088": "Total taxe en amont sur frais generaux",
    "093": "Total de la taxe en amont",
    "097": "TVA non deductible",
    "102": "Total de la taxe en amont deductible",
    "103": "Total TVA en aval",
    "104": "Total TVA en amont deductible",
    "105": "Solde TVA estime",
    "129": "Achats luxembourgeois autres que tabacs",
    "131": "Achats a l'interieur du Luxembourg",
    "137": "Acquisitions intracommunautaires autres que tabacs",
    "139": "Acquisitions intracommunautaires",
    "154": "Total des entrees de marchandises HT",
    "404": "TVA deductible par autoliquidation lorsque applicable",
    "436": "Total base HT des services intracommunautaires recus",
    "462": "Total TVA due sur services intracommunautaires",
    "701": "Base HT des ventes au taux de 17 %",
    "702": "TVA correspondante au taux de 17 %",
    "703": "Base HT des ventes au taux de 14 %",
    "704": "TVA correspondante au taux de 14 %",
    "705": "Base HT des ventes au taux de 8 %",
    "706": "TVA correspondante au taux de 8 %",
    "711": "Base HT des acquisitions intracommunautaires de biens a 17 %",
    "712": "TVA autoliquidee correspondante",
    "741": "Base HT des prestations de services intracommunautaires a 17 %",
    "742": "TVA autoliquidee correspondante",
    "771": "Achats luxembourgeois de marchandises a 17 %",
    "776": "Acquisitions intracommunautaires de marchandises taxables a 17 %",
  },
};

const INCLUDED_INVOICE_STATUSES = [
  "non payee",
  "partiellement payee",
  "payee",
  "en retard",
  "en attente",
  "envoyee",
  "validee",
  "emise",
];

const EXCLUDED_INVOICE_STATUS_PARTS = [
  "brouillon",
  "annul",
  "supprim",
  "avoir",
  "credit note",
];

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function moneyToCents(value) {
  if (value === "" || value == null) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function centsToMoney(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

export function addCents(target, box, amountCents, sourceId) {
  if (!box) return;
  const current = target[box] || {
    box,
    label: ECDF_BOXES[ECDF_FORM_VERSION][box] || "",
    amountCents: 0,
    sourceIds: [],
  };
  current.amountCents += Math.round(Number(amountCents || 0));
  if (sourceId && !current.sourceIds.includes(sourceId)) {
    current.sourceIds.push(sourceId);
  }
  target[box] = current;
}

function inPeriod(dateValue, { startDate, endDate, year } = {}) {
  const date = parseDocumentDate(dateValue);
  if (!date) return false;
  if (startDate && date < parseDocumentDate(startDate)) return false;
  if (endDate && date > parseDocumentDate(endDate)) return false;
  if (!startDate && !endDate && year && date.getFullYear() !== Number(year)) return false;
  return true;
}

export function getInvoiceFiscalInclusion(invoice = {}) {
  const status = normalizeText(invoice.status);

  if (EXCLUDED_INVOICE_STATUS_PARTS.some((part) => status.includes(part))) {
    return {
      included: false,
      reason: "Statut exclu fiscalement",
      status: invoice.status || "",
    };
  }

  if (!status) {
    return {
      included: false,
      visible: true,
      reason: "Statut absent: facture a valider avant calcul officiel",
      status: "",
      error: true,
      code: VAT_ANOMALY_CODES.UNKNOWN_INVOICE_STATUS,
    };
  }

  if (INCLUDED_INVOICE_STATUSES.some((item) => status.includes(item))) {
    return { included: true, reason: "Statut fiscalement inclus", status: invoice.status };
  }

  return {
    included: false,
    visible: true,
    reason: "Statut inconnu: facture exclue du calcul officiel jusqu'a validation",
    status: invoice.status,
    error: true,
    code: VAT_ANOMALY_CODES.UNKNOWN_INVOICE_STATUS,
  };
}

function resolveInvoiceDate(invoice, options, payments = []) {
  if (options.accounting_basis !== ACCOUNTING_BASIS.CASH) return invoice.date;
  const received = payments
    .filter((payment) => isPaymentLinkedToInvoice(payment, invoice))
    .filter((payment) => isValidCashBasisPayment(payment));
  return received[0]?.date || received[0]?.createdAt || null;
}

function isPaymentLinkedToInvoice(payment = {}, invoice = {}) {
  const invoiceIds = [invoice.id, invoice.number].filter(Boolean).map(String);
  const paymentIds = [payment.invoiceId, payment.invoiceNumber].filter(Boolean).map(String);
  return paymentIds.some((id) => invoiceIds.includes(id));
}

function isReceivedPayment(payment = {}) {
  const status = normalizeText(payment.status);
  return status.includes("recu") || status.includes("received") || status.includes("paye");
}

function isValidCashBasisPayment(payment = {}) {
  return isReceivedPayment(payment) && moneyToCents(payment.amount) > 0 && Boolean(payment.date);
}

function getCashBasisInvoiceDiagnostic(invoice = {}, payments = []) {
  const linkedPayments = (payments || []).filter((payment) => {
    const status = normalizeText(payment.status);
    return isPaymentLinkedToInvoice(payment, invoice) && !status.includes("annul") && !status.includes("rembours");
  });
  const validPayments = linkedPayments.filter(isValidCashBasisPayment);
  const paymentPaidCents = validPayments.reduce((sum, payment) => sum + moneyToCents(payment.amount), 0);
  const invoicePaidCents = moneyToCents(invoice.paidAmount ?? invoice.amountPaid ?? 0);
  const totalTtcCents = moneyToCents(invoice.totalTTC);
  const status = normalizeText(invoice.status);
  const isUnpaidStatus = status.includes("non payee");
  const isFullyPaidStatus = !isUnpaidStatus && status.includes("payee");
  const isPartiallyPaidStatus = status.includes("partiellement");
  const hasPaidSignal = isFullyPaidStatus || isPartiallyPaidStatus || invoicePaidCents > 0;

  let reason = "";
  if (hasPaidSignal && validPayments.length === 0) {
    reason = "Facture marquee payee ou partiellement payee sans paiement valide avec date et montant";
  } else if (isFullyPaidStatus && totalTtcCents > 0 && paymentPaidCents + 1 < totalTtcCents) {
    reason = "Facture marquee payee mais paiements recus inferieurs au total TTC";
  } else if (invoicePaidCents > 0 && paymentPaidCents + 1 < invoicePaidCents) {
    reason = "Montant paye de la facture superieur aux paiements recus lies";
  }

  return {
    invoiceNumber: invoice.number || invoice.id || "",
    status: invoice.status || "",
    totalTtcCents,
    invoicePaidCents,
    paymentPaidCents,
    linkedPaymentCount: linkedPayments.length,
    receivedPaymentCount: linkedPayments.filter(isReceivedPayment).length,
    validPaymentCount: validPayments.length,
    reason,
    incomplete: Boolean(reason),
  };
}

function getInvoiceTaxRate(invoice = {}) {
  const rate = Number(invoice.taxRate ?? invoice.vatRate ?? 17);
  return Number.isFinite(rate) ? rate : 17;
}

function getInvoiceSaleCategory(invoice = {}) {
  const category = String(invoice.sale_tax_category || invoice.saleCategory || invoice.ecdfSaleCategory || "").trim();
  if (Object.values(SALE_TAX_CATEGORY).includes(category)) return category;
  if (category === "manufactured") return SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT;
  if (category === "merchandise" || category === "resale_goods") return SALE_TAX_CATEGORY.RESOLD_GOODS;
  if (category === "fixed_asset_sale") return SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL;
  return SALE_TAX_CATEGORY.TO_REVIEW;
}

function getSaleCategoryBox(category) {
  if (category === SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT) return "001";
  if (category === SALE_TAX_CATEGORY.RESOLD_GOODS) return "002";
  if (category === SALE_TAX_CATEGORY.SERVICE) return "004";
  if (category === SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL) return "005";
  return null;
}

function getSalesRateBoxes(rate) {
  if (rate === 17) return ["701", "702"];
  if (rate === 14) return ["703", "704"];
  if (rate === 8) return ["705", "706"];
  if (rate === 3) return ["031", "040"];
  return [null, null];
}

function normalizeDeductiblePercentage(expense = {}) {
  const raw = Number(expense.deductible_percentage ?? 100);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, raw));
}

function getExpenseSupplier(expense, suppliers = []) {
  if (expense.supplierId) {
    const byId = suppliers.find((supplier) => String(supplier.id) === String(expense.supplierId));
    if (byId) return byId;
  }
  const name = normalizeText(expense.supplierName);
  return suppliers.find((supplier) => normalizeText(supplier.name) === name) || null;
}

function resolveExpenseOrigin(expense = {}, supplier = null) {
  if (expense.vat_origin) return expense.vat_origin;
  if (supplier?.default_vat_origin) return supplier.default_vat_origin;
  const code = String(supplier?.country_code || "").trim().toUpperCase();
  if (code === "LU") return VAT_ORIGIN.LU;
  if (code && isEuCountry(code)) return VAT_ORIGIN.EU;
  if (code) return VAT_ORIGIN.NON_EU;
  return null;
}

function resolveExpenseCategory(expense = {}) {
  if (expense.is_fixed_asset || expense.expense_tax_category === EXPENSE_TAX_CATEGORY.INVESTMENT) {
    return EXPENSE_TAX_CATEGORY.INVESTMENT;
  }
  return expense.expense_tax_category || null;
}

function isGoodsCategory(category) {
  return category === EXPENSE_TAX_CATEGORY.MERCHANDISE || category === EXPENSE_TAX_CATEGORY.RAW_MATERIAL;
}

function isGeneralExpenseCategory(category) {
  return (
    category === EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE ||
    category === EXPENSE_TAX_CATEGORY.SERVICE ||
    category === EXPENSE_TAX_CATEGORY.VEHICLE ||
    category === EXPENSE_TAX_CATEGORY.OTHER ||
    !category
  );
}

function getDeductibleCents(vatCents, expense = {}) {
  const deductibility = expense.vat_deductibility || VAT_DEDUCTIBILITY.FULLY;
  if (deductibility === VAT_DEDUCTIBILITY.NONE) return 0;
  if (deductibility === VAT_DEDUCTIBILITY.PARTIALLY) {
    return Math.round(vatCents * normalizeDeductiblePercentage(expense) / 100);
  }
  return vatCents;
}

function anomaly(level, code, message, sourceId, meta = {}) {
  return { level, code, message, sourceId, ...meta };
}

function pushLineAnomaly(result, line, entry) {
  line.anomalies.push(entry);
  result.anomalies.push(entry);
}

function makeBoxList(boxes) {
  return Object.values(boxes)
    .sort((a, b) => String(a.box).localeCompare(String(b.box)))
    .map((entry) => ({
      ...entry,
      amount: centsToMoney(entry.amountCents),
    }));
}

function createSourceSnapshot(lines = []) {
  return {
    lineCount: lines.length,
    sources: lines.map((line) => ({
      id: line.id,
      sourceId: line.sourceId,
      sourceType: line.sourceType,
      number: line.number,
      date: line.date,
      htCents: line.htCents,
      vatCents: line.vatCents,
      ttcCents: line.ttcCents,
      ecdfBoxes: line.ecdfBoxes,
    })),
  };
}

function addSaleLine(result, invoice, clients = []) {
  const sourceId = String(invoice.id || invoice.number || result.lines.length + 1);
  const rate = getInvoiceTaxRate(invoice);
  const htCents = moneyToCents(invoice.totalHT);
  const vatCents = moneyToCents(invoice.taxAmount ?? invoice.totalTVA ?? invoice.totalVAT);
  const ttcCents = moneyToCents(invoice.totalTTC);
  const client = clients.find((item) => String(item.id || "") === String(invoice.clientId || ""));
  const category = getInvoiceSaleCategory(invoice);
  const categoryBox = getSaleCategoryBox(category);
  const [baseBox, vatBox] = getSalesRateBoxes(rate);
  const ecdfBoxes = ["012", "022", baseBox, vatBox, "076", "103"].filter(Boolean);
  if (categoryBox) ecdfBoxes.unshift(categoryBox);
  const line = {
    id: `sale:${sourceId}`,
    sourceId,
    sourceType: "invoice",
    type: "sale",
    date: invoice.date || "",
    number: invoice.number || "",
    partner: client?.name || invoice.clientName || "",
    country: client?.country_code || client?.country || "",
    description: invoice.description || (invoice.lines || []).map((item) => item.description).filter(Boolean).join(", "),
    htCents,
    rate,
    vatCents,
    ttcCents,
    category,
    vatOrigin: VAT_ORIGIN.LU,
    euTransactionType: EU_TRANSACTION_TYPE.NONE,
    deductiblePercentage: 0,
    sale_tax_category: category,
    ecdfBoxes,
    anomalies: [],
  };

  if (categoryBox) addCents(result.boxes, categoryBox, htCents, line.id);
  addCents(result.boxes, "012", htCents, line.id);
  addCents(result.boxes, "022", htCents, line.id);
  addCents(result.boxes, baseBox, htCents, line.id);
  addCents(result.boxes, vatBox, vatCents, line.id);
  addCents(result.boxes, "076", vatCents, line.id);
  addCents(result.boxes, "103", vatCents, line.id);

  const expectedVatCents = Math.round(htCents * rate / 100);
  if (Math.abs(expectedVatCents - vatCents) > 1) {
    pushLineAnomaly(
      result,
      line,
      anomaly("warning", "sale_vat_rounding_difference", "Difference TVA detectee ligne par ligne", line.id, {
        expectedVatCents,
        actualVatCents: vatCents,
      })
    );
  }

  if (ttcCents && Math.abs(htCents + vatCents - ttcCents) > 1) {
    pushLineAnomaly(
      result,
      line,
      anomaly("error", "sale_ttc_mismatch", "Difference entre total HT + TVA et TTC", line.id)
    );
  }

  if (rate == null || Number.isNaN(rate)) {
    pushLineAnomaly(result, line, anomaly("warning", "sale_missing_vat_rate", "Facture sans taux de TVA", line.id));
  }

  if (category === SALE_TAX_CATEGORY.TO_REVIEW || category === SALE_TAX_CATEGORY.OTHER) {
    pushLineAnomaly(
      result,
      line,
      anomaly(
        "error",
        VAT_ANOMALY_CODES.SALE_CLASSIFICATION_TO_REVIEW,
        "Classification fiscale de vente a verifier",
        line.id
      )
    );
  }

  result.lines.push(line);
}

function addVisibleExcludedInvoiceLine(result, invoice, inclusion, clients = []) {
  const sourceId = String(invoice.id || invoice.number || result.lines.length + 1);
  const client = clients.find((item) => String(item.id || "") === String(invoice.clientId || ""));
  const line = {
    id: `sale:${sourceId}`,
    sourceId,
    sourceType: "invoice",
    type: "sale",
    date: invoice.date || "",
    number: invoice.number || "",
    partner: client?.name || invoice.clientName || "",
    country: client?.country_code || client?.country || "",
    description: invoice.description || "",
    htCents: moneyToCents(invoice.totalHT),
    rate: getInvoiceTaxRate(invoice),
    vatCents: moneyToCents(invoice.taxAmount ?? invoice.totalTVA ?? invoice.totalVAT),
    ttcCents: moneyToCents(invoice.totalTTC),
    category: getInvoiceSaleCategory(invoice),
    sale_tax_category: getInvoiceSaleCategory(invoice),
    vatOrigin: VAT_ORIGIN.LU,
    euTransactionType: EU_TRANSACTION_TYPE.NONE,
    deductiblePercentage: 0,
    ecdfBoxes: [],
    officialExcluded: true,
    anomalies: [],
  };
  const entry = anomaly("error", inclusion.code, inclusion.reason, line.id, {
    status: inclusion.status,
    ...(inclusion.meta || {}),
  });
  pushLineAnomaly(result, line, entry);
  result.lines.push(line);
}

function addLuxembourgExpense(result, line, expense, category, htCents, vatCents, ttcCents, rate) {
  const deductibleVatCents = getDeductibleCents(vatCents, expense);
  const nonDeductibleCents = Math.max(0, vatCents - deductibleVatCents);

  if (isGoodsCategory(category)) {
    addCents(result.boxes, "077", deductibleVatCents, line.id);
    addCents(result.boxes, "080", deductibleVatCents, line.id);
    addCents(result.boxes, "154", htCents, line.id);
    addCents(result.boxes, "131", htCents, line.id);
    addCents(result.boxes, "129", htCents, line.id);
    if (rate === 17) addCents(result.boxes, "771", htCents, line.id);
    line.ecdfBoxes.push("077", "080", "154", "131", "129");
    if (rate === 17) line.ecdfBoxes.push("771");
  } else if (category === EXPENSE_TAX_CATEGORY.INVESTMENT) {
    addCents(result.boxes, "081", deductibleVatCents, line.id);
    addCents(result.boxes, "084", deductibleVatCents, line.id);
    line.ecdfBoxes.push("081", "084");
  } else if (isGeneralExpenseCategory(category)) {
    addCents(result.boxes, "085", deductibleVatCents, line.id);
    addCents(result.boxes, "088", deductibleVatCents, line.id);
    line.ecdfBoxes.push("085", "088");
  }

  if (nonDeductibleCents > 0) {
    addCents(result.boxes, "097", nonDeductibleCents, line.id);
    line.ecdfBoxes.push("097");
  }

  line.deductibleVatCents = deductibleVatCents;
  line.nonDeductibleVatCents = nonDeductibleCents;
  line.ttcCents = ttcCents;
}

function addEuExpense(result, line, expense, category, htCents, vatCents, rate) {
  const transactionType = expense.eu_transaction_type || EU_TRANSACTION_TYPE.NONE;
  const theoreticalRate = Number(expense.reverse_charge_vat_rate ?? expense.lu_reverse_charge_rate ?? expense.reverseChargeRate ?? 17);
  const rateStatus = expense.reverse_charge_rate_status || REVERSE_CHARGE_RATE_STATUS.SUGGESTED;
  const reverseVatCents = Math.round(htCents * theoreticalRate / 100);
  const deductibleReverseVatCents = getDeductibleCents(reverseVatCents, expense);
  const nonDeductibleReverseCents = Math.max(0, reverseVatCents - deductibleReverseVatCents);

  line.reverseChargeVatRate = theoreticalRate;
  line.reverseChargeRateStatus = rateStatus;

  if (rateStatus !== REVERSE_CHARGE_RATE_STATUS.CONFIRMED) {
    pushLineAnomaly(
      result,
      line,
      anomaly(
        "warning",
        VAT_ANOMALY_CODES.REVERSE_CHARGE_RATE_NOT_CONFIRMED,
        "Taux d'autoliquidation propose mais non confirme",
        line.id,
        { reverseChargeVatRate: theoreticalRate, reverseChargeRateStatus: rateStatus }
      )
    );
  }

  if (Number(rate) === 0 && transactionType === EU_TRANSACTION_TYPE.NONE) {
    pushLineAnomaly(
      result,
      line,
      anomaly("error", VAT_ANOMALY_CODES.EU_ZERO_MISSING_TRANSACTION_TYPE, "Achat UE a 0 % sans distinction bien/service", line.id)
    );
  }

  if (vatCents > 0) {
    line.foreignVatCents = vatCents;
    result.totals.foreignVatNonDeductibleCents += vatCents;
    pushLineAnomaly(
      result,
      line,
      anomaly("info", "foreign_vat_not_deductible", "TVA etrangere non deductible dans la declaration TVA luxembourgeoise", line.id)
    );
  }

  if (transactionType === EU_TRANSACTION_TYPE.GOODS) {
    addCents(result.boxes, "711", htCents, line.id);
    addCents(result.boxes, "712", reverseVatCents, line.id);
    addCents(result.boxes, "051", htCents, line.id);
    addCents(result.boxes, "056", reverseVatCents, line.id);
    addCents(result.boxes, "076", reverseVatCents, line.id);
    addCents(result.boxes, "103", reverseVatCents, line.id);
    addCents(result.boxes, "139", htCents, line.id);
    addCents(result.boxes, "137", htCents, line.id);
    line.ecdfBoxes.push("711", "712", "051", "056", "076", "103", "139", "137");
    if (category === EXPENSE_TAX_CATEGORY.INVESTMENT) {
      addCents(result.boxes, "082", deductibleReverseVatCents, line.id);
      addCents(result.boxes, "084", deductibleReverseVatCents, line.id);
      line.ecdfBoxes.push("082", "084");
    } else if (isGoodsCategory(category)) {
      addCents(result.boxes, "078", deductibleReverseVatCents, line.id);
      addCents(result.boxes, "080", deductibleReverseVatCents, line.id);
      addCents(result.boxes, "154", htCents, line.id);
      addCents(result.boxes, "776", htCents, line.id);
      line.ecdfBoxes.push("078", "080", "154", "776");
    } else {
      addCents(result.boxes, "086", deductibleReverseVatCents, line.id);
      addCents(result.boxes, "088", deductibleReverseVatCents, line.id);
      line.ecdfBoxes.push("086", "088");
    }
  }

  if (transactionType === EU_TRANSACTION_TYPE.SERVICE) {
    addCents(result.boxes, "741", htCents, line.id);
    addCents(result.boxes, "742", reverseVatCents, line.id);
    addCents(result.boxes, "436", htCents, line.id);
    addCents(result.boxes, "462", reverseVatCents, line.id);
    addCents(result.boxes, "076", reverseVatCents, line.id);
    addCents(result.boxes, "103", reverseVatCents, line.id);
    addCents(result.boxes, "404", deductibleReverseVatCents, line.id);
    addCents(result.boxes, "086", deductibleReverseVatCents, line.id);
    addCents(result.boxes, "088", deductibleReverseVatCents, line.id);
    line.ecdfBoxes.push("741", "742", "436", "462", "076", "103", "404", "086", "088");
  }

  if (nonDeductibleReverseCents > 0) {
    addCents(result.boxes, "097", nonDeductibleReverseCents, line.id);
    line.ecdfBoxes.push("097");
  }

  line.reverseChargeVatCents = reverseVatCents;
  line.deductibleVatCents = deductibleReverseVatCents;
  line.nonDeductibleVatCents = nonDeductibleReverseCents;
}

function addExpenseLine(result, expense, suppliers = []) {
  const sourceId = String(expense.id || expense.invoiceNumber || result.lines.length + 1);
  const supplier = getExpenseSupplier(expense, suppliers);
  const origin = resolveExpenseOrigin(expense, supplier);
  const category = resolveExpenseCategory(expense);
  const rate = Number(expense.vatRate ?? expense.taxRate ?? 0);
  const htCents = moneyToCents(expense.amountHT ?? expense.totalHT);
  const vatCents = moneyToCents(expense.vatAmount ?? expense.amountTVA ?? expense.tva);
  const ttcCents = moneyToCents(expense.totalTTC ?? expense.amountTTC) || htCents + vatCents;
  const line = {
    id: `expense:${sourceId}`,
    sourceId,
    sourceType: "expense",
    type: "expense",
    date: expense.purchaseDate || expense.date || expense.createdAt || "",
    number: expense.invoiceNumber || expense.reference || "",
    partner: expense.supplierName || supplier?.name || "",
    country: supplier?.country_code || supplier?.country_name || expense.country || "",
    description: expense.notes || expense.description || expense.category || "",
    htCents,
    rate,
    vatCents,
    ttcCents,
    category,
    vatOrigin: origin,
    euTransactionType: expense.eu_transaction_type || EU_TRANSACTION_TYPE.NONE,
    deductiblePercentage: normalizeDeductiblePercentage(expense),
    ecdfBoxes: [],
    anomalies: [],
  };

  if (!expense.vat_review_status || expense.vat_review_status === VAT_REVIEW_STATUS.TO_REVIEW) {
    pushLineAnomaly(
      result,
      line,
      anomaly(
        "error",
        VAT_ANOMALY_CODES.UNREVIEWED_EXPENSE_CLASSIFICATION,
        "Classification TVA a verifier",
        line.id
      )
    );
  }

  if (!origin) {
    pushLineAnomaly(result, line, anomaly("warning", "expense_missing_vat_origin", "Depense sans origine TVA", line.id));
  }

  if (!category) {
    pushLineAnomaly(result, line, anomaly("warning", "expense_missing_tax_category", "Depense sans categorie comptable", line.id));
  }

  if (origin === VAT_ORIGIN.EU && !category) {
    pushLineAnomaly(
      result,
      line,
      anomaly("error", VAT_ANOMALY_CODES.EU_EXPENSE_CATEGORY_MISSING, "Nature de depense UE inconnue", line.id)
    );
  }

  if (!supplier?.country_code && !supplier?.country_name && !expense.country) {
    pushLineAnomaly(result, line, anomaly("warning", "supplier_missing_country", "Fournisseur sans pays", line.id));
  }

  if (origin === VAT_ORIGIN.EU && Number(rate) === 0 && line.euTransactionType === EU_TRANSACTION_TYPE.NONE) {
    pushLineAnomaly(
      result,
      line,
      anomaly("error", VAT_ANOMALY_CODES.EU_ZERO_MISSING_TRANSACTION_TYPE, "Achat UE a 0 % sans distinction bien/service", line.id)
    );
  }

  if (origin === VAT_ORIGIN.LU && !LUXEMBOURG_VAT_RATES.includes(Number(rate))) {
    pushLineAnomaly(result, line, anomaly("warning", "lu_supplier_foreign_rate", "Fournisseur LU avec taux TVA etranger", line.id));
  }

  if (FOREIGN_EU_VAT_RATES.includes(Number(rate)) && vatCents > 0) {
    result.totals.foreignVatNonDeductibleCents += vatCents;
    line.foreignVatCents = vatCents;
    pushLineAnomaly(
      result,
      line,
      anomaly("info", "foreign_vat_not_deductible", "TVA etrangere non deductible dans la declaration TVA luxembourgeoise", line.id)
    );
  } else if (origin === VAT_ORIGIN.LU) {
    addLuxembourgExpense(result, line, expense, category, htCents, vatCents, ttcCents, rate);
  } else if (origin === VAT_ORIGIN.EU) {
    addEuExpense(result, line, expense, category, htCents, vatCents, rate);
  }

  if (ttcCents && Math.abs(htCents + vatCents - ttcCents) > 1) {
    pushLineAnomaly(result, line, anomaly("error", "expense_ttc_mismatch", "Difference entre total HT + TVA et TTC", line.id));
  }

  result.lines.push(line);
}

function finalizeTotals(result) {
  const salesOutputVat =
    result.lines
      .filter((line) => line.type === "sale" && !line.officialExcluded)
      .reduce((sum, line) => sum + (line.vatCents || 0), 0);
  const reverseChargeGoodsVat = result.boxes["712"]?.amountCents || 0;
  const reverseChargeServicesVat = result.boxes["742"]?.amountCents || 0;
  const luDeductibleVat =
    result.lines
      .filter((line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU)
      .reduce((sum, line) => sum + (line.deductibleVatCents || 0), 0);
  const reverseChargeDeductibleVat =
    result.lines
      .filter((line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.EU)
      .reduce((sum, line) => sum + (line.deductibleVatCents || 0), 0);
  const previousVatReports = result.totals.previousVatReportsCents || 0;
  const inputDeductible = luDeductibleVat + reverseChargeDeductibleVat;
  const outputVat = salesOutputVat + reverseChargeGoodsVat + reverseChargeServicesVat;
  const balance = outputVat - inputDeductible - previousVatReports;

  addCents(result.boxes, "093", inputDeductible);
  addCents(result.boxes, "102", inputDeductible);
  addCents(result.boxes, "104", inputDeductible);
  addCents(result.boxes, "105", balance);

  result.totals.salesHTCents = result.lines
    .filter((line) => line.type === "sale" && !line.officialExcluded)
    .reduce((sum, line) => sum + line.htCents, 0);
  result.totals.outputVatCents = outputVat;
  result.totals.salesOutputVatCents = salesOutputVat;
  result.totals.reverseChargeGoodsVatCents = reverseChargeGoodsVat;
  result.totals.reverseChargeServicesVatCents = reverseChargeServicesVat;
  result.totals.luDeductibleVatCents = luDeductibleVat;
  result.totals.reverseChargeDeductibleVatCents = reverseChargeDeductibleVat;
  result.totals.previousVatReportsCents = previousVatReports;
  result.totals.expensesHTCents = result.lines
    .filter((line) => line.type === "expense")
    .reduce((sum, line) => sum + line.htCents, 0);
  result.totals.deductibleVatCents = inputDeductible;
  result.totals.balanceCents = balance;
  result.totals.includedInvoiceCount = result.lines.filter(
    (line) => line.type === "sale" && !line.officialExcluded
  ).length;
  result.totals.includedExpenseCount = result.lines.filter((line) => line.type === "expense").length;
  result.totals.excludedCount = result.excluded.length;
  result.totals.errorCount = result.anomalies.filter((entry) => entry.level === "error").length;
  result.totals.warningCount = result.anomalies.filter((entry) => entry.level === "warning").length;
  result.is_final_balance_reliable = !result.anomalies.some(
    (entry) => entry.level === "error" && BALANCE_AFFECTING_ERROR_CODES.has(entry.code)
  );

  result.ecdfBoxes = makeBoxList(result.boxes);
  result.report_validation_status =
    result.totals.errorCount > 0
      ? REPORT_VALIDATION_STATUS.INCOMPLETE
      : REPORT_VALIDATION_STATUS.READY_FOR_REVIEW;

  result.source_snapshot_json = createSourceSnapshot(result.lines);
  return result;
}

export function buildVatDeclaration(data = {}, options = {}) {
  const taxYear = options.taxYear ?? options.year ?? DEFAULT_TAX_YEAR;
  const period = {
    taxYear,
    startDate: options.periodStart || options.startDate || "",
    endDate: options.periodEnd || options.endDate || "",
  };
  const accountingBasis = options.accounting_basis || ACCOUNTING_BASIS.INVOICE;
  const result = {
    calculation_version: VAT_CALCULATION_VERSION,
    ecdf_form_version: ECDF_FORM_VERSION,
    form_version: ECDF_FORM_VERSION,
    tax_year: taxYear,
    generated_at: options.generated_at || new Date().toISOString(),
    period,
    accounting_basis: accountingBasis,
    boxes: {},
    ecdfBoxes: [],
    lines: [],
    excluded: [],
    anomalies: [],
    totals: {
      foreignVatNonDeductibleCents: 0,
    },
    report_validation_status: REPORT_VALIDATION_STATUS.INCOMPLETE,
  };

  if (accountingBasis === ACCOUNTING_BASIS.CASH) {
    result.anomalies.push(
      anomaly("warning", "cash_basis_requires_payments", "Le mode recettes necessite des paiements correctement enregistres", "report")
    );
  }

  for (const invoice of data.invoices || []) {
    const inclusion = getInvoiceFiscalInclusion(invoice);
    const fiscalDate = resolveInvoiceDate(invoice, { accounting_basis: accountingBasis }, data.payments || []);
    const cashDiagnostic =
      accountingBasis === ACCOUNTING_BASIS.CASH
        ? getCashBasisInvoiceDiagnostic(invoice, data.payments || [])
        : null;

    if (!inclusion.included) {
      result.excluded.push({
        sourceType: "invoice",
        sourceId: invoice.id || invoice.number,
        number: invoice.number || "",
        reason: inclusion.reason,
      });
      if (inclusion.visible && inPeriod(fiscalDate || invoice.date, { ...period, year: taxYear })) {
        addVisibleExcludedInvoiceLine(result, invoice, inclusion, data.clients || []);
      }
      continue;
    }

    if (accountingBasis === ACCOUNTING_BASIS.CASH) {
      if (cashDiagnostic?.incomplete) {
        if (inPeriod(invoice.date, { ...period, year: taxYear })) {
          addVisibleExcludedInvoiceLine(
            result,
            invoice,
            {
              reason: `Mode recettes: ${cashDiagnostic.reason}`,
              code: VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE,
              status: invoice.status || "",
              meta: { cashBasis: cashDiagnostic },
            },
            data.clients || []
          );
        }
        continue;
      }
      if (!fiscalDate) continue;
    }

    if (!inPeriod(fiscalDate || invoice.date, { ...period, year: taxYear })) continue;

    addSaleLine(result, invoice, data.clients || []);
  }

  for (const expense of data.expenses || []) {
    const expenseDate = expense.purchaseDate || expense.date || expense.createdAt;
    if (!inPeriod(expenseDate, { ...period, year: taxYear })) continue;
    addExpenseLine(result, expense, data.suppliers || []);
  }

  return finalizeTotals(result);
}

export function calculateVatDeclaration({
  data = {},
  taxYear = DEFAULT_TAX_YEAR,
  periodStart = "",
  periodEnd = "",
  ...options
} = {}) {
  return buildVatDeclaration(data, {
    ...options,
    taxYear,
    periodStart,
    periodEnd,
  });
}

export function getEcdfBoxSourceLines(report = {}, box) {
  const target = String(box || "");
  return (report.lines || []).filter((line) => (line.ecdfBoxes || []).includes(target));
}

export function createVatReportPayload(report = {}, overrides = {}) {
  return {
    id: overrides.id || report.id || crypto?.randomUUID?.() || String(Date.now()),
    tax_year: report.tax_year ?? report.period?.taxYear ?? overrides.tax_year ?? overrides.year ?? DEFAULT_TAX_YEAR,
    year: report.tax_year ?? report.period?.taxYear ?? overrides.tax_year ?? overrides.year ?? DEFAULT_TAX_YEAR,
    period_start: report.period?.startDate || overrides.period_start || "",
    period_end: report.period?.endDate || overrides.period_end || "",
    status: overrides.status || "draft",
    report_validation_status: report.report_validation_status || REPORT_VALIDATION_STATUS.INCOMPLETE,
    totals_json: report.totals || {},
    ecdf_boxes_json: report.ecdfBoxes || [],
    warnings_json: report.anomalies || [],
    source_snapshot_json: report.source_snapshot_json || createSourceSnapshot(report.lines || []),
    calculation_version: report.calculation_version || VAT_CALCULATION_VERSION,
    ecdf_form_version: report.ecdf_form_version || report.form_version || ECDF_FORM_VERSION,
    form_version: report.ecdf_form_version || report.form_version || ECDF_FORM_VERSION,
    generated_at: report.generated_at || new Date().toISOString(),
    reviewed_at: overrides.reviewed_at || null,
    filed_at: overrides.filed_at || null,
    created_by: overrides.created_by || "",
  };
}

export function canReplaceVatReport(existingReport = null) {
  return String(existingReport?.status || "") !== "filed" &&
    String(existingReport?.report_validation_status || "") !== REPORT_VALIDATION_STATUS.FILED;
}
