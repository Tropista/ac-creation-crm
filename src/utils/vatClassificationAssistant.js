import {
  ACCOUNTING_BASIS,
  EU_TRANSACTION_TYPE,
  REVERSE_CHARGE_RATE_STATUS,
  SALE_TAX_CATEGORY,
  VAT_DEDUCTIBILITY,
  VAT_ORIGIN,
  VAT_REVIEW_STATUS,
  calculateVatDeclaration,
} from "./vatDeclaration";
import { getCountryName, getVatOriginFromCountry, normalizeCountryCode } from "./countries";
import { suggestExpenseVatClassification } from "./expenseVatClassification";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

const MANUFACTURED_WORDS = [
  "personnalisation", "personnalise", "impression", "sublimation", "gravure",
  "textile", "mug", "fabrique", "fabrication", "3d", "decoupe", "creation",
  "dtf", "broderie", "laser", "uv-dtf",
];

const SERVICE_WORDS = [
  "creation graphique", "conception", "mise en page", "prestation",
  "main-d'oeuvre", "main d'oeuvre", "service", "design",
];

const RESOLD_WORDS = ["revente", "revendu", "en l'etat", "achat revente", "marchandise"];

export function suggestSaleTaxCategory(invoice = {}) {
  const lines = invoice.lines || invoice.items || [];
  const text = normalizeText([
    invoice.description,
    invoice.category,
    invoice.number,
    ...lines.map((line) => `${line.description || ""} ${line.name || ""}`),
  ].join(" "));

  const lineCategories = lines
    .map((line) => suggestSaleTaxCategory({ ...line, lines: [] }).category)
    .filter((category) => category && category !== SALE_TAX_CATEGORY.TO_REVIEW);
  const uniqueLineCategories = [...new Set(lineCategories)];
  if (uniqueLineCategories.length > 1) {
    return {
      category: SALE_TAX_CATEGORY.TO_REVIEW,
      confidence: "low",
      reason: "Lignes de nature differente: classification facture a verifier",
    };
  }

  if (includesAny(text, SERVICE_WORDS)) {
    return {
      category: SALE_TAX_CATEGORY.SERVICE,
      confidence: "high",
      reason: "Description compatible avec une prestation de service",
    };
  }
  if (includesAny(text, RESOLD_WORDS)) {
    return {
      category: SALE_TAX_CATEGORY.RESOLD_GOODS,
      confidence: "medium",
      reason: "Description compatible avec une marchandise revendue en l'etat",
    };
  }
  if (includesAny(text, MANUFACTURED_WORDS)) {
    return {
      category: SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT,
      confidence: "high",
      reason: "Description compatible avec un produit fabrique ou transforme par AC Creation",
    };
  }
  if (uniqueLineCategories.length === 1) {
    return {
      category: uniqueLineCategories[0],
      confidence: "medium",
      reason: "Toutes les lignes semblent homogenes",
    };
  }
  return {
    category: SALE_TAX_CATEGORY.TO_REVIEW,
    confidence: "low",
    reason: "Aucune classification fiable detectee",
  };
}

function expenseDate(expense = {}) {
  return expense.purchaseDate || expense.date || expense.createdAt || "";
}

function inPeriod(dateValue, periodStart, periodEnd, taxYear) {
  const date = new Date(dateValue || "");
  if (!Number.isFinite(date.getTime())) return false;
  if (periodStart && date < new Date(periodStart)) return false;
  if (periodEnd && date > new Date(periodEnd)) return false;
  return !taxYear || date.getFullYear() === Number(taxYear);
}

function supplierForExpense(expense = {}, suppliers = []) {
  return suppliers.find((supplier) => String(supplier.id) === String(expense.supplierId)) ||
    suppliers.find((supplier) => normalizeText(supplier.name) === normalizeText(expense.supplierName)) ||
    null;
}

function supplierCountryCode(supplier = {}, expense = {}) {
  return normalizeCountryCode(
    supplier.country_code ||
    supplier.country_name ||
    supplier.country ||
    expense.country ||
    expense.country_code ||
    expense.country_name
  );
}

function sumHT(expenses = []) {
  return expenses.reduce((sum, expense) => sum + Number(expense.amountHT ?? expense.totalHT ?? 0), 0);
}

