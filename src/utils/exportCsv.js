import {
  getLowStockProducts,
  resolveProductSupplier,
  suggestedReorderQty,
} from "./stock";
import { getExpenseCategoryLabel } from "./expenseVatClassification";

function escapeCsvCell(value) {
  const str = String(value ?? "");
  if (/[";\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(";"),
    ...rows.map((row) => row.map(escapeCsvCell).join(";")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsv(filename, headers, rows) {
  const content = rowsToCsv(headers, rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatCsvDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}

function formatCsvNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(2).replace(".", ",") : "0,00";
}

function parseMonthYear(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) {
    return null;
  }
  return { year: y, month: m };
}

/** Valeur `input type="month"` (YYYY-MM) depuis année + mois JS (0–11). */
export function formatAccountingMonthInput(year, month) {
  const target = parseMonthYear(year, month);
  if (!target) return "";
  return `${target.year}-${String(target.month + 1).padStart(2, "0")}`;
}

/** Parse la valeur d'un `input type="month"` en { year, month } (mois 0–11). */
export function parseAccountingMonthInput(value) {
  if (!value || typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return parseMonthYear(match[1], Number(match[2]) - 1);
}

function isInMonth(value, year, month) {
  if (!value) return false;
  const parts = String(value).split("/");
  const date =
    parts.length === 3
      ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === year && date.getMonth() === month;
}

export function exportExpensesCsv(expenses, filename) {
  const headers = [
    "Fournisseur",
    "Date",
    "N° facture",
    "HT",
    "TVA %",
    "TVA €",
    "TTC",
    "Catégorie",
    "Compte personnel",
    "Personne ayant payé",
    "Fonction",
    "Statut remboursement",
    "Traitement TVA",
  ];

  const rows = expenses.map((expense) => [
    expense.supplierName || "",
    formatCsvDate(expense.purchaseDate || expense.createdAt),
    expense.invoiceNumber || "",
    formatCsvNumber(expense.amountHT),
    expense.vatRate != null && expense.vatRate !== ""
      ? String(expense.vatRate)
      : "",
    formatCsvNumber(expense.vatAmount),
    formatCsvNumber(expense.totalTTC),
    getExpenseCategoryLabel(expense.category),
    expense.personalAccountPurchase ? "Oui" : "Non",
    expense.paidByPerson || "",
    expense.paidByRole || "",
    expense.companyReimbursementStatus || "not_reimbursable",
    expense.vatDeductionStatus || "accountant_review",
  ]);

  downloadCsv(filename, headers, rows);
}

export function exportInvoicesCsv(invoices, data, filename) {
  const headers = [
    "N° facture",
    "Client",
    "Date",
    "Échéance",
    "HT",
    "TTC",
    "Statut",
  ];

  const rows = invoices.map((invoice) => {
    const client = (data.clients || []).find(
      (item) => String(item.id) === String(invoice.clientId)
    );

    return [
      invoice.number || "",
      client?.name || "",
      invoice.date || "",
      invoice.dueDate || "",
      formatCsvNumber(invoice.totalHT),
      formatCsvNumber(invoice.totalTTC),
      invoice.status || "",
    ];
  });

  downloadCsv(filename, headers, rows);
}

export function buildMonthlyAccountingCsvRows(data, { year, month } = {}) {
  const now = new Date();
  const target = parseMonthYear(
    year ?? now.getFullYear(),
    month ?? now.getMonth()
  );
  if (!target) return null;

  const { year: targetYear, month: targetMonth } = target;
  const monthLabel = new Date(targetYear, targetMonth, 1).toLocaleDateString(
    "fr-FR",
    { month: "long", year: "numeric" }
  );
  const taxRate = Number(data.settings?.taxRate ?? 17);

  const invoices = (data.invoices || []).filter((invoice) =>
    isInMonth(invoice.date, targetYear, targetMonth)
  );
  const expenses = (data.expenses || []).filter((expense) =>
    isInMonth(expense.purchaseDate || expense.createdAt, targetYear, targetMonth)
  );

  const invoiceHT = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.totalHT || 0),
    0
  );
  const invoiceTVA = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.taxAmount || 0),
    0
  );
  const invoiceTTC = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.totalTTC || 0),
    0
  );

  const expenseHT = expenses.reduce(
    (sum, expense) => sum + Number(expense.amountHT || 0),
    0
  );
  const expenseTVA = expenses.reduce(
    (sum, expense) => sum + Number(expense.vatAmount || 0),
    0
  );
  const expenseTTC = expenses.reduce(
    (sum, expense) => sum + Number(expense.totalTTC || expense.amountHT || 0),
    0
  );

  const tvaCollectee = invoiceTVA;
  const tvaDeductible = expenseTVA;
  const tvaDue = tvaCollectee - tvaDeductible;

  function invoiceTypeLabel(invoice) {
    const type = String(invoice.invoiceType || "").trim();
    if (type === "acompte") return "Acompte";
    if (type === "solde") return "Solde";
    return "Facture";
  }

  const rows = [
    ["Export comptable mensuel — AC Creation CRM", monthLabel],
    ["Généré le", formatCsvDate(new Date())],
    [],
    [`Récapitulatif TVA (${taxRate} %)`, ""],
    ["TVA collectée (ventes)", formatCsvNumber(tvaCollectee)],
    ["TVA déductible (achats)", formatCsvNumber(tvaDeductible)],
    ["TVA due estimée", formatCsvNumber(tvaDue)],
    ["Total ventes HT", formatCsvNumber(invoiceHT)],
    ["Total ventes TTC", formatCsvNumber(invoiceTTC)],
    ["Total achats HT", formatCsvNumber(expenseHT)],
    ["Total achats TTC", formatCsvNumber(expenseTTC)],
    ["Nombre de factures ventes", String(invoices.length)],
    ["Nombre de factures achats", String(expenses.length)],
    [],
    ["Journal des ventes (factures)", ""],
    [
      "N° facture",
      "Client",
      "Date",
      "Type",
      "Devis lié",
      "ID devis parent",
      "HT",
      `TVA ${taxRate} %`,
      "TVA €",
      "TTC",
      "Statut",
    ],
    ...invoices.map((invoice) => {
      const client = (data.clients || []).find(
        (item) => String(item.id) === String(invoice.clientId)
      );
      return [
        invoice.number || "",
        client?.name || "",
        formatCsvDate(invoice.date),
        invoiceTypeLabel(invoice),
        invoice.convertedFrom || "",
        invoice.parentQuoteId || "",
        formatCsvNumber(invoice.totalHT),
        String(invoice.taxRate ?? taxRate),
        formatCsvNumber(invoice.taxAmount),
        formatCsvNumber(invoice.totalTTC),
        invoice.status || "",
      ];
    }),
    [],
    ["Journal des achats (dépenses)", ""],
    [
      "Fournisseur",
      "Date",
      "N° facture",
      "HT",
      "TVA %",
      "TVA €",
      "TTC",
      "Catégorie",
      "Compte personnel",
      "Personne ayant payé",
      "Fonction",
      "Statut remboursement",
      "Traitement TVA",
    ],
    ...expenses.map((expense) => [
      expense.supplierName || "",
      formatCsvDate(expense.purchaseDate || expense.createdAt),
      expense.invoiceNumber || "",
      formatCsvNumber(expense.amountHT),
      expense.vatRate != null && expense.vatRate !== ""
        ? String(expense.vatRate)
        : "",
      formatCsvNumber(expense.vatAmount),
      formatCsvNumber(expense.totalTTC),
      getExpenseCategoryLabel(expense.category),
      expense.personalAccountPurchase ? "Oui" : "Non",
      expense.paidByPerson || "",
      expense.paidByRole || "",
      expense.companyReimbursementStatus || "not_reimbursable",
      expense.vatDeductionStatus || "accountant_review",
    ]),
  ];

  return {
    rows,
    monthLabel,
    targetYear,
    targetMonth,
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
    tvaDue,
  };
}

