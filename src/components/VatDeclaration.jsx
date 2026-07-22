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
import {
  applyVatClassificationSelections,
  buildVatClassificationAssistantState,
} from "../utils/vatClassificationAssistant";
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
import { PAYMENT_METHODS, upsertHistoricalInvoicePayment } from "../utils/payments";

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
  const [assistantInitialTab, setAssistantInitialTab] = useState("suppliers");

  const report = useMemo(() => {
    return calculateVatDeclaration({
      taxYear,
      periodStart,
      periodEnd,
      _recalcKey: manualRecalcKey,
      accounting_basis: accountingBasis,
      data: {
        invoices: data.invoices || [],
        expenses: data.expenses || [],
        suppliers: data.suppliers || [],
        payments: data.payments || [],
        clients: data.clients || [],
      },
    });

  }, [taxYear, periodStart, periodEnd, accountingBasis, data, manualRecalcKey]);

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

  function openAssistant(tab = "suppliers") {
    setAssistantInitialTab(tab);
    setAssistantOpen(true);
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

  function handleQuickFixClassifications() {
    if (!setData || !canManageReports || isFiledReport) return;
    const assistantState = buildVatClassificationAssistantState({
      data,
      taxYear,
      periodStart,
      periodEnd,
    });
    const selections = {
      suppliers: assistantState.suppliers.filter((item) =>
        item.proposed_country_code && item.proposed_vat_origin
      ),
      sales: assistantState.sales.filter((item) =>
        item.selected_category && item.selected_category !== SALE_TAX_CATEGORY.TO_REVIEW
      ),
      expenses: assistantState.expenses.filter((item) => {
        const suggestion = item.suggestions || {};
        if (!suggestion.vat_origin || !suggestion.expense_tax_category || !suggestion.vat_deductibility) {
          return false;
        }
        if (
          suggestion.vat_origin === VAT_ORIGIN.EU &&
          (!suggestion.eu_transaction_type || suggestion.eu_transaction_type === EU_TRANSACTION_TYPE.NONE)
        ) {
          return false;
        }
        return true;
      }),
    };
    const total =
      selections.suppliers.length + selections.sales.length + selections.expenses.length;
    if (total === 0) {
      setReportError("Aucune correction automatique fiable disponible. Ouvre l'assistant pour traiter les lignes restantes.");
      setReportMessage("");
      setShowOnlyFixes(true);
      setActiveTab("controls");
      return;
    }
    if (
      !window.confirm(
        `Appliquer ${total} correction(s) TVA exploitables ? Les lignes ambigues resteront a verifier manuellement.`
      )
    ) {
      return;
    }
    const nextData = applyVatClassificationSelections(data, selections);
    setData(nextData);
    setManualRecalcKey((value) => value + 1);
    setReportError("");
    setReportMessage(
      `Corrections appliquees : ${selections.sales.length} ventes, ${selections.expenses.length} depenses, ${selections.suppliers.length} fournisseurs.`
    );
    setShowOnlyFixes(true);
    setActiveTab("controls");
    logActivity?.({
      action: "Correction TVA automatique",
      target: "Declaration TVA",
      details: `ventes=${selections.sales.length}; depenses=${selections.expenses.length}; fournisseurs=${selections.suppliers.length}`,
    });
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

  function createHistoricalPayment(entry = {}) {
    if (!setData || !canManageReports || isFiledReport) return;
    const sourceId = String(entry.sourceId || "").replace(/^sale:/, "");
    const invoice = (data.invoices || []).find(
      (item) => String(item.id) === sourceId || String(item.number) === sourceId
    );
    if (!invoice) {
      setReportError("Facture introuvable pour créer le paiement historique.");
      setReportMessage("");
      return;
    }

    const cashBasis = entry.cashBasis || {};
    const amountDefault =
      Number(cashBasis.invoicePaidCents || 0) > 0
        ? Number(cashBasis.invoicePaidCents || 0) / 100
        : Number(invoice.totalTTC || 0);
    const rawAmount = window.prompt(
      `Montant encaissé pour ${invoice.number || invoice.id}`,
      String(amountDefault.toFixed(2)).replace(".", ",")
    );
    if (rawAmount === null) return;
    const amount = Number(String(rawAmount).replace(",", ".").replace(/[^\d.]/g, ""));
    if (!amount || amount <= 0) {
      setReportError("Montant encaissé invalide.");
      setReportMessage("");
      return;
    }

    const date = window.prompt("Date d'encaissement obligatoire (AAAA-MM-JJ)", invoice.paymentDate || invoice.paidDate || invoice.datePaid || "");
    if (date === null) return;
    if (!String(date).trim()) {
      setReportError("Date d'encaissement obligatoire pour le régime recettes.");
      setReportMessage("");
      return;
    }

    const defaultMethod = invoice.paymentMethod || invoice.paymentMode || "Virement";
    const methodInput = window.prompt(
      `Mode de paiement (${PAYMENT_METHODS.join(", ")})`,
      defaultMethod
    );
    if (methodInput === null) return;
    const method = PAYMENT_METHODS.includes(methodInput) ? methodInput : "Autre";

    try {
      const nextData = upsertHistoricalInvoicePayment(data, invoice, {
        amount,
        method,
        date: String(date).trim(),
        notes: "Paiement historique créé depuis la déclaration TVA",
      });
      setData(nextData);
      setManualRecalcKey((key) => key + 1);
      setReportError("");
      setReportMessage(`Paiement historique créé pour ${invoice.number || invoice.id}. Déclaration recalculée.`);
      logActivity?.({
        action: "Paiement historique TVA",
        target: invoice.number || invoice.id,
        details: `${amount.toFixed(2)} EUR; date=${String(date).trim()}; mode=${method}`,
      });
    } catch (error) {
      setReportMessage("");
      setReportError(error.message || "Impossible de créer le paiement historique.");
    }
  }

  async function updateSaleTaxCategories(sourceIds = [], category = "") {
    const allowedCategories = [
      SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT,
      SALE_TAX_CATEGORY.RESOLD_GOODS,
      SALE_TAX_CATEGORY.SERVICE,
      SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL,
    ];
    if (!setData || !allowedCategories.includes(category) || sourceIds.length === 0) return;

    const targetIds = new Set(sourceIds.map(String));
    try {
      await setData((current) => ({
        ...current,
        invoices: (current.invoices || []).map((invoice) => {
          const invoiceIds = [invoice.id, invoice.number].filter(Boolean).map(String);
          if (!invoiceIds.some((id) => targetIds.has(id))) return invoice;
          return {
            ...invoice,
            sale_tax_category: category,
            sale_tax_review_status: "reviewed",
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
      setManualRecalcKey((key) => key + 1);
      setReportError("");
      setReportMessage("Catégorie fiscale de vente enregistrée. Déclaration recalculée.");
    } catch (error) {
      setReportMessage("");
      setReportError(error.message || "Impossible d'enregistrer la catégorie fiscale de vente.");
      throw error;
    }
  }

  async function saveClassifications(nextData) {
    try {
      await setData?.(nextData);
      setManualRecalcKey((key) => key + 1);
      setReportError("");
      setReportMessage("Classifications TVA enregistrées. Déclaration recalculée.");
    } catch (error) {
      setReportMessage("");
      setReportError(error.message || "Impossible d'enregistrer les classifications TVA.");
      throw error;
    }
  }

  async function saveHistoricalPayments(nextData, result = {}) {
    try {
      await setData?.(nextData);
      setManualRecalcKey((key) => key + 1);
      setReportError("");
      setReportMessage(
        `${result.created || 0} paiement(s) historique(s) créé(s), ${result.skipped || 0} ignoré(s), ${(result.errors || []).length} erreur(s).`
      );
    } catch (error) {
      setReportMessage("");
      setReportError(error.message || "Impossible d'enregistrer les paiements historiques.");
      throw error;
    }
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
        <div className="vat-assistant-actions">
          <button type="button" onClick={handleQuickFixClassifications} disabled={!canManageReports || isFiledReport}>
            Corriger les erreurs exploitables
          </button>
          <button type="button" className="primary" onClick={() => openAssistant()}>
            Assistant de classification TVA
          </button>
        </div>
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
          onOpenAssistant={openAssistant}
          onQuickFix={handleQuickFixClassifications}
          onCreateHistoricalPayment={createHistoricalPayment}
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
          onUpdateSaleCategories={canManageReports && !isFiledReport ? updateSaleTaxCategories : null}
        />
      )}
      {assistantOpen ? (
        <VatClassificationAssistant
          data={data}
          report={report}
          taxYear={taxYear}
          periodStart={periodStart}
          periodEnd={periodEnd}
          initialTab={assistantInitialTab}
          onClose={() => setAssistantOpen(false)}
          onSave={saveClassifications}
          onSavePayments={saveHistoricalPayments}
          logActivity={logActivity}
        />
      ) : null}
    </section>
  );
}
