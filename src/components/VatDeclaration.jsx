import { useMemo, useState } from "react";
import {
  ACCOUNTING_BASIS,
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  REPORT_VALIDATION_STATUS,
  SALE_TAX_CATEGORY,
  VAT_ORIGIN,
  calculateVatDeclaration,
} from "../utils/vatDeclaration";
import VatSummaryCards from "./vat/VatSummaryCards";
import VatEcdfTable from "./vat/VatEcdfTable";
import VatControlsPanel from "./vat/VatControlsPanel";
import VatSourceLinesTable from "./vat/VatSourceLinesTable";
import VatClassificationAssistant from "./vat/VatClassificationAssistant";
import { anomalyCounts, centsMoney, groupAnomaliesByType } from "./vat/vatUiUtils";
import { exportVatEcdfBoxesCsv, exportVatSourceLinesCsv } from "../utils/vatReportCsv";
import { downloadVatReportPdf } from "../utils/vatReportPdf";
import {
  VAT_EXPORT_SOURCE,
  buildVatExportContext,
  getVatReportBlockingErrorCount,
} from "../utils/vatReportExportModel";
import {
  VAT_REPORT_STATUS,
  compareVatReportToCurrent,
  createAmendedVatReport,
  createVatReport,
  getVatReports,
  markVatReportFiled,
  markVatReportReviewed,
  updateVatReport,
} from "../services/vatReportService";

const TABS = [
  ["summary", "Résumé"],
  ["sales", "Ventes"],
  ["lu", "Achats Luxembourg"],
  ["euGoods", "Acquisitions UE biens"],
  ["euServices", "Services UE"],
  ["assets", "Immobilisations"],
  ["general", "Frais généraux"],
  ["foreignVat", "TVA étrangère"],
  ["ecdf", "Cases eCDF"],
  ["controls", "Contrôles"],
  ["lines", "Lignes sources"],
];

const REPORT_STATUS_LABELS = {
  [VAT_REPORT_STATUS.DRAFT]: "Brouillon",
  [VAT_REPORT_STATUS.REVIEWED]: "Vérifié",
  [VAT_REPORT_STATUS.FILED]: "Déposé eCDF",
  [VAT_REPORT_STATUS.AMENDED]: "Rectificatif",
};

const emptyFilters = {
  text: "",
  type: "",
  country: "",
  origin: "",
  category: "",
  rate: "",
  reviewStatus: "",
  anomaly: "",
  ecdfBox: "",
};

function previousYearFromData(data = {}) {
  const years = [...(data.invoices || []), ...(data.expenses || [])]
    .map((item) => new Date(item.date || item.purchaseDate || item.createdAt || "").getFullYear())
    .filter((year) => Number.isFinite(year));
  if (years.length) return Math.max(...years);
  return new Date().getFullYear() - 1;
}

function periodForYear(year) {
  return {
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
  };
}

function groupSum(lines, predicate, amountKey = "htCents") {
  const groupLines = lines.filter(predicate);
  return {
    count: groupLines.length,
    htCents: groupLines.reduce((sum, line) => sum + (line.htCents || 0), 0),
    vatCents: groupLines.reduce((sum, line) => sum + (line.vatCents || line.reverseChargeVatCents || 0), 0),
    deductibleCents: groupLines.reduce((sum, line) => sum + (line.deductibleVatCents || 0), 0),
    amountCents: groupLines.reduce((sum, line) => sum + (line[amountKey] || 0), 0),
    lines: groupLines,
  };
}

