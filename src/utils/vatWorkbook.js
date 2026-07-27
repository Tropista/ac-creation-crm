import { clientName, uid } from "./documents";

export const VAT_WORKBOOK_SHEETS = [
  { key: "achatsLux", excelName: "Achats_LUX", label: "Achats Luxembourg", sourceType: "expense", columns: ["Date", "Fournisseurs", "N° de facture", "Nature", "Montant HTVA (EUR)", "Taux de TVA", "Montant TVA (EUR)", "Montant TTC (EUR)"] },
  { key: "aic", excelName: "AIC", label: "AIC", sourceType: "expense", columns: ["Date", "Fournisseurs", "N° de facture", "Nature des biens", "Pays", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)", "Taux TVA", "Montant TVA (EUR)", "Montant TTC (EUR)"] },
  { key: "chidaLux", excelName: "Chida_LUX", label: "Chiffre d’affaires Luxembourg", sourceType: "invoice", columns: ["Date", "Clients", "N° facture", "Nature", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)", "Taux TVA", "Montant TVA (EUR)", "Montant TTC (EUR)"] },
  { key: "chidaUeTaxable", excelName: "Chida_UE", label: "Chiffre d’affaires UE", section: "Prestations de services non exonérées dans l’État membre du preneur redevable", sourceType: "invoice", columns: ["Date", "Clients", "N° facture", "Nature", "Pays", "N° de TVA", "Montant (Devise)", "Devise", "Taux de change", "Montant HTVA EUR"] },
  { key: "chidaUeExempt", excelName: "Chida_UE", label: "Chiffre d’affaires UE", section: "Prestations de services exonérées dans l’État membre du preneur redevable", sourceType: "invoice", columns: ["Date paiement", "Emprunteurs", "Pays de l’emprunteur", "Nature", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)"] },
  { key: "importations1", excelName: "Importations 1", label: "Importations 1", sourceType: "expense", columns: ["Date", "Fournisseurs", "N° de facture", "Nature des biens", "Pays", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)", "Taux TVA", "Montant TVA (EUR)", "Montant TTC (EUR)"] },
  { key: "chidaHue", excelName: "Chida_HUE", label: "Chiffre d’affaires hors UE", section: "Autres opérations réalisées à l’étranger — Clients redevables situés en dehors de l’Union européenne", sourceType: "invoice", columns: ["Date", "Clients", "N° facture", "Nature", "Pays", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)"] },
  { key: "importations", excelName: "Importations", label: "Importations", sourceType: "expense", columns: ["Date", "Fournisseurs", "N° de facture", "Nature des biens", "Pays", "Montant HTVA (Devise)", "Devise", "Taux de change", "Montant HTVA (EUR)", "Taux TVA", "Montant TVA (EUR)", "Montant TTC (EUR)"] },
];

export const VAT_WORKBOOK_SHEET_BY_KEY = Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, sheet]));

const EU_COUNTRIES = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]);

const toNumber = (value) => Number(value || 0);
const now = () => new Date().toISOString();
export const toVatWorkbookDate = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  const localParts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (localParts) return `${localParts[3]}-${localParts[2].padStart(2, "0")}-${localParts[1].padStart(2, "0")}`;
  const canonical = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (canonical) return canonical[1];
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

function isInvoiceInPeriod(invoice, startDate, endDate) {
  const iso = toVatWorkbookDate(invoice.invoiceDate || invoice.date || invoice.createdAt);
  if (!iso) return false;
  return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
}

function isExpenseInPeriod(expense, startDate, endDate) {
  const iso = toVatWorkbookDate(expense.expenseDate || expense.purchaseDate || expense.date || expense.createdAt);
  if (!iso) return false;
  return (!startDate || iso >= startDate) && (!endDate || iso <= endDate);
}

export function createVatWorkbookPeriod({ startDate = "", endDate = "", name = "" } = {}) {
  const timestamp = now();
  return {
    id: uid(),
    name,
    startDate,
    endDate,
    status: "draft",
    sheets: Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, []])),
    prorataGeneral: 100,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeVatWorkbookPeriod(period = {}) {
  const base = createVatWorkbookPeriod(period);
  return {
    ...base,
    ...period,
    sheets: Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, Array.isArray(period.sheets?.[sheet.key]) ? period.sheets[sheet.key] : []])),
    prorataGeneral: Number(period.prorataGeneral ?? 100),
  };
}

export function getDocumentCountry(document = {}) {
  return String(document.country || document.countryCode || document.vat_country || document.vatCountry || "LU").trim().toUpperCase();
}

export function recommendVatWorkbookSheet(document = {}, sourceType) {
  const country = getDocumentCountry(document);
  const origin = String(document.vat_origin || document.vatOrigin || "").toLowerCase();
  const euType = String(document.eu_transaction_type || document.euTransactionType || "").toLowerCase();
  if (sourceType === "invoice") {
    if (country === "LU") return "chidaLux";
    if (EU_COUNTRIES.has(country)) return "chidaUeTaxable";
    return "chidaHue";
  }
  if (country === "LU" || origin === "lu" || origin === "luxembourg") return "achatsLux";
  if (EU_COUNTRIES.has(country) || origin === "ue" || origin === "eu") return euType === "service" ? "aic" : "aic";
  return "importations";
}

