import {
  ECDF_FORM_VERSION,
  REPORT_VALIDATION_STATUS,
  VAT_CALCULATION_VERSION,
  centsToMoney,
} from "../utils/vatDeclaration";

export const VAT_REPORT_STATUS = {
  DRAFT: "draft",
  REVIEWED: "reviewed",
  FILED: "filed",
  AMENDED: "amended",
};

export const VAT_REPORT_ERRORS = {
  BLOCKING_ANOMALIES: "VAT_REPORT_BLOCKING_ANOMALIES",
  INVALID_STATUS: "VAT_REPORT_INVALID_STATUS",
  FILED_REPORT_LOCKED: "VAT_REPORT_FILED_LOCKED",
  CONFLICT: "VAT_REPORT_CONFLICT",
};

export const VAT_SNAPSHOT_WARNING_BYTES = 750_000;

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : String(now);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `vat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function byteSize(value) {
  const serialized = JSON.stringify(value ?? null);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).length;
  }
  return serialized.length;
}

function hasBlockingErrors(report = {}) {
  return (report.anomalies || []).some((entry) => entry.level === "error");
}

export function getReportValidationStatus(report = {}) {
  return hasBlockingErrors(report)
    ? REPORT_VALIDATION_STATUS.INCOMPLETE
    : REPORT_VALIDATION_STATUS.READY_FOR_REVIEW;
}

function lineAnomalyCodes(line = {}) {
  return (line.anomalies || []).map((entry) => entry.code).filter(Boolean);
}

function normalizeSourceLine(line = {}) {
  return {
    id: line.sourceId || line.id,
    type: line.type || line.sourceType || "",
    date: line.date || "",
    document_number: line.number || "",
    client_or_supplier: line.partner || "",
    amount_ht: centsToMoney(line.htCents),
    vat_rate: line.rate ?? null,
    vat_amount: centsToMoney(line.vatCents || line.reverseChargeVatCents || 0),
    total_ttc: centsToMoney(line.ttcCents),
    category: line.sale_tax_category || line.category || "",
    vat_origin: line.vatOrigin || "",
    eu_transaction_type: line.euTransactionType || "",
    vat_deductibility: line.vatDeductibility || line.vat_deductibility || "",
    deductible_percentage: line.deductiblePercentage ?? line.deductible_percentage ?? null,
    ecdf_boxes: [...new Set(line.ecdfBoxes || [])],
    included_or_excluded: line.officialExcluded ? "excluded" : "included",
    exclusion_reason: line.exclusionReason || "",
    anomaly_codes: lineAnomalyCodes(line),
  };
}

function normalizeExcludedLine(line = {}) {
  return {
    id: line.sourceId || line.id,
    type: line.sourceType || "",
    date: line.date || "",
    document_number: line.number || "",
    client_or_supplier: line.partner || "",
    amount_ht: 0,
    vat_rate: null,
    vat_amount: 0,
    total_ttc: 0,
    category: "",
    vat_origin: "",
    eu_transaction_type: "",
    vat_deductibility: "",
    deductible_percentage: null,
    ecdf_boxes: [],
    included_or_excluded: "excluded",
    exclusion_reason: line.reason || "",
    anomaly_codes: line.code ? [line.code] : [],
  };
}

export function buildVatSourceSnapshot(report = {}) {
  const sourceLines = [
    ...(report.lines || []).map(normalizeSourceLine),
    ...(report.excluded || [])
      .filter((line) => !(report.lines || []).some((source) => String(source.sourceId) === String(line.sourceId)))
      .map(normalizeExcludedLine),
  ];
  const snapshot = {
    generated_at: report.generated_at || nowIso(),
    line_count: sourceLines.length,
    lines: sourceLines,
  };
  const sizeBytes = byteSize(snapshot);
  return {
    snapshot,
    source_line_count: sourceLines.length,
    source_snapshot_size_bytes: sizeBytes,
    snapshot_size_warning:
      sizeBytes > VAT_SNAPSHOT_WARNING_BYTES
        ? "Snapshot TVA volumineux: conserver une structure compacte avant depot."
        : "",
  };
}

export function buildVatReportRecord({
  report = {},
  taxYear,
  periodStart,
  periodEnd,
  accountingBasis,
  status = VAT_REPORT_STATUS.DRAFT,
  previousReport = null,
  parentReportId = "",
  currentUser = null,
  notes = "",
  now = new Date(),
} = {}) {
  const timestamp = nowIso(now);
  const previousVersion = Number(previousReport?.report_version || 0);
  const { snapshot, source_line_count, source_snapshot_size_bytes, snapshot_size_warning } =
    buildVatSourceSnapshot(report);
  const validationStatus =
    status === VAT_REPORT_STATUS.REVIEWED
      ? REPORT_VALIDATION_STATUS.REVIEWED
      : status === VAT_REPORT_STATUS.FILED
        ? REPORT_VALIDATION_STATUS.FILED
        : getReportValidationStatus(report);

  return {
    id: previousReport?.status === VAT_REPORT_STATUS.FILED ? createId() : previousReport?.id || createId(),
    year: taxYear ?? report.tax_year ?? report.period?.taxYear ?? null,
    tax_year: taxYear ?? report.tax_year ?? report.period?.taxYear ?? null,
    period_start: periodStart || report.period?.startDate || "",
    period_end: periodEnd || report.period?.endDate || "",
    accounting_basis: accountingBasis || report.accounting_basis || "invoice",
    status,
    report_validation_status: validationStatus,
    report_version: previousVersion + 1 || 1,
    parent_report_id: parentReportId || previousReport?.parent_report_id || "",
    totals_json: report.totals || {},
    ecdf_boxes_json: report.ecdfBoxes || [],
    warnings_json: report.anomalies || [],
    source_snapshot_json: snapshot,
    source_line_count,
    source_snapshot_size_bytes,
    snapshot_size_warning,
    calculation_version: report.calculation_version || VAT_CALCULATION_VERSION,
    ecdf_form_version: report.ecdf_form_version || report.form_version || ECDF_FORM_VERSION,
    generated_at: report.generated_at || timestamp,
    reviewed_at: status === VAT_REPORT_STATUS.REVIEWED ? timestamp : previousReport?.reviewed_at || null,
    filed_at: status === VAT_REPORT_STATUS.FILED ? timestamp : previousReport?.filed_at || null,
    created_by: previousReport?.created_by || currentUser?.email || "",
    updated_by: currentUser?.email || "",
    notes,
    createdAt: previousReport?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export function getVatReports(data = {}, { taxYear } = {}) {
  return [...(data.vatReports || [])]
    .filter((report) => taxYear == null || Number(report.tax_year || report.year) === Number(taxYear))
    .sort((a, b) => String(b.updatedAt || b.generated_at || "").localeCompare(String(a.updatedAt || a.generated_at || "")));
}

export function getVatReportById(data = {}, id) {
  return (data.vatReports || []).find((report) => String(report.id) === String(id)) || null;
}

export function assertNoConcurrentChange(currentReport, loadedUpdatedAt) {
  if (!currentReport || !loadedUpdatedAt) return;
  const currentAt = Date.parse(currentReport.updatedAt || currentReport.updated_at || "");
  const loadedAt = Date.parse(loadedUpdatedAt);
  if (Number.isFinite(currentAt) && Number.isFinite(loadedAt) && currentAt > loadedAt) {
    const error = new Error("Ce rapport a ete modifie depuis son chargement");
    error.code = VAT_REPORT_ERRORS.CONFLICT;
    throw error;
  }
}

function upsertReport(data = {}, report) {
  const reports = data.vatReports || [];
  const exists = reports.some((entry) => String(entry.id) === String(report.id));
  return {
    ...data,
    vatReports: exists
      ? reports.map((entry) => (String(entry.id) === String(report.id) ? report : entry))
      : [report, ...reports],
  };
}

export function createVatReport(data = {}, report, meta = {}) {
  const vatReport = buildVatReportRecord({ report, ...meta, status: VAT_REPORT_STATUS.DRAFT });
  return { data: upsertReport(data, vatReport), report: vatReport };
}

export function updateVatReport(data = {}, reportId, report, meta = {}) {
  const current = getVatReportById(data, reportId);
  assertNoConcurrentChange(current, meta.loadedUpdatedAt);
  if (current?.status === VAT_REPORT_STATUS.FILED) {
    const error = new Error("Un rapport depose ne peut pas etre modifie");
    error.code = VAT_REPORT_ERRORS.FILED_REPORT_LOCKED;
    throw error;
  }
  const vatReport = buildVatReportRecord({
    report,
    ...meta,
    previousReport: current,
    status: current?.status || VAT_REPORT_STATUS.DRAFT,
  });
  return { data: upsertReport(data, vatReport), report: vatReport };
}

export function markVatReportReviewed(data = {}, reportId, meta = {}) {
  const current = getVatReportById(data, reportId);
  assertNoConcurrentChange(current, meta.loadedUpdatedAt);
  if (!current) throw new Error("Rapport TVA introuvable");
  if (current.report_validation_status === REPORT_VALIDATION_STATUS.INCOMPLETE) {
    const error = new Error("Impossible de verifier un rapport avec erreurs bloquantes");
    error.code = VAT_REPORT_ERRORS.BLOCKING_ANOMALIES;
    throw error;
  }
  if (current.status === VAT_REPORT_STATUS.FILED) {
    const error = new Error("Un rapport depose est verrouille");
    error.code = VAT_REPORT_ERRORS.FILED_REPORT_LOCKED;
    throw error;
  }
  const timestamp = nowIso(meta.now || new Date());
  const next = {
    ...current,
    status: VAT_REPORT_STATUS.REVIEWED,
    report_validation_status: REPORT_VALIDATION_STATUS.REVIEWED,
    reviewed_at: timestamp,
    updatedAt: timestamp,
    updated_by: meta.currentUser?.email || current.updated_by || "",
  };
  return { data: upsertReport(data, next), report: next };
}

export function markVatReportFiled(data = {}, reportId, meta = {}) {
  const current = getVatReportById(data, reportId);
  assertNoConcurrentChange(current, meta.loadedUpdatedAt);
  if (!current) throw new Error("Rapport TVA introuvable");
  if (current.status !== VAT_REPORT_STATUS.REVIEWED) {
    const error = new Error("Seul un rapport verifie peut etre marque depose");
    error.code = VAT_REPORT_ERRORS.INVALID_STATUS;
    throw error;
  }
  const timestamp = nowIso(meta.now || new Date());
  const next = {
    ...current,
    status: VAT_REPORT_STATUS.FILED,
    report_validation_status: REPORT_VALIDATION_STATUS.FILED,
    filed_at: timestamp,
    updatedAt: timestamp,
    updated_by: meta.currentUser?.email || current.updated_by || "",
  };
  return { data: upsertReport(data, next), report: next };
}

export function createAmendedVatReport(data = {}, reportId, currentCalculation, meta = {}) {
  const current = getVatReportById(data, reportId);
  if (!current) throw new Error("Rapport TVA introuvable");
  if (current.status !== VAT_REPORT_STATUS.FILED) {
    const error = new Error("La declaration rectificative part d'un rapport depose");
    error.code = VAT_REPORT_ERRORS.INVALID_STATUS;
    throw error;
  }
  const amended = buildVatReportRecord({
    report: currentCalculation,
    ...meta,
    previousReport: current,
    parentReportId: current.id,
    status: VAT_REPORT_STATUS.AMENDED,
  });
  return { data: upsertReport(data, amended), report: amended };
}

function mapLinesById(lines = []) {
  return new Map((lines || []).map((line) => [String(line.id || `${line.type}:${line.document_number}`), line]));
}

function comparableLine(line = {}) {
  return JSON.stringify({
    amount_ht: Number(line.amount_ht || 0),
    vat_amount: Number(line.vat_amount || 0),
    total_ttc: Number(line.total_ttc || 0),
    category: line.category || "",
    ecdf_boxes: line.ecdf_boxes || [],
    included_or_excluded: line.included_or_excluded || "",
  });
}

export function compareVatReportToCurrent(currentReport = {}, savedReport = {}) {
  const currentSnapshot = buildVatSourceSnapshot(currentReport).snapshot;
  const savedSnapshot = savedReport.source_snapshot_json || { lines: [] };
  const currentLines = mapLinesById(currentSnapshot.lines);
  const savedLines = mapLinesById(savedSnapshot.lines);
  const addedLines = [];
  const removedLines = [];
  const modifiedLines = [];

  for (const [id, line] of currentLines.entries()) {
    if (!savedLines.has(id)) {
      addedLines.push(line);
    } else if (comparableLine(line) !== comparableLine(savedLines.get(id))) {
      modifiedLines.push({ id, current: line, saved: savedLines.get(id) });
    }
  }

  for (const [id, line] of savedLines.entries()) {
    if (!currentLines.has(id)) removedLines.push(line);
  }

  const amountDifferences = [];
  const currentTotals = currentReport.totals || {};
  const savedTotals = savedReport.totals_json || {};
  for (const key of new Set([...Object.keys(currentTotals), ...Object.keys(savedTotals)])) {
    if (Number(currentTotals[key] || 0) !== Number(savedTotals[key] || 0)) {
      amountDifferences.push({ key, current: currentTotals[key] || 0, saved: savedTotals[key] || 0 });
    }
  }

  return {
    hasDifferences: Boolean(addedLines.length || removedLines.length || modifiedLines.length || amountDifferences.length),
    amountDifferences,
    addedLines,
    removedLines,
    modifiedLines,
  };
}