function GroupTable({ title, rows, onShowLines }) {
  return (
    <div className="table card vat-group-table">
      <h3>{title}</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Groupe</th>
              <th>Lignes</th>
              <th>Base HT</th>
              <th>TVA</th>
              <th>TVA déductible</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td>{centsMoney(row.htCents)}</td>
                <td>{centsMoney(row.vatCents)}</td>
                <td>{centsMoney(row.deductibleCents)}</td>
                <td>
                  <button type="button" onClick={() => onShowLines(row.filter)}>
                    Voir les lignes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({ status }) {
  const label =
    status === REPORT_VALIDATION_STATUS.READY_FOR_REVIEW
      ? "Prêt pour vérification"
      : "Incomplet";
  return <span className={`badge ${status}`}>{label}</span>;
}

function ReportDiffSummary({ diff }) {
  if (!diff) return null;
  if (!diff.hasDifferences) {
    return <p className="muted">Aucune différence détectée entre le calcul actuel et le rapport enregistré.</p>;
  }
  return (
    <div className="vat-diff-summary">
      <strong>Différences détectées</strong>
      <span>Montants: {diff.amountDifferences.length}</span>
      <span>Lignes ajoutées: {diff.addedLines.length}</span>
      <span>Lignes supprimées: {diff.removedLines.length}</span>
      <span>Lignes modifiées: {diff.modifiedLines.length}</span>
    </div>
  );
}

function SavedReportPanel({ report, diff }) {
  if (!report) return null;
  return (
    <div className="card vat-saved-report" data-testid="vat-saved-report">
      <h3>Rapport enregistré</h3>
      <div className="stats-grid">
        <div><span>Statut</span><strong>{REPORT_STATUS_LABELS[report.status] || report.status}</strong></div>
        <div><span>Version</span><strong>v{report.report_version || 1}</strong></div>
        <div><span>Sauvegarde</span><strong>{report.updatedAt || report.generated_at || "-"}</strong></div>
        <div><span>Moteur</span><strong>{report.calculation_version || "-"}</strong></div>
        <div><span>Formulaire</span><strong>{report.ecdf_form_version || "-"}</strong></div>
        <div><span>Lignes snapshot</span><strong>{report.source_line_count || report.source_snapshot_json?.line_count || 0}</strong></div>
      </div>
      {report.snapshot_size_warning ? <p className="warning">{report.snapshot_size_warning}</p> : null}
      <ReportDiffSummary diff={diff} />
    </div>
  );
}

export default function VatDeclaration({
  data = {},
  setData = null,
  currentRole = "",
  currentUser = null,
  logActivity = null,
}) {
  const initialYear = previousYearFromData(data);
  const initialPeriod = periodForYear(initialYear);
  const [taxYear, setTaxYear] = useState(initialYear);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [datesTouched, setDatesTouched] = useState(false);
  const [accountingBasis, setAccountingBasis] = useState(ACCOUNTING_BASIS.INVOICE);
  const [activeTab, setActiveTab] = useState("summary");
  const [filters, setFilters] = useState(emptyFilters);
  const [showOnlyFixes, setShowOnlyFixes] = useState(false);
  const [manualRecalcKey, setManualRecalcKey] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [loadedReportUpdatedAt, setLoadedReportUpdatedAt] = useState("");
  const [reportViewMode, setReportViewMode] = useState("current");
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exportError, setExportError] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);

  const cashModeBlocking =
    accountingBasis === ACCOUNTING_BASIS.CASH &&
    (!(data.payments || []).length || !(data.invoices || []).length);

  const report = useMemo(() => {
    const built = calculateVatDeclaration({
      taxYear,
      periodStart,
      periodEnd,
      _recalcKey: manualRecalcKey,
      accounting_basis: accountingBasis,
      data: {
        invoices: cashModeBlocking ? [] : (data.invoices || []),
        expenses: data.expenses || [],
        suppliers: data.suppliers || [],
        payments: data.payments || [],
        clients: data.clients || [],
      },
    });

    if (!cashModeBlocking) return built;
    const cashError = {
      level: "error",
      code: "CASH_BASIS_PAYMENTS_INCOMPLETE",
      message: "Le mode recettes nécessite des paiements correctement enregistrés",
      sourceId: "report",
    };
    return {
      ...built,
      anomalies: [cashError, ...(built.anomalies || [])],
      report_validation_status: REPORT_VALIDATION_STATUS.INCOMPLETE,
      is_final_balance_reliable: false,
    };
  }, [taxYear, periodStart, periodEnd, accountingBasis, data, cashModeBlocking, manualRecalcKey]);

  const counts = anomalyCounts(report.anomalies || []);
  const anomalyGroups = useMemo(() => groupAnomaliesByType(report.anomalies || []), [report.anomalies]);
  const topAnomalyGroups = anomalyGroups.slice(0, 3);
  const status =
    counts.errors > 0 ? REPORT_VALIDATION_STATUS.INCOMPLETE : report.report_validation_status;
  const allLines = useMemo(() => report.lines || [], [report.lines]);
  const hasPeriodData = allLines.length > 0 || (report.excluded || []).length > 0;
  const savedReports = useMemo(() => getVatReports(data, { taxYear }), [data, taxYear]);
  const selectedReport = useMemo(
    () => savedReports.find((entry) => String(entry.id) === String(selectedReportId)) || null,
    [savedReports, selectedReportId]
  );
  const selectedReportDiff = useMemo(
    () => (selectedReport ? compareVatReportToCurrent(report, selectedReport) : null),
    [report, selectedReport]
  );
  const canManageReports = currentRole === "Admin" || currentRole === "Comptable";
  const isFiledReport = selectedReport?.status === VAT_REPORT_STATUS.FILED;
  const currentExportReport = useMemo(
    () => buildVatExportContext({ report, mode: VAT_EXPORT_SOURCE.CURRENT }),
    [report]
  );
  const savedExportReport = useMemo(() => {
    if (!selectedReport) return null;
    return buildVatExportContext({
      savedReport: selectedReport,
      mode: VAT_EXPORT_SOURCE.SAVED,
    });
  }, [selectedReport]);
  const activeExportReport =
    reportViewMode === "saved" && savedExportReport ? savedExportReport : currentExportReport;
  const activeExportSourceLabel =
    reportViewMode === "saved" && savedExportReport ? "rapport enregistré" : "calcul actuel";
  const exportHasData =
    (activeExportReport.lines || []).length > 0 || (activeExportReport.excluded || []).length > 0;

  const filteredLines = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    return allLines.filter((line) => {
      const category = line.sale_tax_category || line.category || "";
      if (filters.type && line.type !== filters.type) return false;
      if (filters.country && line.country !== filters.country) return false;
      if (filters.origin && line.vatOrigin !== filters.origin) return false;
      if (filters.category && category !== filters.category) return false;
      if (filters.rate && String(line.rate ?? "") !== filters.rate) return false;
      if (filters.ecdfBox && !(line.ecdfBoxes || []).includes(filters.ecdfBox)) return false;
      if (showOnlyFixes) {
        const toReview =
          category === SALE_TAX_CATEGORY.TO_REVIEW ||
          line.officialExcluded ||
          (line.anomalies || []).some((entry) => entry.level === "error");
        if (!toReview) return false;
      }
      if (!text) return true;
      return [
        line.date,
        line.type,
        line.number,
        line.partner,
        line.country,
        line.description,
        category,
        line.vatOrigin,
        line.euTransactionType,
        (line.ecdfBoxes || []).join(" "),
        (line.anomalies || []).map((entry) => entry.code).join(" "),
      ].join(" ").toLowerCase().includes(text);
    });
  }, [allLines, filters, showOnlyFixes]);

  function updateTaxYear(nextYear) {
    const year = Number(nextYear);
    setTaxYear(year);
    if (!datesTouched) {
      const nextPeriod = periodForYear(year);
      setPeriodStart(nextPeriod.periodStart);
      setPeriodEnd(nextPeriod.periodEnd);
    }
  }

  function applyReportOutcome(outcome, action, previousStatus = "") {
    setSelectedReportId(outcome.report.id);
    setLoadedReportUpdatedAt(outcome.report.updatedAt || "");
    setReportViewMode("saved");
    setReportError("");
    setReportMessage("Rapport TVA enregistré.");
    logActivity?.({
      action,
      target: "Declaration TVA",
      details: `id=${outcome.report.id}; année=${outcome.report.tax_year}; version=${outcome.report.report_version}; statut=${previousStatus || "-"} -> ${outcome.report.status}`,
    });
    return outcome.data;
  }

  function withReportUpdate(callback) {
    if (!setData || !canManageReports) return;
    try {
      const nextOutcome = callback(data);
      setData(nextOutcome.data);
      applyReportOutcome(
        nextOutcome,
        callback.action || "Rapport TVA",
        callback.previousStatus || selectedReport?.status || ""
      );
    } catch (error) {
      setReportError(error.message || "Action impossible sur le rapport TVA.");
      setReportMessage("");
    }
  }

  function saveDraft() {
    const action = selectedReport ? updateVatReport : createVatReport;
    const previousStatus = selectedReport?.status || "";
    withReportUpdate(Object.assign(
      (current) => action(
        current,
        ...(selectedReport
          ? [selectedReport.id, report, { taxYear, periodStart, periodEnd, accountingBasis, currentUser, loadedUpdatedAt: loadedReportUpdatedAt }]
          : [report, { taxYear, periodStart, periodEnd, accountingBasis, currentUser }])
      ),
      { action: selectedReport ? "Mise a jour rapport TVA" : "Creation rapport TVA", previousStatus }
    ));
  }

  function reviewReport() {
    if (!selectedReport || !window.confirm("Confirmer que ce rapport TVA a été vérifié ?")) return;
    withReportUpdate(Object.assign(
      (current) => markVatReportReviewed(current, selectedReport.id, { currentUser, loadedUpdatedAt: loadedReportUpdatedAt }),
      { action: "Rapport TVA verifie", previousStatus: selectedReport.status }
    ));
  }

  function fileReport() {
    if (
      !selectedReport ||
      !window.confirm("Confirmer que cette déclaration a été déposée manuellement dans eCDF")
    ) {
      return;
    }
    withReportUpdate(Object.assign(
      (current) => markVatReportFiled(current, selectedReport.id, { currentUser, loadedUpdatedAt: loadedReportUpdatedAt }),
      { action: "Rapport TVA déposé eCDF", previousStatus: selectedReport.status }
    ));
  }

  function amendReport() {
    if (!selectedReport || !window.confirm("Créer une déclaration rectificative depuis ce rapport déposé ?")) return;
    withReportUpdate(Object.assign(
      (current) => createAmendedVatReport(current, selectedReport.id, report, {
        taxYear,
        periodStart,
        periodEnd,
        accountingBasis,
        currentUser,
      }),
      { action: "Declaration TVA rectificative", previousStatus: selectedReport.status }
    ));
  }

  function selectSavedReport(reportId) {
    const nextReport = savedReports.find((entry) => String(entry.id) === String(reportId)) || null;
    setSelectedReportId(reportId);
    setLoadedReportUpdatedAt(nextReport?.updatedAt || "");
    setReportViewMode(nextReport ? "saved" : "current");
    setReportError("");
    setReportMessage("");
    if (nextReport) {
      setTaxYear(Number(nextReport.tax_year || nextReport.year || taxYear));
      setPeriodStart(nextReport.period_start || periodStart);
      setPeriodEnd(nextReport.period_end || periodEnd);
      setAccountingBasis(nextReport.accounting_basis || ACCOUNTING_BASIS.INVOICE);
      setDatesTouched(true);
    }
  }

  function showBoxSources(box) {
    setFilters((current) => ({ ...current, ecdfBox: String(box) }));
    setShowOnlyFixes(false);
    setActiveTab("lines");
  }

  function showLineFilter(filterPatch = {}) {
    setFilters((current) => ({ ...current, ...filterPatch }));
    setActiveTab("lines");
  }

  function saveClassifications(nextData) {
    setData?.(nextData);
    setManualRecalcKey((key) => key + 1);
    setReportMessage("Classifications TVA enregistrées. Déclaration recalculée.");
  }

  function confirmIncompleteExport(targetReport) {
    const errorCount = getVatReportBlockingErrorCount(targetReport);
    if (errorCount <= 0) return true;
    return window.confirm(
      `Ce rapport contient ${errorCount} erreurs bloquantes. Les exports seront marqués comme provisoires. Continuer ?`
    );
  }

  function handleExport(exporter, successLabel, errorLabel) {
    setExportMessage("");
    setExportError("");
    if (!exportHasData) {
      setExportError("Rapport vide : aucune donnée à exporter sur cette période.");
      return;
    }
    if (!confirmIncompleteExport(activeExportReport)) return;
    try {
      const filename = exporter(activeExportReport);
      setExportMessage(`${successLabel} généré depuis le ${activeExportSourceLabel} : ${filename}`);
    } catch {
      setExportError(errorLabel);
    }
  }

  function handlePdfExport() {
    handleExport(
      (targetReport) => downloadVatReportPdf({ report: targetReport, settings: data.settings || {} }),
      "PDF préparatoire",
      "Impossible de générer le PDF préparatoire."
    );
  }

  function handleEcdfCsvExport() {
    handleExport(
      exportVatEcdfBoxesCsv,
      "CSV des cases eCDF",
      "Impossible de générer le CSV des cases eCDF."
    );
  }

  function handleSourceCsvExport() {
    handleExport(
      exportVatSourceLinesCsv,
      "CSV des lignes sources",
      "Impossible de générer le CSV des lignes sources."
    );
  }

  const salesRows = [
    { label: "Produits fabriqués", ...groupSum(allLines, (line) => line.sale_tax_category === SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT), filter: { type: "sale", category: SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT } },
    { label: "Marchandises revendues", ...groupSum(allLines, (line) => line.sale_tax_category === SALE_TAX_CATEGORY.RESOLD_GOODS), filter: { type: "sale", category: SALE_TAX_CATEGORY.RESOLD_GOODS } },
    { label: "Prestations de services", ...groupSum(allLines, (line) => line.sale_tax_category === SALE_TAX_CATEGORY.SERVICE), filter: { type: "sale", category: SALE_TAX_CATEGORY.SERVICE } },
    { label: "Cessions immobilisations", ...groupSum(allLines, (line) => line.sale_tax_category === SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL), filter: { type: "sale", category: SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL } },
    { label: "Ventes à revoir", ...groupSum(allLines, (line) => line.sale_tax_category === SALE_TAX_CATEGORY.TO_REVIEW || line.officialExcluded), filter: { type: "sale" } },
  ];

  const luRows = [
    { label: "Marchandises", ...groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU && line.category === EXPENSE_TAX_CATEGORY.MERCHANDISE), filter: { type: "expense", origin: VAT_ORIGIN.LU, category: EXPENSE_TAX_CATEGORY.MERCHANDISE } },
    { label: "Matières premières", ...groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU && line.category === EXPENSE_TAX_CATEGORY.RAW_MATERIAL), filter: { type: "expense", origin: VAT_ORIGIN.LU, category: EXPENSE_TAX_CATEGORY.RAW_MATERIAL } },
    { label: "Immobilisations", ...groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU && line.category === EXPENSE_TAX_CATEGORY.INVESTMENT), filter: { type: "expense", origin: VAT_ORIGIN.LU, category: EXPENSE_TAX_CATEGORY.INVESTMENT } },
    { label: "Frais généraux", ...groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU && [EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE, EXPENSE_TAX_CATEGORY.SERVICE, EXPENSE_TAX_CATEGORY.VEHICLE, EXPENSE_TAX_CATEGORY.OTHER].includes(line.category)), filter: { type: "expense", origin: VAT_ORIGIN.LU } },
  ];

  const euGoods = groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.EU && line.euTransactionType === EU_TRANSACTION_TYPE.GOODS);
  const euServices = groupSum(allLines, (line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.EU && line.euTransactionType === EU_TRANSACTION_TYPE.SERVICE);
  const assets = allLines.filter((line) => line.category === EXPENSE_TAX_CATEGORY.INVESTMENT || line.is_fixed_asset);
  const foreignVat = allLines.filter((line) => Number(line.foreignVatCents || 0) > 0);
  const general = allLines.filter((line) => line.type === "expense" && [EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE, EXPENSE_TAX_CATEGORY.SERVICE, EXPENSE_TAX_CATEGORY.VEHICLE, EXPENSE_TAX_CATEGORY.OTHER].includes(line.category));

  return (
    <section className="vat-declaration-page">
      <div className="page-header">
        <div>
          <h2>Déclaration TVA</h2>
          <p>Préparation de la déclaration annuelle TVA luxembourgeoise eCDF</p>
          <p className="muted">Document préparatoire - aucune transmission automatique à l'AED</p>
        </div>
        <Badge status={status} />
      </div>

      <div className="card vat-period-card">
        <div className="form-grid">
          <label>
            <span>Année fiscale</span>
            <input
              type="number"
              value={taxYear}
              onChange={(event) => updateTaxYear(event.target.value)}
              data-testid="vat-tax-year"
            />
          </label>
          <label>
            <span>Date de début</span>
            <input
              type="date"
              value={periodStart}
              onChange={(event) => {
                setDatesTouched(true);
                setPeriodStart(event.target.value);
              }}
            />
          </label>
          <label>
            <span>Date de fin</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(event) => {
                setDatesTouched(true);
                setPeriodEnd(event.target.value);
              }}
            />
          </label>
          <label>
            <span>Régime</span>
            <select
              value={accountingBasis}
              onChange={(event) => setAccountingBasis(event.target.value)}
              data-testid="vat-accounting-basis"
            >
              <option value={ACCOUNTING_BASIS.INVOICE}>Ventes / factures</option>
              <option value={ACCOUNTING_BASIS.CASH}>Recettes / encaissements</option>
            </select>
          </label>
          <button type="button" className="primary" onClick={() => setManualRecalcKey((key) => key + 1)}>
            Recalculer
          </button>
        </div>
      </div>

      <div className="card vat-report-card">
        <div className="section-title">
          <div>
            <h3>Rapports TVA sauvegardés</h3>
            <p className="muted">Sauvegarde interne de préparation. Aucune transmission automatique à eCDF.</p>
          </div>
          {selectedReport ? (
            <span className="badge">
              {REPORT_STATUS_LABELS[selectedReport.status] || selectedReport.status} - v{selectedReport.report_version || 1}
            </span>
          ) : null}
        </div>

        <div className="form-grid">
          <label>
            <span>Historique année {taxYear}</span>
            <select
              value={selectedReportId}
              onChange={(event) => selectSavedReport(event.target.value)}
              data-testid="vat-report-select"
            >
              <option value="">Aucun rapport chargé</option>
              {savedReports.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {REPORT_STATUS_LABELS[entry.status] || entry.status} - v{entry.report_version || 1} - {entry.updatedAt || entry.generated_at || ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Mode affichage</span>
            <select value={reportViewMode} onChange={(event) => setReportViewMode(event.target.value)}>
              <option value="current">Calcul actuel</option>
              <option value="saved" disabled={!selectedReport}>Rapport enregistré</option>
            </select>
          </label>

          <button
            type="button"
            className="primary"
            onClick={saveDraft}
            disabled={!canManageReports || isFiledReport}
          >
            {selectedReport ? "Mettre à jour le rapport" : "Enregistrer le brouillon"}
          </button>
          <button
            type="button"
            onClick={reviewReport}
            disabled={!canManageReports || !selectedReport || isFiledReport || counts.errors > 0}
          >
            Marquer comme vérifié
          </button>
          <button
            type="button"
            onClick={fileReport}
            disabled={!canManageReports || selectedReport?.status !== VAT_REPORT_STATUS.REVIEWED}
          >
            Marquer comme déposé dans eCDF
          </button>
          {isFiledReport ? (
            <button type="button" onClick={amendReport} disabled={!canManageReports}>
              Créer une déclaration rectificative
            </button>
          ) : null}
        </div>

        {!canManageReports ? (
          <p className="warning">Votre rôle permet la consultation, pas la modification des rapports TVA.</p>
        ) : null}
        {isFiledReport ? (
          <p className="muted">Ce rapport déposé est en lecture seule. Toute modification crée une rectificative.</p>
        ) : null}
        {counts.errors > 0 && !isFiledReport ? (
          <p className="warning">Ce rapport contient {counts.errors} erreurs bloquantes et sera enregistré comme brouillon incomplet.</p>
        ) : null}
        {selectedReport?.source_snapshot_size_bytes ? (
          <p className="muted">
            Dernière sauvegarde: {selectedReport.updatedAt || "-"} - Snapshot {selectedReport.source_snapshot_size_bytes} octets.
          </p>
        ) : null}
        {reportMessage ? <p className="success">{reportMessage}</p> : null}
        {reportError ? <p className="error">{reportError}</p> : null}
      </div>

      <div className="card vat-assistant-entry">
        <div>
          <h3>Assistant de classification TVA</h3>
          <p className="muted">Traite en masse les anciennes ventes, dépenses, fournisseurs incomplets et taux d'autoliquidation à confirmer.</p>
        </div>
        <button type="button" className="primary" onClick={() => setAssistantOpen(true)}>
          Assistant de classification TVA
        </button>
      </div>

      <div className="card vat-export-card">
        <div className="section-title">
          <div>
            <h3>Exports préparatoires TVA</h3>
            <p className="muted">
              Source exportée : {activeExportSourceLabel}. Ces fichiers restent préparatoires et ne transmettent rien à eCDF.
            </p>
            <p className="muted">
              Formulaire eCDF : version {activeExportReport.ecdf_form_version || activeExportReport.form_version || "-"} ·
              Moteur : version {activeExportReport.calculation_version || "-"}
            </p>
          </div>
          <span className="badge">Année fiscale {activeExportReport.tax_year || activeExportReport.year || activeExportReport.period?.taxYear || taxYear}</span>
        </div>
        <div className="form-grid">
          <button type="button" className="primary" onClick={handlePdfExport} disabled={!exportHasData}>
            Télécharger le PDF préparatoire
          </button>
          <button type="button" onClick={handleEcdfCsvExport} disabled={!exportHasData}>
            Exporter les cases eCDF en CSV
          </button>
          <button type="button" onClick={handleSourceCsvExport} disabled={!exportHasData}>
            Exporter les lignes sources en CSV
          </button>
        </div>
        {reportViewMode === "saved" && !selectedReport ? (
          <p className="warning">Aucun rapport enregistré sélectionné pour l'export snapshot.</p>
        ) : null}
        {getVatReportBlockingErrorCount(activeExportReport) > 0 ? (
          <p className="warning">
            Rapport incomplet : les exports seront marqués comme provisoires après confirmation.
          </p>
        ) : null}
        {exportMessage ? <p className="success">{exportMessage}</p> : null}
        {exportError ? <p className="error">{exportError}</p> : null}
      </div>

      {reportViewMode === "saved" && selectedReport ? (
        <SavedReportPanel report={selectedReport} diff={selectedReportDiff} />
      ) : null}

      <div className="card vat-status-card">
        <div className="vat-status-header">
          <div>
            <span className="muted">Statut global</span>
            <strong>{status === REPORT_VALIDATION_STATUS.READY_FOR_REVIEW ? "Prêt pour vérification" : "Incomplet"}</strong>
          </div>
          <button type="button" onClick={() => setActiveTab("controls")}>
            Voir tous les contrôles
          </button>
        </div>
        <div className="vat-status-counts" aria-label="Compteurs contrôles TVA">
          <span className="badge danger">{counts.errors} erreurs bloquantes</span>
          <span className="badge warning">{counts.warnings} avertissements</span>
          <span className="badge info">{counts.infos} informations</span>
        </div>
        {topAnomalyGroups.length ? (
          <div className="vat-status-main-issues">
            <strong>Principaux problèmes :</strong>
            <ul>
              {topAnomalyGroups.map((entry) => (
                <li key={`${entry.level}-${entry.code}`}>{entry.label}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted">Aucun problème bloquant détecté.</p>
        )}
      </div>

      {!hasPeriodData ? (
        <div className="card empty-state" data-testid="vat-empty-state">
          <strong>Aucune donnée sur cette période.</strong>
          <p className="muted">Ajoute des factures ou dépenses sur la période sélectionnée pour préparer la déclaration.</p>
        </div>
      ) : null}

      <div className="tabs vat-tabs" role="tablist" aria-label="Sections déclaration TVA">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <>
          <VatSummaryCards report={report} />
          <GroupTable title="Ventilation rapide des ventes" rows={salesRows} onShowLines={showLineFilter} />
        </>
      )}
      {activeTab === "sales" && <GroupTable title="Ventes" rows={salesRows} onShowLines={showLineFilter} />}
      {activeTab === "lu" && <GroupTable title="Achats Luxembourg" rows={luRows} onShowLines={showLineFilter} />}
      {activeTab === "euGoods" && (
        <GroupTable
          title={`Acquisitions intracommunautaires de biens - impact net ${centsMoney((euGoods.vatCents || 0) - (euGoods.deductibleCents || 0))}`}
          rows={[{ label: "Biens UE", ...euGoods, filter: { type: "expense", origin: VAT_ORIGIN.EU } }]}
          onShowLines={showLineFilter}
        />
      )}
      {activeTab === "euServices" && (
        <GroupTable
          title={`Services intracommunautaires - impact net ${centsMoney((euServices.vatCents || 0) - (euServices.deductibleCents || 0))}`}
          rows={[{ label: "Services UE", ...euServices, filter: { type: "expense", origin: VAT_ORIGIN.EU } }]}
          onShowLines={showLineFilter}
        />
      )}
      {activeTab === "assets" && (
        <VatSourceLinesTable
          lines={assets}
          filters={filters}
          setFilters={setFilters}
          showOnlyFixes={showOnlyFixes}
          setShowOnlyFixes={setShowOnlyFixes}
        />
      )}
      {activeTab === "general" && (
        <VatSourceLinesTable
          lines={general}
          filters={filters}
          setFilters={setFilters}
          showOnlyFixes={showOnlyFixes}
          setShowOnlyFixes={setShowOnlyFixes}
        />
      )}
      {activeTab === "foreignVat" && (
        <>
          <div className="card">
            Cette TVA n'est pas incluse dans la TVA déductible luxembourgeoise.
          </div>
          <VatSourceLinesTable
            lines={foreignVat}
            filters={filters}
            setFilters={setFilters}
            showOnlyFixes={showOnlyFixes}
            setShowOnlyFixes={setShowOnlyFixes}
          />
        </>
      )}
      {activeTab === "ecdf" && <VatEcdfTable report={report} onShowSources={showBoxSources} />}
      {activeTab === "controls" && (
        <VatControlsPanel
          anomalies={report.anomalies || []}
          onOpenAssistant={() => setAssistantOpen(true)}
          onFilterFixes={() => {
            setShowOnlyFixes(true);
            setActiveTab("lines");
          }}
        />
      )}
      {activeTab === "lines" && (
        <VatSourceLinesTable
          lines={filteredLines}
          filters={filters}
          setFilters={setFilters}
          showOnlyFixes={showOnlyFixes}
          setShowOnlyFixes={setShowOnlyFixes}
        />
      )}
      {assistantOpen ? (
        <VatClassificationAssistant
          data={data}
          taxYear={taxYear}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onClose={() => setAssistantOpen(false)}
          onSave={saveClassifications}
          logActivity={logActivity}
        />
      ) : null}
    </section>
  );
}
