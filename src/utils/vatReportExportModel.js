import {
  ACCOUNTING_BASIS,
  ECDF_FORM_VERSION,
  REPORT_VALIDATION_STATUS,
  VAT_CALCULATION_VERSION,
  centsToMoney,
  moneyToCents,
} from "./vatDeclaration";

export const VAT_EXPORT_SOURCE = {
  CURRENT: "current",
  SAVED: "saved",
};

export const VAT_REPORT_STATUS_LABELS = {
  draft: "Incomplet",
  incomplete: "Incomplet",
  ready_for_review: "Pret pour verification",
  reviewed: "Vérifié",
  filed: "Déposé manuellement dans eCDF",
  amended: "Rectificatif",
};

export function sanitizeVatFilenamePart(value) {
  const normalized = String(value || "ac-creation")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "ac-creation";
}

export function getVatReportTaxYear(report = {}) {
  return report.tax_year ?? report.year ?? report.period?.taxYear ?? "";
}

export function getVatReportStatus(report = {}) {
  return report.report_validation_status || report.status || REPORT_VALIDATION_STATUS.INCOMPLETE;
}

export function getVatReportStatusLabel(report = {}) {
  return VAT_REPORT_STATUS_LABELS[getVatReportStatus(report)] || getVatReportStatus(report) || "Incomplet";
}

export function getVatReportBlockingErrorCount(report = {}) {
  return (report.anomalies || []).filter((entry) => entry.level === "error").length;
}

function moneyCents(value) {
  return moneyToCents(value);
}

function savedLineToExportLine(line = {}) {
  const anomalyCodes = line.anomaly_codes || line.anomalies || [];
  const isExcluded = line.included_or_excluded === "excluded";
  return {
    id: line.id || `${line.type || "source"}:${line.document_number || ""}`,
    sourceId: line.id || line.document_number || "",
    type: line.type || "",
    sourceType: line.type || "",
    date: line.date || "",
    number: line.document_number || line.number || "",
    partner: line.client_or_supplier || line.partner || "",
    country: line.country || line.pays || "",
    description: line.description || "",
    htCents: moneyCents(line.amount_ht),
    rate: line.vat_rate ?? line.rate ?? "",
    vatCents: moneyCents(line.vat_amount),
    reverseChargeVatCents: moneyCents(line.reverse_charge_vat_amount),
    deductibleVatCents: moneyCents(line.deductible_vat_amount),
    foreignVatCents: moneyCents(line.foreign_vat_amount),
    ttcCents: moneyCents(line.total_ttc),
    category: line.category || line.sale_tax_category || "",
    sale_tax_category: line.sale_tax_category || line.category || "",
    vatOrigin: line.vat_origin || "",
    euTransactionType: line.eu_transaction_type || "",
    vatDeductibility: line.vat_deductibility || "",
    deductiblePercentage: line.deductible_percentage ?? "",
    is_fixed_asset: Boolean(line.immobilisation || line.is_fixed_asset),
    ecdfBoxes: line.ecdf_boxes || line.ecdfBoxes || [],
    officialExcluded: isExcluded,
    exclusionReason: line.exclusion_reason || "",
    anomalies: anomalyCodes.map((code) =>
      typeof code === "string"
        ? { level: "error", code, message: code, sourceId: line.id || "" }
        : code
    ),
  };
}

export function normalizeSavedVatReportForExport(savedReport = {}) {
  const snapshot = savedReport.source_snapshot_json || {};
  const warnings = savedReport.warnings_json || [];
  const hasBlocking = warnings.some((entry) => entry.level === "error");
  return {
    id: savedReport.id,
    tax_year: savedReport.tax_year ?? savedReport.year ?? null,
    year: savedReport.year ?? savedReport.tax_year ?? null,
    period: {
      taxYear: savedReport.tax_year ?? savedReport.year ?? null,
      startDate: savedReport.period_start || "",
      endDate: savedReport.period_end || "",
    },
    accounting_basis: savedReport.accounting_basis || ACCOUNTING_BASIS.INVOICE,
    status: savedReport.status || "",
    report_validation_status:
      savedReport.report_validation_status ||
      (hasBlocking ? REPORT_VALIDATION_STATUS.INCOMPLETE : REPORT_VALIDATION_STATUS.READY_FOR_REVIEW),
    report_version: savedReport.report_version || 1,
    totals: savedReport.totals_json || {},
    ecdfBoxes: savedReport.ecdf_boxes_json || [],
    anomalies: warnings,
    lines: (snapshot.lines || []).map(savedLineToExportLine),
    excluded: [],
    calculation_version: savedReport.calculation_version || VAT_CALCULATION_VERSION,
    ecdf_form_version: savedReport.ecdf_form_version || savedReport.form_version || ECDF_FORM_VERSION,
    form_version: savedReport.ecdf_form_version || savedReport.form_version || ECDF_FORM_VERSION,
    generated_at: savedReport.generated_at || snapshot.generated_at || "",
    updatedAt: savedReport.updatedAt || savedReport.updated_at || "",
    saved_at: savedReport.updatedAt || savedReport.updated_at || savedReport.generated_at || "",
    source_snapshot_json: snapshot,
    source_line_count: savedReport.source_line_count ?? snapshot.line_count ?? (snapshot.lines || []).length,
    is_final_balance_reliable: Boolean(
      savedReport.is_final_balance_reliable ?? !hasBlocking
    ),
    exportSource: VAT_EXPORT_SOURCE.SAVED,
  };
}

export function normalizeCurrentVatReportForExport(report = {}) {
  return {
    ...report,
    totals: report.totals || {},
    ecdfBoxes: report.ecdfBoxes || [],
    anomalies: report.anomalies || [],
    lines: report.lines || [],
    excluded: report.excluded || [],
    calculation_version: report.calculation_version || VAT_CALCULATION_VERSION,
    ecdf_form_version: report.ecdf_form_version || report.form_version || ECDF_FORM_VERSION,
    form_version: report.ecdf_form_version || report.form_version || ECDF_FORM_VERSION,
    is_final_balance_reliable: Boolean(report.is_final_balance_reliable),
    exportSource: VAT_EXPORT_SOURCE.CURRENT,
  };
}

export function buildVatExportContext({ report, savedReport = null, mode = VAT_EXPORT_SOURCE.CURRENT } = {}) {
  if (mode === VAT_EXPORT_SOURCE.SAVED) {
    if (!savedReport) {
      const error = new Error("Snapshot de rapport enregistré indisponible.");
      error.code = "VAT_EXPORT_SNAPSHOT_MISSING";
      throw error;
    }
    return normalizeSavedVatReportForExport(savedReport);
  }
  return normalizeCurrentVatReportForExport(report);
}

export function centsAsMoney(cents) {
  return centsToMoney(cents);
}