export function downloadAccountingCsvPack(rows, { targetYear, targetMonth }) {
  const lines = rows.map((row) => row.map(escapeCsvCell).join(";"));
  const content = `\uFEFF${lines.join("\r\n")}`;
  const filename = `comptable-mensuel-${targetYear}-${String(targetMonth + 1).padStart(2, "0")}.csv`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}

/** Export mensuel comptable 1 clic — ventes, achats, récap TVA (UTF-8 BOM). */
export function exportMonthlyAccountingPack(data, { year, month } = {}) {
  const built = buildMonthlyAccountingCsvRows(data, { year, month });
  if (!built) return null;

  const filename = downloadAccountingCsvPack(built.rows, built);
  return {
    filename,
    monthLabel: built.monthLabel,
    invoiceCount: built.invoiceCount,
    expenseCount: built.expenseCount,
    tvaDue: built.tvaDue,
  };
}

export function exportAccountingLuxCsv(data, options = {}) {
  return exportMonthlyAccountingPack(data, options);
}

function formatPoDate() {
  return new Date().toLocaleDateString("fr-FR");
}

/** Bon de commande fournisseur CSV — produits en stock bas (audit #19). */
export function exportLowStockPurchaseOrderCsv(products, suppliers, settings, filename) {
  const lowStock = getLowStockProducts(products, 999);
  const company = settings?.companyName || "AC Creation";

  const headers = [
    "Fournisseur",
    "Email fournisseur",
    "Produit",
    "SKU",
    "Stock actuel",
    "Seuil min",
    "Qté commandée",
    "Notes",
  ];

  const rows = lowStock.map((product) => {
    const supplier = resolveProductSupplier(product, suppliers);
    return [
      supplier?.name || product.supplier || "—",
      supplier?.email || "",
      product.name || "",
      product.sku || "",
      String(product.stock ?? 0),
      String(product.stockMin || product.minStock || 0),
      String(suggestedReorderQty(product)),
      supplier?.notes || "",
    ];
  });

  downloadCsv(
    filename ||
      `bon-commande-fournisseur-${new Date().toISOString().slice(0, 10)}.csv`,
    headers,
    rows.length
      ? rows
      : [["—", "", "Aucun produit en stock bas", "", "", "", "", company]]
  );
}

/** Texte bon de commande fournisseur (copie / impression). */
export function buildPurchaseOrderText(products, suppliers, settings) {
  const lowStock = getLowStockProducts(products, 999);
  const company = settings?.companyName || "AC Creation";
  const lines = [
    `BON DE COMMANDE FOURNISSEUR — ${company}`,
    `Date : ${formatPoDate()}`,
    "",
    "Produits en stock bas :",
    "",
  ];

  if (lowStock.length === 0) {
    lines.push("Aucun produit sous le seuil minimum.");
    return lines.join("\n");
  }

  lowStock.forEach((product, index) => {
    const supplier = resolveProductSupplier(product, suppliers);
    lines.push(
      `${index + 1}. ${product.name || "Produit"} (SKU: ${product.sku || "—"})`,
      `   Fournisseur : ${supplier?.name || product.supplier || "À définir"}`,
      `   Stock : ${product.stock ?? 0} / seuil ${product.stockMin || product.minStock || 0}`,
      `   Qté commandée suggérée : ${suggestedReorderQty(product)}`,
      supplier?.email ? `   Contact : ${supplier.email}` : "",
      ""
    );
  });

  lines.push("—", "Document interne CRM — non envoyé automatiquement.");
  return lines.filter(Boolean).join("\n");
}
