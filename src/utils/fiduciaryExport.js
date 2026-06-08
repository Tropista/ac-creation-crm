import { clientName } from "./documents";
import { parseDocumentDate } from "./invoices";

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function inPeriod(value, { year, month } = {}) {
  const date = parseDocumentDate(value);
  if (!date) return false;
  if (year && date.getFullYear() !== Number(year)) return false;
  if (month !== undefined && month !== null && date.getMonth() !== Number(month)) return false;
  return true;
}

function formatDate(value) {
  const date = parseDocumentDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function resolveVatRate(doc) {
  const rate = Number(doc.taxRate ?? doc.vatRate ?? 17);
  return Number.isFinite(rate) ? rate : 17;
}

export function buildLuxembourgAccountingRows(data = {}, period = {}) {
  const invoices = (data.invoices || []).filter((invoice) => inPeriod(invoice.date, period));
  const expenses = (data.expenses || []).filter((expense) =>
    inPeriod(expense.purchaseDate || expense.date, period)
  );

  const sales = invoices.map((invoice) => {
    const totalHT = round2(invoice.totalHT || 0);
    const totalTVA = round2(invoice.totalTVA ?? invoice.totalVAT ?? Number(invoice.totalTTC || 0) - totalHT);
    const totalTTC = round2(invoice.totalTTC || totalHT + totalTVA);
    const paid = round2(invoice.paidAmount || 0);
    const remaining = round2(invoice.remaining ?? Math.max(0, totalTTC - paid));
    return {
      journal: "VEN",
      account: "400000",
      contraAccount: "700000",
      vatAccount: "451000",
      date: formatDate(invoice.date),
      documentNumber: invoice.number || invoice.reference || "",
      client: clientName(data, invoice.clientId),
      label: `Vente ${invoice.number || ""}`.trim(),
      debit: totalTTC,
      credit: totalHT,
      vatAmount: totalTVA,
      vatRate: resolveVatRate(invoice),
      matchingReference: invoice.number || invoice.reference || "",
      paidAmount: paid,
      openAmount: remaining,
      status: remaining <= 0.01 ? "Lettré" : "Ouvert",
    };
  });

  const purchases = expenses.map((expense) => {
    const totalHT = round2(expense.amountHT || expense.totalHT || 0);
    const totalTVA = round2(expense.tva || expense.vatAmount || expense.amountTVA || 0);
    const totalTTC = round2(expense.amountTTC || expense.totalTTC || totalHT + totalTVA);
    return {
      journal: "ACH",
      account: "600000",
      contraAccount: "440000",
      vatAccount: "461000",
      date: formatDate(expense.purchaseDate || expense.date),
      documentNumber: expense.invoiceNumber || expense.reference || expense.id || "",
      supplier: expense.supplierName || "",
      label: expense.description || expense.category || "Achat",
      debit: totalHT,
      credit: totalTTC,
      vatAmount: totalTVA,
      vatRate: totalHT > 0 ? round2((totalTVA / totalHT) * 100) : 0,
      matchingReference: expense.invoiceNumber || expense.reference || "",
      paidAmount: totalTTC,
      openAmount: 0,
      status: "Lettré",
    };
  });

  return { sales, purchases, rows: [...sales, ...purchases] };
}

export function buildVatSummary(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.vatRate || 0);
    const current = map.get(key) || { vatRate: Number(row.vatRate || 0), baseHT: 0, vatAmount: 0 };
    const base = row.journal === "VEN" ? Number(row.credit || 0) : Number(row.debit || 0);
    current.baseHT += base;
    current.vatAmount += Number(row.vatAmount || 0) * (row.journal === "ACH" ? -1 : 1);
    map.set(key, current);
  }
  return [...map.values()].map((entry) => ({
    ...entry,
    baseHT: round2(entry.baseHT),
    vatAmount: round2(entry.vatAmount),
  }));
}

export function buildFiduciaryExportPack(data = {}, period = {}) {
  const { sales, purchases, rows } = buildLuxembourgAccountingRows(data, period);
  const vatSummary = buildVatSummary(rows);
  const openItems = rows.filter((row) => Number(row.openAmount || 0) > 0.01);
  return {
    period,
    sales,
    purchases,
    vatSummary,
    openItems,
    totals: {
      salesTTC: round2(sales.reduce((sum, row) => sum + row.debit, 0)),
      purchasesTTC: round2(purchases.reduce((sum, row) => sum + row.credit, 0)),
      vatDue: round2(vatSummary.reduce((sum, row) => sum + row.vatAmount, 0)),
      openAmount: round2(openItems.reduce((sum, row) => sum + row.openAmount, 0)),
    },
  };
}

function escapeCell(value) {
  const text = String(value ?? "");
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sectionRows(title, headers, rows) {
  return [
    [title],
    headers,
    ...rows,
    [],
  ];
}

export function buildFiduciaryCsvRows(data = {}, period = {}) {
  const pack = buildFiduciaryExportPack(data, period);
  return [
    ...sectionRows(
      "VENTES",
      ["Journal", "Compte client", "Compte vente", "Compte TVA", "Date", "Document", "Client", "Libellé", "TTC débit", "HT crédit", "TVA", "Taux", "Lettrage", "Payé", "Ouvert", "Statut"],
      pack.sales.map((row) => [
        row.journal,
        row.account,
        row.contraAccount,
        row.vatAccount,
        row.date,
        row.documentNumber,
        row.client,
        row.label,
        row.debit,
        row.credit,
        row.vatAmount,
        row.vatRate,
        row.matchingReference,
        row.paidAmount,
        row.openAmount,
        row.status,
      ])
    ),
    ...sectionRows(
      "ACHATS",
      ["Journal", "Compte charge", "Compte fournisseur", "Compte TVA", "Date", "Document", "Fournisseur", "Libellé", "HT débit", "TTC crédit", "TVA", "Taux", "Lettrage", "Statut"],
      pack.purchases.map((row) => [
        row.journal,
        row.account,
        row.contraAccount,
        row.vatAccount,
        row.date,
        row.documentNumber,
        row.supplier,
        row.label,
        row.debit,
        row.credit,
        row.vatAmount,
        row.vatRate,
        row.matchingReference,
        row.status,
      ])
    ),
    ...sectionRows(
      "TVA",
      ["Taux", "Base HT", "TVA nette"],
      pack.vatSummary.map((row) => [row.vatRate, row.baseHT, row.vatAmount])
    ),
    ...sectionRows(
      "LETTRAGE",
      ["Document", "Client/Fournisseur", "Référence", "Ouvert", "Statut"],
      pack.openItems.map((row) => [
        row.documentNumber,
        row.client || row.supplier,
        row.matchingReference,
        row.openAmount,
        row.status,
      ])
    ),
  ];
}

export function downloadFiduciaryCsv(data = {}, period = {}) {
  const rows = buildFiduciaryCsvRows(data, period);
  const content = `\uFEFF${rows.map((row) => row.map(escapeCell).join(";")).join("\r\n")}`;
  const label = `${period.year || new Date().getFullYear()}-${String(Number(period.month ?? new Date().getMonth()) + 1).padStart(2, "0")}`;
  const filename = `fiduciaire-luxembourg-${label}.csv`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