export function buildSupplierSuggestions({ data = {}, periodStart, periodEnd, taxYear } = {}) {
  const expenses = (data.expenses || []).filter((expense) => inPeriod(expenseDate(expense), periodStart, periodEnd, taxYear));
  const bySupplier = new Map();
  for (const expense of expenses) {
    const supplier = supplierForExpense(expense, data.suppliers || []);
    const key = supplier?.id || expense.supplierName || "unknown";
    const current = bySupplier.get(key) || { supplier, expenses: [] };
    current.expenses.push(expense);
    bySupplier.set(key, current);
  }

  return Array.from(bySupplier.values())
    .filter(({ supplier }) => !supplier?.country_code || !supplier?.default_vat_origin)
    .map(({ supplier, expenses: rows }) => {
      const firstSuggestion = suggestExpenseVatClassification({ expense: rows[0], supplier: supplier || {} });
      const countryCode = supplierCountryCode(supplier || {}, rows[0] || {});
      return {
        id: supplier?.id || rows[0]?.supplierName || "unknown",
        supplierId: supplier?.id || "",
        supplierName: supplier?.name || rows[0]?.supplierName || "Fournisseur inconnu",
        expenseCount: rows.length,
        totalHT: sumHT(rows),
        rates: [...new Set(rows.map((expense) => Number(expense.vatRate ?? expense.taxRate ?? 0)))],
        currentCountry: supplier?.country_name || "",
        country_code: countryCode,
        vat_number: supplier?.vat_number || "",
        proposed_country_code: countryCode || "",
        proposed_vat_origin: firstSuggestion.suggestions.vat_origin || getVatOriginFromCountry(countryCode) || VAT_ORIGIN.LU,
        proposed_transaction_type: firstSuggestion.suggestions.eu_transaction_type || EU_TRANSACTION_TYPE.NONE,
        confidence: countryCode ? "medium" : "low",
        reasons: firstSuggestion.reasons.length ? firstSuggestion.reasons : ["Pays fournisseur a completer"],
        status: "to_review",
      };
    });
}

export function buildSaleSuggestions({ data = {}, periodStart, periodEnd, taxYear } = {}) {
  return (data.invoices || [])
    .filter((invoice) => inPeriod(invoice.date, periodStart, periodEnd, taxYear))
    .filter((invoice) => !invoice.sale_tax_category || invoice.sale_tax_category === SALE_TAX_CATEGORY.TO_REVIEW)
    .map((invoice) => {
      const suggestion = suggestSaleTaxCategory(invoice);
      return {
        id: invoice.id,
        number: invoice.number || "",
        client: invoice.clientName || (data.clients || []).find((client) => String(client.id) === String(invoice.clientId))?.name || "",
        date: invoice.date || "",
        description: invoice.description || (invoice.lines || []).map((line) => line.description).join(", "),
        totalHT: Number(invoice.totalHT || 0),
        proposed_category: suggestion.category,
        selected_category: suggestion.category,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        checked: suggestion.confidence === "high",
      };
    });
}

export function buildExpenseSuggestions({ data = {}, periodStart, periodEnd, taxYear } = {}) {
  return (data.expenses || [])
    .filter((expense) => inPeriod(expenseDate(expense), periodStart, periodEnd, taxYear))
    .filter((expense) =>
      !expense.vat_review_status ||
      expense.vat_review_status === VAT_REVIEW_STATUS.TO_REVIEW ||
      !expense.vat_origin ||
      !expense.expense_tax_category ||
      (expense.vat_origin === VAT_ORIGIN.EU && (!expense.eu_transaction_type || expense.eu_transaction_type === EU_TRANSACTION_TYPE.NONE)) ||
      expense.reverse_charge_rate_status !== REVERSE_CHARGE_RATE_STATUS.CONFIRMED
    )
    .map((expense) => {
      const supplier = supplierForExpense(expense, data.suppliers || []) || {};
      const suggestion = suggestExpenseVatClassification({ expense, supplier });
      return {
        id: expense.id,
        date: expenseDate(expense),
        supplierName: expense.supplierName || supplier.name || "",
        description: expense.notes || expense.description || expense.category || "",
        amountHT: Number(expense.amountHT ?? expense.totalHT ?? 0),
        vatRate: Number(expense.vatRate ?? expense.taxRate ?? 0),
        vatAmount: Number(expense.vatAmount ?? expense.amountTVA ?? expense.tva ?? 0),
        totalTTC: Number(expense.totalTTC ?? expense.amountTTC ?? 0),
        country: supplier.country_code || expense.country || "",
        confidence: suggestion.confidence,
        reasons: suggestion.reasons,
        warnings: suggestion.warnings,
        checked: suggestion.confidence !== "low",
        suggestions: {
          ...suggestion.suggestions,
          vat_deductibility: suggestion.suggestions.vat_deductibility || VAT_DEDUCTIBILITY.FULLY,
        },
      };
    });
}

export function buildVatClassificationAssistantState({ data = {}, periodStart, periodEnd, taxYear } = {}) {
  return {
    suppliers: buildSupplierSuggestions({ data, periodStart, periodEnd, taxYear }),
    sales: buildSaleSuggestions({ data, periodStart, periodEnd, taxYear }),
    expenses: buildExpenseSuggestions({ data, periodStart, periodEnd, taxYear }),
  };
}

function isExpenseComplete(expense = {}, supplier = {}) {
  const countryCode = supplierCountryCode(supplier, expense);
  return expense.vat_origin &&
    expense.expense_tax_category &&
    expense.vat_deductibility &&
    (
      expense.vat_origin !== VAT_ORIGIN.EU ||
      (
        expense.eu_transaction_type &&
        expense.eu_transaction_type !== EU_TRANSACTION_TYPE.NONE &&
        countryCode
      )
    );
}

