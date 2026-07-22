import {
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  FOREIGN_EU_VAT_RATES,
  LUXEMBOURG_VAT_RATES,
  REVERSE_CHARGE_RATE_STATUS,
  VAT_DEDUCTIBILITY,
  VAT_ORIGIN,
  VAT_REVIEW_STATUS,
} from "./vatDeclaration";
import { getVatOriginFromCountry, isEuCountry, normalizeCountryCode } from "./countries";

export const DEFAULT_EXPENSE_VAT_FIELDS = {
  vat_origin: null,
  expense_tax_category: null,
  eu_transaction_type: EU_TRANSACTION_TYPE.NONE,
  vat_deductibility: null,
  deductible_percentage: 100,
  vat_review_status: VAT_REVIEW_STATUS.TO_REVIEW,
  reverse_charge_vat_rate: 17,
  reverse_charge_rate_status: REVERSE_CHARGE_RATE_STATUS.TO_REVIEW,
  is_fixed_asset: false,
  asset_name: "",
  asset_purchase_date: "",
  asset_value_ht: "",
  asset_useful_life_years: "",
};

export const NEW_EXPENSE_VAT_DEFAULTS = {
  ...DEFAULT_EXPENSE_VAT_FIELDS,
  vat_review_status: VAT_REVIEW_STATUS.AUTO_SUGGESTED,
  reverse_charge_rate_status: REVERSE_CHARGE_RATE_STATUS.SUGGESTED,
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

const FIXED_ASSET_WORDS = [
  "machine", "printer", "imprimante", "laser", "ordinateur", "computer",
  "presse", "press", "plotter", "equipement", "equipment", "maschine",
  "drucker", "anlage",
];

const RAW_MATERIAL_WORDS = [
  "textile", "vinyle", "vinyl", "encre", "ink", "poudre", "powder",
  "film", "filament", "matiere", "material", "stoff", "tinte",
];

const SERVICE_WORDS = [
  "abonnement", "subscription", "logiciel", "software", "licence", "license",
  "hebergement", "hosting", "service", "dienstleistung", "wartung",
];

const GENERAL_EXPENSE_WORDS = [
  "publicite", "advertising", "telephone", "phone", "assurance", "insurance",
  "banque", "bank", "gebuhr", "fee", "marketing",
];

export function normalizeExpenseVatFields(expense = {}, { forNew = false } = {}) {
  const defaults = forNew ? NEW_EXPENSE_VAT_DEFAULTS : DEFAULT_EXPENSE_VAT_FIELDS;
  return {
    ...defaults,
    ...expense,
    eu_transaction_type: expense.eu_transaction_type ?? defaults.eu_transaction_type,
    deductible_percentage:
      expense.deductible_percentage == null || expense.deductible_percentage === ""
        ? defaults.deductible_percentage
        : expense.deductible_percentage,
    reverse_charge_vat_rate:
      expense.reverse_charge_vat_rate == null || expense.reverse_charge_vat_rate === ""
        ? defaults.reverse_charge_vat_rate
        : expense.reverse_charge_vat_rate,
    reverse_charge_rate_status:
      expense.reverse_charge_rate_status || defaults.reverse_charge_rate_status,
    vat_review_status: expense.vat_review_status || defaults.vat_review_status,
    is_fixed_asset: Boolean(expense.is_fixed_asset ?? defaults.is_fixed_asset),
  };
}

function inferCategory(expense = {}) {
  const text = normalizeText([
    expense.category,
    expense.notes,
    expense.description,
    expense.invoiceNumber,
  ].join(" "));

  if (includesAny(text, FIXED_ASSET_WORDS)) {
    return {
      category: EXPENSE_TAX_CATEGORY.INVESTMENT,
      isFixedAsset: true,
      reason: "Description compatible avec une immobilisation",
      confidence: "medium",
    };
  }

  if (includesAny(text, RAW_MATERIAL_WORDS)) {
    return {
      category: EXPENSE_TAX_CATEGORY.RAW_MATERIAL,
      isFixedAsset: false,
      reason: "Description compatible avec matiere premiere/consommable",
      confidence: "medium",
    };
  }

  if (includesAny(text, SERVICE_WORDS)) {
    return {
      category: EXPENSE_TAX_CATEGORY.SERVICE,
      isFixedAsset: false,
      reason: "Description compatible avec service/logiciel",
      confidence: "medium",
    };
  }

  if (includesAny(text, GENERAL_EXPENSE_WORDS)) {
    return {
      category: EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE,
      isFixedAsset: false,
      reason: "Description compatible avec frais generaux",
      confidence: "medium",
    };
  }

  return {
    category: null,
    isFixedAsset: false,
    reason: "Categorie non reconnue automatiquement",
    confidence: "low",
  };
}

function inferEuTransactionType(expense, category) {
  const text = normalizeText([expense.category, expense.notes, expense.description].join(" "));
  if (category === EXPENSE_TAX_CATEGORY.SERVICE || includesAny(text, SERVICE_WORDS)) {
    return {
      type: EU_TRANSACTION_TYPE.SERVICE,
      reason: "Achat UE a 0 % identifie comme service",
    };
  }
  if (
    category === EXPENSE_TAX_CATEGORY.RAW_MATERIAL ||
    category === EXPENSE_TAX_CATEGORY.MERCHANDISE ||
    category === EXPENSE_TAX_CATEGORY.INVESTMENT ||
    includesAny(text, RAW_MATERIAL_WORDS) ||
    includesAny(text, FIXED_ASSET_WORDS)
  ) {
    return {
      type: EU_TRANSACTION_TYPE.GOODS,
      reason: "Achat UE a 0 % identifie comme bien",
    };
  }
  return {
    type: EU_TRANSACTION_TYPE.NONE,
    reason: "Type UE non reconnu automatiquement",
  };
}

export function getSupplierVatDefaults(supplier = {}) {
  const countryCode = normalizeCountryCode(supplier.country_code || supplier.country_name || supplier.country);
  const origin = supplier.default_vat_origin || getVatOriginFromCountry(countryCode);
  const warnings = [];

  if (!countryCode) {
    warnings.push("Pays fournisseur non renseigne");
  }

  if (countryCode && isEuCountry(countryCode) && countryCode !== "LU" && !supplier.vat_number) {
    warnings.push("Numero TVA fournisseur UE absent");
  }

  return {
    country_code: countryCode,
    country_name: supplier.country_name || "",
    is_eu: countryCode ? isEuCountry(countryCode) : false,
    default_vat_origin: origin,
    default_transaction_type: supplier.default_transaction_type || EU_TRANSACTION_TYPE.NONE,
    warnings,
  };
}

export function suggestExpenseVatClassification({ expense = {}, supplier = {} } = {}) {
  const supplierDefaults = getSupplierVatDefaults(supplier);
  const categorySuggestion = inferCategory(expense);
  const vatRate = Number(expense.vatRate ?? expense.taxRate ?? 0);
  const vatAmount = Number(expense.vatAmount ?? expense.tva ?? 0);
  const vatOrigin = expense.vat_origin || supplierDefaults.default_vat_origin || null;
  const warnings = [...supplierDefaults.warnings];
  const reasons = [];
  const currentEuTransactionType =
    expense.eu_transaction_type && expense.eu_transaction_type !== EU_TRANSACTION_TYPE.NONE
      ? expense.eu_transaction_type
      : "";
  let expenseCategory =
    expense.expense_tax_category ||
    (expense.is_fixed_asset ? EXPENSE_TAX_CATEGORY.INVESTMENT : null) ||
    categorySuggestion.category;
  let isFixedAsset = Boolean(expense.is_fixed_asset ?? categorySuggestion.isFixedAsset);
  let categoryConfidence = categorySuggestion.confidence;
  let categoryReason = categorySuggestion.reason;
  if (!expenseCategory && vatOrigin === VAT_ORIGIN.LU && LUXEMBOURG_VAT_RATES.includes(vatRate)) {
    expenseCategory = EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE;
    isFixedAsset = false;
    categoryConfidence = "medium";
    categoryReason = "Depense LU sans categorie: proposition en frais generaux a confirmer";
  }
  const suggestions = {
    vat_origin: vatOrigin,
    expense_tax_category: expenseCategory,
    eu_transaction_type: currentEuTransactionType || EU_TRANSACTION_TYPE.NONE,
    vat_deductibility: expense.vat_deductibility || VAT_DEDUCTIBILITY.FULLY,
    deductible_percentage:
      expense.deductible_percentage == null || expense.deductible_percentage === ""
        ? 100
        : expense.deductible_percentage,
    vat_review_status: expense.vat_review_status || VAT_REVIEW_STATUS.AUTO_SUGGESTED,
    reverse_charge_vat_rate:
      expense.reverse_charge_vat_rate == null || expense.reverse_charge_vat_rate === ""
        ? 17
        : expense.reverse_charge_vat_rate,
    reverse_charge_rate_status:
      expense.reverse_charge_rate_status || REVERSE_CHARGE_RATE_STATUS.SUGGESTED,
    is_fixed_asset: isFixedAsset,
  };

  if (supplierDefaults.default_vat_origin) {
    reasons.push(`Origine TVA proposee depuis le pays fournisseur: ${supplierDefaults.default_vat_origin}`);
  }

  if (expenseCategory) {
    reasons.push(categoryReason);
  } else {
    warnings.push("Categorie fiscale non reconnue automatiquement");
  }

  if (vatOrigin === VAT_ORIGIN.LU) {
    suggestions.eu_transaction_type = EU_TRANSACTION_TYPE.NONE;
    reasons.push("Fournisseur Luxembourg: operation non intracommunautaire");
  }

  if (vatOrigin === VAT_ORIGIN.EU) {
    if (vatRate === 0) {
      const euType = inferEuTransactionType(expense, categorySuggestion.category);
      suggestions.eu_transaction_type =
        currentEuTransactionType || supplier.default_transaction_type || euType.type;
      reasons.push(euType.reason);
    } else {
      suggestions.eu_transaction_type =
        currentEuTransactionType || supplier.default_transaction_type || EU_TRANSACTION_TYPE.NONE;
    }

    if (FOREIGN_EU_VAT_RATES.includes(vatRate) && vatAmount > 0) {
      warnings.push("TVA etrangere non deductible dans la declaration TVA luxembourgeoise");
    }
  }

  if (vatOrigin === VAT_ORIGIN.NON_EU) {
    suggestions.eu_transaction_type = EU_TRANSACTION_TYPE.NONE;
    reasons.push("Fournisseur hors UE");
  }

  const confidence =
    warnings.length > 0 || !suggestions.vat_origin || !suggestions.expense_tax_category
      ? "low"
      : categoryConfidence;

  return {
    suggestions,
    reasons,
    confidence,
    warnings,
  };
}

export function applyExpenseVatSuggestions(current = {}, suggestions = {}, { overwrite = false } = {}) {
  const next = { ...current };
  for (const [key, value] of Object.entries(suggestions || {})) {
    const hasManualValue = next[key] !== undefined && next[key] !== null && next[key] !== "";
    if (!hasManualValue || overwrite) {
      next[key] = value;
    }
  }
  return next;
}

export function validateExpenseVatClassification(expense = {}, supplier = {}) {
  const errors = [];
  const normalized = normalizeExpenseVatFields(expense);
  const supplierCountryCode = normalizeCountryCode(supplier.country_code);

  if (
    normalized.vat_origin === VAT_ORIGIN.EU &&
    (!normalized.eu_transaction_type || normalized.eu_transaction_type === EU_TRANSACTION_TYPE.NONE)
  ) {
    errors.push("Origine UE : le type bien/service est obligatoire.");
  }

  if (normalized.vat_deductibility === VAT_DEDUCTIBILITY.PARTIALLY) {
    const percentage = Number(normalized.deductible_percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      errors.push("Deductibilite partielle : pourcentage invalide.");
    }
  }

  if (normalized.expense_tax_category === EXPENSE_TAX_CATEGORY.INVESTMENT || normalized.is_fixed_asset) {
    if (!String(normalized.asset_name || "").trim()) {
      errors.push("Immobilisation : nom obligatoire.");
    }
    if (!String(normalized.asset_purchase_date || "").trim()) {
      errors.push("Immobilisation : date d'acquisition obligatoire.");
    }
  }

  const reverseRate = Number(normalized.reverse_charge_vat_rate);
  if (!Number.isFinite(reverseRate) || reverseRate < 0 || reverseRate > 100) {
    errors.push("Taux d'autoliquidation invalide.");
  }

  if (normalized.vat_origin === VAT_ORIGIN.EU && (!supplierCountryCode || !isEuCountry(supplierCountryCode))) {
    errors.push("Fournisseur UE sans pays UE coherent.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
