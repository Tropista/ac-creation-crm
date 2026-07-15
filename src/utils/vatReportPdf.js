import { jsPDF } from "jspdf";
import { formatPdfMoney } from "./documentPdf";
import {
  VAT_EXPORT_SOURCE,
  getVatReportBlockingErrorCount,
  getVatReportStatusLabel,
  getVatReportTaxYear,
  sanitizeVatFilenamePart,
} from "./vatReportExportModel";
import {
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  SALE_TAX_CATEGORY,
  VAT_ORIGIN,
  centsToMoney,
} from "./vatDeclaration";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 12;
const FOOTER_HEIGHT = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 5;

const NOTICE =
  "Ce document ne constitue pas une déclaration officielle et n'a pas été transmis à l'Administration de l'enregistrement, des domaines et de la TVA.";

function moneyFromCents(cents) {
  return `${formatPdfMoney(centsToMoney(cents)).replace(/\./g, " ")} €`;
}

function safeText(value) {
  return String(value ?? "")
    .replace(/\u202f|\u00a0/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value);
  return date.toLocaleString("fr-LU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function reportPeriod(report = {}) {
  const start = report.period?.startDate || report.period_start || "";
  const end = report.period?.endDate || report.period_end || "";
  return [start, end].filter(Boolean).join(" au ");
}

function accountingBasisLabel(value) {
  return value === "cash" ? "Recettes / encaissements" : "Ventes / factures";
}

function companyName(settings = {}) {
  return settings.companyName || settings.legalName || settings.companyLegalName || "AC Creation";
}

function companyEntries(settings = {}, report = {}, generatedAt = new Date()) {
  return [
    ["Nom commercial", settings.companyName],
    ["Nom légal", settings.legalName || settings.companyLegalName],
    ["Adresse", settings.companyAddress || settings.address],
    ["TVA", settings.vatNumber || settings.companyVatNumber],
    ["Matricule", settings.matricule || settings.rcsNumber || settings.authorizationNumber],
    ["Année fiscale", getVatReportTaxYear(report)],
    ["Période", reportPeriod(report)],
    ["Régime", accountingBasisLabel(report.accounting_basis)],
    ["Généré le", formatDateTime(generatedAt)],
    ["Moteur de calcul", report.calculation_version],
    ["Formulaire eCDF", `version ${report.ecdf_form_version || report.form_version || ""}`],
    ["Statut", getVatReportStatusLabel(report)],
    ["Version sauvegardée", report.report_version ? `v${report.report_version}` : ""],
  ].filter(([, value]) => value !== "" && value != null);
}

function sourceLabel(report = {}) {
  if (report.exportSource === VAT_EXPORT_SOURCE.SAVED) {
    const date = report.saved_at || report.updatedAt || report.generated_at || "";
    const version = report.report_version ? `, version ${report.report_version}` : "";
    return `Source : rapport enregistré le ${date ? formatDateTime(date) : "-"}${version}`;
  }
  return "Source : calcul actuel";
}

function getBoxAmount(report = {}, box) {
  const entry = (report.ecdfBoxes || []).find((item) => String(item.box) === String(box));
  return entry?.amountCents || 0;
}

function summaryRows(report = {}) {
  const totals = report.totals || {};
  const luDeductible =
    getBoxAmount(report, "077") + getBoxAmount(report, "081") + getBoxAmount(report, "085");
  const rows = [
    ["Chiffre d'affaires HT", moneyFromCents(totals.salesHTCents)],
    ["TVA collectée", moneyFromCents(totals.outputVatCents)],
    ["Dépenses HT", moneyFromCents(totals.expensesHTCents)],
    ["TVA luxembourgeoise déductible", moneyFromCents(luDeductible)],
    ["Acquisitions intracommunautaires de biens", moneyFromCents(getBoxAmount(report, "711"))],
    ["Services intracommunautaires reçus", moneyFromCents(getBoxAmount(report, "741"))],
    ["TVA étrangère non incluse dans la déduction LU", moneyFromCents(totals.foreignVatNonDeductibleCents)],
    ["TVA en aval", moneyFromCents(totals.outputVatCents)],
    ["TVA en amont", moneyFromCents(totals.deductibleVatCents)],
  ];
  if (report.is_final_balance_reliable) {
    rows.push(["Solde TVA", moneyFromCents(totals.balanceCents)]);
  } else {
    rows.push(["Solde TVA", "Solde TVA non déterminé - classifications ou contrôles encore incomplets."]);
  }
  return rows;
}

function groupLines(lines, keyFn) {
  const map = new Map();
  for (const line of lines || []) {
    const key = keyFn(line) || "Autres";
    const current = map.get(key) || {
      label: key,
      count: 0,
      htCents: 0,
      vatCents: 0,
      deductibleVatCents: 0,
      foreignVatCents: 0,
    };
    current.count += 1;
    current.htCents += Number(line.htCents || 0);
    current.vatCents += Number(line.vatCents || line.reverseChargeVatCents || 0);
    current.deductibleVatCents += Number(line.deductibleVatCents || 0);
    current.foreignVatCents += Number(line.foreignVatCents || 0);
    map.set(key, current);
  }
  return Array.from(map.values());
}

function saleLabel(line = {}) {
  const category = line.sale_tax_category || line.category;
  return {
    [SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT]: "Produits fabriqués",
    [SALE_TAX_CATEGORY.RESOLD_GOODS]: "Marchandises revendues",
    [SALE_TAX_CATEGORY.SERVICE]: "Prestations de services",
    [SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL]: "Cessions d'immobilisations",
    [SALE_TAX_CATEGORY.TO_REVIEW]: "Ventes à vérifier",
  }[category] || "Ventes à vérifier";
}

function expenseLabel(line = {}) {
  return {
    [EXPENSE_TAX_CATEGORY.MERCHANDISE]: "Marchandises",
    [EXPENSE_TAX_CATEGORY.RAW_MATERIAL]: "Matières premières",
    [EXPENSE_TAX_CATEGORY.INVESTMENT]: "Immobilisations",
    [EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE]: "Frais généraux",
    [EXPENSE_TAX_CATEGORY.SERVICE]: "Services",
    [EXPENSE_TAX_CATEGORY.VEHICLE]: "Véhicules",
    [EXPENSE_TAX_CATEGORY.NON_DEDUCTIBLE]: "Non déductibles",
  }[line.category] || "Autres";
}

function anomaliesByLevel(report = {}) {
  const levels = { error: [], warning: [], info: [] };
  for (const anomaly of report.anomalies || []) {
    const level = anomaly.level || "info";
    (levels[level] || levels.info).push(anomaly);
  }
  return levels;
}

function groupAnomalies(anomalies = []) {
  const map = new Map();
  for (const anomaly of anomalies) {
    const key = anomaly.code || anomaly.message || "controle";
    const current = map.get(key) || { code: key, count: 0, items: [] };
    current.count += 1;
    current.items.push(anomaly);
    map.set(key, current);
  }
  return Array.from(map.values());
}

function sourceSummary(report = {}) {
  const lines = report.lines || [];
  const included = lines.filter((line) => !line.officialExcluded).length;
  const excluded = lines.filter((line) => line.officialExcluded).length + (report.excluded || []).length;
  const sales = lines.filter((line) => line.type === "sale").length;
  const expenses = lines.filter((line) => line.type === "expense").length;
  return [
    ["Nombre total de lignes", String(lines.length + (report.excluded || []).length)],
    ["Lignes incluses", String(included)],
    ["Lignes exclues", String(excluded)],
    ["Ventes", String(sales)],
    ["Dépenses", String(expenses)],
    ["Detail complet", "Voir l'export CSV des lignes sources."],
  ];
}

export function getVatReportPdfFileName({ report = {}, settings = {} } = {}) {
  const year = getVatReportTaxYear(report) || "sans-annee";
  return `preparation-tva-${year}-${sanitizeVatFilenamePart(companyName(settings))}.pdf`;
}

export function buildVatReportPdfModel({ report = {}, settings = {}, generatedAt = new Date() } = {}) {
  const lines = report.lines || [];
  const euGoods = lines.filter((line) => line.vatOrigin === VAT_ORIGIN.EU && line.euTransactionType === EU_TRANSACTION_TYPE.GOODS);
  const euServices = lines.filter((line) => line.vatOrigin === VAT_ORIGIN.EU && line.euTransactionType === EU_TRANSACTION_TYPE.SERVICE);
  const luExpenses = lines.filter((line) => line.type === "expense" && line.vatOrigin === VAT_ORIGIN.LU);
  const assets = lines.filter((line) => line.is_fixed_asset || line.category === EXPENSE_TAX_CATEGORY.INVESTMENT);
  const foreignVat = lines.filter((line) => Number(line.foreignVatCents || 0) > 0);
  const anomalies = anomaliesByLevel(report);
  return {
    title: `Préparation de la déclaration annuelle TVA Luxembourg - ${getVatReportTaxYear(report) || ""}`,
    subtitle: "Document préparatoire pour saisie dans eCDF",
    notice: NOTICE,
    source: sourceLabel(report),
    status: {
      label: getVatReportStatusLabel(report),
      incompleteMessage:
        getVatReportBlockingErrorCount(report) > 0
          ? "Les montants ci-dessous sont provisoires. Des erreurs bloquantes restent à corriger."
          : "",
      isFinalBalanceReliable: Boolean(report.is_final_balance_reliable),
    },
    identity: companyEntries(settings, report, generatedAt),
    summary: summaryRows(report),
    ecdfBoxes: report.ecdfBoxes || [],
    sections: {
      sales: groupLines(lines.filter((line) => line.type === "sale"), saleLabel),
      salesRates: groupLines(lines.filter((line) => line.type === "sale"), (line) => `${line.rate ?? "-"} %`),
      luExpenses: groupLines(luExpenses, expenseLabel),
      euGoods: groupLines(euGoods, expenseLabel),
      euServices: groupLines(euServices, expenseLabel),
      assets,
      foreignVat,
      anomalies,
      anomalyGroups: {
        errors: groupAnomalies(anomalies.error),
        warnings: groupAnomalies(anomalies.warning),
        infos: groupAnomalies(anomalies.info),
      },
      sourceSummary: sourceSummary(report),
    },
    footer: {
      taxYear: getVatReportTaxYear(report),
      vatNumber: settings.vatNumber || settings.companyVatNumber || "",
      label: "Document préparatoire TVA - non officiel",
    },
  };
}

function drawFooter(pdf, model) {
  const pageCount = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.line(MARGIN, PAGE_HEIGHT - FOOTER_HEIGHT, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - FOOTER_HEIGHT);
    const left = [`Année ${model.footer.taxYear || "-"}`, model.footer.vatNumber ? `TVA ${model.footer.vatNumber}` : ""]
      .filter(Boolean)
      .join(" - ");
    pdf.text(left, MARGIN, PAGE_HEIGHT - 8);
    pdf.text(model.footer.label, PAGE_WIDTH / 2, PAGE_HEIGHT - 8, { align: "center" });
    pdf.text(`Page ${page} / ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: "right" });
  }
}

function ensureSpace(pdf, y, needed) {
  if (y + needed > PAGE_HEIGHT - FOOTER_HEIGHT - 4) {
    pdf.addPage();
    return MARGIN;
  }
  return y;
}

function writeWrapped(pdf, text, x, y, width, options = {}) {
  const lines = pdf.splitTextToSize(safeText(text), width);
  lines.forEach((line, index) => {
    pdf.text(line, x, y + index * LINE_HEIGHT, options);
  });
  return y + Math.max(1, lines.length) * LINE_HEIGHT;
}

function sectionTitle(pdf, title, y) {
  y = ensureSpace(pdf, y, 12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(17, 24, 39);
  pdf.text(title, MARGIN, y);
  return y + 7;
}

function drawRows(pdf, rows, y, columns = [80, 50, 40]) {
  pdf.setFontSize(8);
  for (const row of rows) {
    const height = 7;
    y = ensureSpace(pdf, y, height + 2);
    let x = MARGIN;
    row.forEach((cell, index) => {
      const width = columns[index] || 30;
      pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
      writeWrapped(pdf, cell, x, y + 4, width - 2);
      x += width;
    });
    pdf.setDrawColor(226, 232, 240);
    pdf.line(MARGIN, y + height, PAGE_WIDTH - MARGIN, y + height);
    y += height;
  }
  return y + 3;
}

function drawGroupTable(pdf, title, groups, y, { includeDeductible = false } = {}) {
  y = sectionTitle(pdf, title, y);
  const rows = groups.length
    ? groups.map((group) => [
        group.label,
        String(group.count),
        moneyFromCents(group.htCents),
        moneyFromCents(group.vatCents),
        includeDeductible ? moneyFromCents(group.deductibleVatCents) : "",
      ])
    : [["Aucune ligne", "", "", "", ""]];
  return drawRows(pdf, [["Groupe", "Lignes", "Base HT", "TVA", includeDeductible ? "TVA déductible" : ""], ...rows], y, [58, 20, 38, 38, 38]);
}

function drawSourceLines(pdf, title, lines, y) {
  y = sectionTitle(pdf, title, y);
  const rows = lines.slice(0, 20).map((line) => [
    line.date || "",
    line.partner || "",
    line.description || line.number || "",
    moneyFromCents(line.htCents),
    (line.ecdfBoxes || []).join(", "),
  ]);
  return drawRows(pdf, [["Date", "Tiers", "Designation", "HT", "Cases"], ...(rows.length ? rows : [["Aucune ligne", "", "", "", ""]])], y, [24, 38, 66, 28, 34]);
}

function drawEcdfBoxes(pdf, model, y) {
  y = sectionTitle(pdf, "Cases eCDF à recopier", y);
  const rows = (model.ecdfBoxes || []).map((entry) => [
    entry.box,
    entry.label,
    moneyFromCents(entry.amountCents),
    (entry.sourceIds || []).length ? String((entry.sourceIds || []).length) : "0",
  ]);
  return drawRows(pdf, [["Case", "Intitulé", "Montant", "Sources"], ...(rows.length ? rows : [["Aucune case", "", "", ""]])], y, [20, 104, 36, 25]);
}

function drawAnomalies(pdf, model, y) {
  y = sectionTitle(pdf, "Contrôles", y);
  const blocks = [
    ["Erreurs bloquantes", model.sections.anomalyGroups.errors, model.sections.anomalies.error],
    ["Avertissements", model.sections.anomalyGroups.warnings, model.sections.anomalies.warning],
    ["Informations", model.sections.anomalyGroups.infos, model.sections.anomalies.info],
  ];
  for (const [label, groups, details] of blocks) {
    y = ensureSpace(pdf, y, 12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label} (${details.length})`, MARGIN, y);
    y += 5;
    const groupRows = groups.map((group) => [group.code, `${group.count} occurrence(s)`]);
    y = drawRows(pdf, groupRows.length ? groupRows : [["Aucune anomalie", ""]], y, [110, 50]);
    const detailRows = details.slice(0, label === "Erreurs bloquantes" ? details.length : 20).map((entry) => [
      entry.code || "",
      entry.message || "",
      entry.sourceId || "",
    ]);
    if (detailRows.length) y = drawRows(pdf, detailRows, y, [50, 90, 45]);
  }
  return y;
}

