import { downloadCsv, rowsToCsv } from "./exportCsv";
import {
  centsAsMoney,
  getVatReportTaxYear,
  normalizeSavedVatReportForExport,
} from "./vatReportExportModel";

const CASE_HEADERS = [
  "case",
  "intitule",
  "type",
  "montant",
  "statut",
  "nombre_lignes_sources",
  "annee_fiscale",
  "version_formulaire",
  "version_calcul",
];

const SOURCE_HEADERS = [
  "date",
  "type",
  "numero",
  "client_fournisseur",
  "pays",
  "description",
  "montant_ht",
  "taux_tva",
  "montant_tva",
  "montant_ttc",
  "categorie_fiscale",
  "origine_tva",
  "type_operation_ue",
  "deductibilite",
  "pourcentage_deductible",
  "immobilisation",
  "cases_ecdf",
  "inclus_exclus",
  "raison_exclusion",
  "statut_verification",
  "anomalies",
];

function cleanText(value) {
  const text = String(value ?? "");
  return /^[=+@]/.test(text) ? `'${text}` : text;
}

function formatCsvMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2).replace(".", ",") : "0,00";
}

function formatCents(cents) {
  return formatCsvMoney(centsAsMoney(cents));
}

function formatRate(value) {
  if (value === "" || value == null) return "";
  const rate = Number(value);
  return Number.isFinite(rate) ? String(rate).replace(".", ",") : cleanText(value);
}

function vatBoxType(box = "") {
  if (["701", "703", "705", "031", "711", "741", "051", "436", "154", "131", "129", "139", "137", "776", "771", "001", "002", "004", "005", "012", "022"].includes(String(box))) {
    return "base HT";
  }
  if (["702", "704", "706", "040", "712", "742", "056", "076", "077", "078", "081", "082", "085", "086", "093", "097", "102", "103", "104", "462", "404"].includes(String(box))) {
    return "taxe";
  }
  return "total";
}

function boxStatus(report = {}, entry = {}) {
  const sourceIds = entry.sourceIds || [];
  if ((report.anomalies || []).some((item) => item.level === "error" && sourceIds.includes(item.sourceId))) {
    return "a verifier";
  }
  if ((report.anomalies || []).some((item) => sourceIds.includes(item.sourceId))) {
    return "provisoire";
  }
  return "calcule";
}

function reportYear(report = {}) {
  return getVatReportTaxYear(report) || "sans-annee";
}

function ecdfBoxRows(report = {}) {
  const year = getVatReportTaxYear(report);
  return (report.ecdfBoxes || []).map((entry) => [
    cleanText(entry.box),
    cleanText(entry.label),
    vatBoxType(entry.box),
    formatCents(entry.amountCents),
    boxStatus(report, entry),
    String((entry.sourceIds || []).length),
    String(year || ""),
    cleanText(report.ecdf_form_version || report.form_version || ""),
    cleanText(report.calculation_version || ""),
  ]);
}

function lineAnomalies(line = {}) {
  return (line.anomalies || [])
    .map((entry) => entry.code || entry.message || "")
    .filter(Boolean)
    .join(" | ");
}

function lineReviewStatus(line = {}) {
  if ((line.anomalies || []).some((entry) => entry.level === "error")) return "a_verifier";
  if ((line.anomalies || []).length) return "provisoire";
  return "valide";
}

function sourceLineRows(report = {}) {
  return (report.lines || []).map((line) => [
    cleanText(line.date),
    cleanText(line.type || line.sourceType),
    cleanText(line.number),
    cleanText(line.partner),
    cleanText(line.country),
    cleanText(line.description),
    formatCents(line.htCents),
    formatRate(line.rate),
    formatCents(line.vatCents || line.reverseChargeVatCents || 0),
    formatCents(line.ttcCents),
    cleanText(line.sale_tax_category || line.category),
    cleanText(line.vatOrigin),
    cleanText(line.euTransactionType),
    cleanText(line.vatDeductibility || line.vat_deductibility),
    formatRate(line.deductiblePercentage ?? line.deductible_percentage),
    line.is_fixed_asset ? "oui" : "non",
    cleanText((line.ecdfBoxes || []).join("|")),
    line.officialExcluded ? "exclu" : "inclus",
    cleanText(line.exclusionReason || ""),
    lineReviewStatus(line),
    cleanText(lineAnomalies(line)),
  ]);
}

export function buildVatEcdfBoxesCsv(report = {}) {
  const filename = `cases-ecdf-tva-${reportYear(report)}.csv`;
  const rows = ecdfBoxRows(report);
  return {
    filename,
    headers: CASE_HEADERS,
    rows,
    content: rowsToCsv(CASE_HEADERS, rows),
  };
}

export function buildVatSourceLinesCsv(report = {}) {
  const filename = `lignes-sources-tva-${reportYear(report)}.csv`;
  const rows = sourceLineRows(report);
  return {
    filename,
    headers: SOURCE_HEADERS,
    rows,
    content: rowsToCsv(SOURCE_HEADERS, rows),
  };
}

export function exportVatEcdfBoxesCsv(report = {}) {
  const built = buildVatEcdfBoxesCsv(report);
  downloadCsv(built.filename, built.headers, built.rows);
  return built.filename;
}

export function exportVatSourceLinesCsv(report = {}) {
  const built = buildVatSourceLinesCsv(report);
  downloadCsv(built.filename, built.headers, built.rows);
  return built.filename;
}

export function normalizeSavedReportForVatCsv(savedReport = {}) {
  return normalizeSavedVatReportForExport(savedReport);
}
