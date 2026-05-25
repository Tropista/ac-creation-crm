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
    expense.category || "",
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

export function exportAccountingLuxCsv(data, { year, month } = {}) {
  const now = new Date();
  const target = parseMonthYear(
    year ?? now.getFullYear(),
    month ?? now.getMonth()
  );
  if (!target) return;

  const { year: targetYear, month: targetMonth } = target;
  const monthLabel = new Date(targetYear, targetMonth, 1).toLocaleDateString(
    "fr-FR",
    { month: "long", year: "numeric" }
  );

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

  const rows = [
    ["Export comptable Luxembourg", monthLabel],
    [],
    ["Résumé TVA", ""],
    ["TVA collectée (factures)", formatCsvNumber(tvaCollectee)],
    ["TVA déductible (dépenses)", formatCsvNumber(tvaDeductible)],
    ["TVA due estimée", formatCsvNumber(tvaDue)],
    ["Total factures HT", formatCsvNumber(invoiceHT)],
    ["Total factures TTC", formatCsvNumber(invoiceTTC)],
    ["Total dépenses HT", formatCsvNumber(expenseHT)],
    ["Total dépenses TTC", formatCsvNumber(expenseTTC)],
    [],
    ["Factures du mois", ""],
    ["N° facture", "Client", "Date", "HT", "TVA", "TTC", "Statut"],
    ...invoices.map((invoice) => {
      const client = (data.clients || []).find(
        (item) => String(item.id) === String(invoice.clientId)
      );
      return [
        invoice.number || "",
        client?.name || "",
        formatCsvDate(invoice.date),
        formatCsvNumber(invoice.totalHT),
        formatCsvNumber(invoice.taxAmount),
        formatCsvNumber(invoice.totalTTC),
        invoice.status || "",
      ];
    }),
    [],
    ["Dépenses du mois", ""],
    ["Fournisseur", "Date", "N° facture", "HT", "TVA %", "TVA €", "TTC", "Catégorie"],
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
      expense.category || "",
    ]),
  ];

  const lines = rows.map((row) => row.map(escapeCsvCell).join(";"));
  const content = `\uFEFF${lines.join("\r\n")}`;
  const filename = `comptabilite-lu-${targetYear}-${String(targetMonth + 1).padStart(2, "0")}.csv`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