export function buildVatReportPdf({ report = {}, settings = {}, generatedAt = new Date() } = {}) {
  const model = buildVatReportPdfModel({ report, settings, generatedAt });
  const pdf = new jsPDF("p", "mm", "a4");
  let y = MARGIN;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  y = writeWrapped(pdf, model.title, MARGIN, y, CONTENT_WIDTH);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  y = writeWrapped(pdf, model.subtitle, MARGIN, y + 1, CONTENT_WIDTH);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(185, 28, 28);
  y = writeWrapped(pdf, model.notice, MARGIN, y + 3, CONTENT_WIDTH);
  pdf.setTextColor(17, 24, 39);
  y = writeWrapped(pdf, model.source, MARGIN, y + 2, CONTENT_WIDTH);

  y = sectionTitle(pdf, "Identité", y + 4);
  y = drawRows(pdf, model.identity, y, [58, 125]);

  y = sectionTitle(pdf, "Statut du rapport", y);
  y = drawRows(pdf, [["Statut", model.status.label], ...(model.status.incompleteMessage ? [["Attention", model.status.incompleteMessage]] : [])], y, [58, 125]);

  y = sectionTitle(pdf, "Résumé général", y);
  y = drawRows(pdf, model.summary, y, [86, 95]);

  y = drawEcdfBoxes(pdf, model, y);
  y = drawGroupTable(pdf, "Ventilation des ventes", model.sections.sales, y);
  y = drawGroupTable(pdf, "Ventilation par taux de TVA", model.sections.salesRates, y);
  y = drawGroupTable(pdf, "Achats Luxembourg", model.sections.luExpenses, y, { includeDeductible: true });
  y = drawGroupTable(pdf, "Acquisitions UE - biens", model.sections.euGoods, y, { includeDeductible: true });
  y = drawGroupTable(pdf, "Services UE", model.sections.euServices, y, { includeDeductible: true });
  y = drawSourceLines(pdf, "Immobilisations", model.sections.assets, y);
  y = sectionTitle(pdf, "TVA étrangère", y);
  y = writeWrapped(
    pdf,
    "Cette TVA n'est pas reprise comme TVA déductible dans la déclaration luxembourgeoise. Une éventuelle procédure de remboursement étrangère n'est pas analysée dans ce rapport.",
    MARGIN,
    y,
    CONTENT_WIDTH
  );
  y = drawSourceLines(pdf, "Lignes avec TVA étrangère", model.sections.foreignVat, y + 2);
  y = drawAnomalies(pdf, model, y);
  y = sectionTitle(pdf, "Lignes sources", y);
  drawRows(pdf, model.sections.sourceSummary, y, [70, 100]);

  drawFooter(pdf, model);
  return pdf;
}

export function downloadVatReportPdf({ report = {}, settings = {}, generatedAt = new Date() } = {}) {
  const pdf = buildVatReportPdf({ report, settings, generatedAt });
  const filename = getVatReportPdfFileName({ report, settings });
  pdf.save(filename);
  return filename;
}