export function applyVatClassificationSelections(data = {}, selections = {}) {
  const supplierUpdates = new Map((selections.suppliers || []).map((item) => [String(item.supplierId || item.id), item]));
  const saleUpdates = new Map((selections.sales || []).map((item) => [String(item.id), item]));
  const expenseUpdates = new Map((selections.expenses || []).map((item) => [String(item.id), item]));
  const createdSuppliers = [];
  const newSupplierIdsByName = new Map();

  const suppliers = (data.suppliers || []).map((supplier) => {
    const update = supplierUpdates.get(String(supplier.id));
    if (!update) return supplier;
    const countryCode = normalizeCountryCode(update.proposed_country_code || update.country_code || supplier.country_code);
    const vatOrigin = update.proposed_vat_origin || getVatOriginFromCountry(countryCode) || supplier.default_vat_origin || "";
    return {
      ...supplier,
      country_code: countryCode || "",
      country_name: getCountryName(countryCode) || supplier.country_name || "",
      vat_number: update.vat_number ?? supplier.vat_number ?? "",
      default_vat_origin: vatOrigin,
      default_transaction_type:
        vatOrigin === VAT_ORIGIN.EU
          ? update.proposed_transaction_type || supplier.default_transaction_type || EU_TRANSACTION_TYPE.NONE
          : EU_TRANSACTION_TYPE.NONE,
      updatedAt: new Date().toISOString(),
    };
  });

  for (const update of selections.suppliers || []) {
    if (update.supplierId && suppliers.some((supplier) => String(supplier.id) === String(update.supplierId))) {
      continue;
    }
    const supplierName = String(update.supplierName || update.id || "").trim();
    if (!supplierName) continue;
    const alreadyExists = suppliers.some((supplier) => normalizeText(supplier.name) === normalizeText(supplierName));
    if (alreadyExists) continue;
    const countryCode = normalizeCountryCode(update.proposed_country_code || update.country_code);
    const vatOrigin = update.proposed_vat_origin || getVatOriginFromCountry(countryCode) || "";
    const id = `supplier-${Date.now()}-${createdSuppliers.length + 1}`;
    createdSuppliers.push({
      id,
      name: supplierName,
      country_code: countryCode || "",
      country_name: getCountryName(countryCode) || "",
      vat_number: update.vat_number || "",
      is_eu: vatOrigin === VAT_ORIGIN.EU || countryCode === "LU",
      default_vat_origin: vatOrigin,
      default_transaction_type:
        vatOrigin === VAT_ORIGIN.EU
          ? update.proposed_transaction_type || EU_TRANSACTION_TYPE.NONE
          : EU_TRANSACTION_TYPE.NONE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    newSupplierIdsByName.set(normalizeText(supplierName), id);
  }

  const nextSuppliers = [...suppliers, ...createdSuppliers];

  const invoices = (data.invoices || []).map((invoice) => {
    const update = saleUpdates.get(String(invoice.id));
    if (!update || !update.selected_category || update.selected_category === SALE_TAX_CATEGORY.TO_REVIEW) return invoice;
    return {
      ...invoice,
      sale_tax_category: update.selected_category,
      sale_tax_review_status: "reviewed",
      updatedAt: new Date().toISOString(),
    };
  });

  const nextData = { ...data, suppliers: nextSuppliers, invoices };
  const expenses = (data.expenses || []).map((expense) => {
    const supplierNameKey = normalizeText(expense.supplierName);
    const newSupplierId = supplierNameKey ? newSupplierIdsByName.get(supplierNameKey) : "";
    const update = expenseUpdates.get(String(expense.id));
    if (!update) {
      return newSupplierId
        ? { ...expense, supplierId: expense.supplierId || newSupplierId, updatedAt: new Date().toISOString() }
        : expense;
    }
    const next = {
      ...expense,
      supplierId: expense.supplierId || newSupplierId || expense.supplierId,
      ...update.suggestions,
      reverse_charge_rate_status:
        update.suggestions.vat_origin === VAT_ORIGIN.EU &&
        update.suggestions.eu_transaction_type &&
        update.suggestions.eu_transaction_type !== EU_TRANSACTION_TYPE.NONE
          ? REVERSE_CHARGE_RATE_STATUS.CONFIRMED
          : update.suggestions.reverse_charge_rate_status || expense.reverse_charge_rate_status,
      vat_classification_confidence:
        update.suggestions.vat_classification_confidence || "manual",
      updatedAt: new Date().toISOString(),
    };
    const supplier = supplierForExpense(next, nextSuppliers) || {};
    next.vat_review_status = isExpenseComplete(next, supplier)
      ? VAT_REVIEW_STATUS.REVIEWED
      : VAT_REVIEW_STATUS.TO_REVIEW;
    return next;
  });

  return { ...nextData, expenses };
}

export function previewVatClassificationImpact({ data = {}, selections = {}, taxYear, periodStart, periodEnd } = {}) {
  const before = calculateVatDeclaration({
    taxYear,
    periodStart,
    periodEnd,
    accounting_basis: ACCOUNTING_BASIS.INVOICE,
    data,
  });
  const afterData = applyVatClassificationSelections(data, selections);
  const after = calculateVatDeclaration({
    taxYear,
    periodStart,
    periodEnd,
    accounting_basis: ACCOUNTING_BASIS.INVOICE,
    data: afterData,
  });
  return { before, after };
}