export function createVatWorkbookSnapshot(document = {}, sourceType, data = {}) {
  const isExpense = sourceType === "expense";
  const partner = isExpense ? document.supplierName || document.supplier || "" : clientName(data, document.clientId);
  const date = isExpense
    ? toVatWorkbookDate(document.expenseDate || document.purchaseDate || document.date || document.createdAt)
    : toVatWorkbookDate(document.invoiceDate || document.date || document.createdAt);
  const amountHT = toNumber(document.amountHT ?? document.totalHT);
  const vatAmount = toNumber(document.vatAmount ?? document.taxAmount ?? document.totalVAT);
  const vatRate = toNumber(document.vatRate ?? document.taxRate ?? data.settings?.taxRate);
  const currency = String(document.currency || "EUR").toUpperCase();
  const exchangeRate = toNumber(document.exchangeRate || document.currencyRate || 1) || 1;
  return {
    id: uid(),
    sourceType,
    sourceId: document.id,
    date,
    partner,
    number: String(isExpense ? document.invoiceNumber || "" : document.number || ""),
    nature: String(document.description || document.notes || document.category || ""),
    country: getDocumentCountry(document),
    vatNumber: String(document.clientVatNumber || document.vatNumber || ""),
    amountCurrency: amountHT,
    currency,
    exchangeRate,
    amountHT: Math.round(amountHT * exchangeRate * 100) / 100,
    vatRate,
    vatAmount,
    totalTTC: toNumber(document.totalTTC ?? amountHT + vatAmount),
    createdAt: now(),
    updatedAt: now(),
  };
}

export function getVatWorkbookDocumentCandidates(data = {}, period = {}, sourceType, { includeOutsidePeriod = false } = {}) {
  const documents = sourceType === "expense" ? data.expenses || [] : data.invoices || [];
  return documents
    .map((document) => ({
      document,
      inPeriod: sourceType === "expense"
        ? isExpenseInPeriod(document, period.startDate, period.endDate)
        : isInvoiceInPeriod(document, period.startDate, period.endDate),
    }))
    .filter(({ inPeriod }) => includeOutsidePeriod || inPeriod)
    .map(({ document, inPeriod }) => ({
      document,
      inPeriod,
      sourceType,
      sourceId: document.id,
      recommendedSheet: recommendVatWorkbookSheet(document, sourceType),
      snapshot: createVatWorkbookSnapshot(document, sourceType, data),
    }));
}

export function findVatWorkbookPlacement(period = {}, sourceType, sourceId) {
  for (const sheet of VAT_WORKBOOK_SHEETS) {
    const line = (period.sheets?.[sheet.key] || []).find((item) => item.sourceType === sourceType && String(item.sourceId) === String(sourceId));
    if (line) return { sheetKey: sheet.key, line };
  }
  return null;
}

export function addVatWorkbookSnapshots(period, sheetKey, snapshots = [], { moveExisting = false } = {}) {
  const normalized = normalizeVatWorkbookPeriod(period);
  const nextSheets = { ...normalized.sheets };
  const added = [];
  const moved = [];
  const skipped = [];
  for (const snapshot of snapshots) {
    const placement = findVatWorkbookPlacement({ ...normalized, sheets: nextSheets }, snapshot.sourceType, snapshot.sourceId);
    if (placement?.sheetKey === sheetKey) { skipped.push(snapshot); continue; }
    if (placement && !moveExisting) { skipped.push(snapshot); continue; }
    if (placement) {
      nextSheets[placement.sheetKey] = nextSheets[placement.sheetKey].filter((line) => line.id !== placement.line.id);
      moved.push(snapshot);
    }
    nextSheets[sheetKey] = [...nextSheets[sheetKey], snapshot];
    added.push(snapshot);
  }
  return { period: { ...normalized, sheets: nextSheets, updatedAt: now() }, added, moved, skipped };
}

export function updateVatWorkbookLine(period, sheetKey, lineId, patch = {}) {
  const normalized = normalizeVatWorkbookPeriod(period);
  return {
    ...normalized,
    sheets: { ...normalized.sheets, [sheetKey]: (normalized.sheets[sheetKey] || []).map((line) => line.id === lineId ? { ...line, ...patch, updatedAt: now() } : line) },
    updatedAt: now(),
  };
}

export function removeVatWorkbookLine(period, sheetKey, lineId) {
  const normalized = normalizeVatWorkbookPeriod(period);
  return { ...normalized, sheets: { ...normalized.sheets, [sheetKey]: (normalized.sheets[sheetKey] || []).filter((line) => line.id !== lineId) }, updatedAt: now() };
}

export function calculateVatWorkbookDeductible(period = {}) {
  const normalized = normalizeVatWorkbookPeriod(period);
  const sum = (sheetKey, field) => (normalized.sheets[sheetKey] || []).reduce((total, line) => total + toNumber(line[field]), 0);
  const localBase = sum("achatsLux", "amountHT");
  const aicBase = sum("aic", "amountHT");
  const importBase = sum("importations1", "amountHT");
  const debtorBase = 0;
  const localVat = sum("achatsLux", "vatAmount") || localBase * 0.17;
  const aicVat = sum("aic", "vatAmount") || aicBase * 0.17;
  const importVat = sum("importations1", "vatAmount") || importBase * 0.17;
  const debtorVat = debtorBase * 0.17;
  const subjectToProrata = localVat + aicVat + importVat + debtorVat;
  const prorata = Math.max(0, Math.min(100, Number(normalized.prorataGeneral ?? 100))) / 100;
  return {
    prorataGeneral: prorata * 100,
    localBase, localVat,
    aicBase, aicVat,
    importBase, importVat,
    debtorBase, debtorVat,
    subjectToProrata,
    deductible: subjectToProrata * prorata,
    nonDeductible: subjectToProrata * (1 - prorata),
  };
}
