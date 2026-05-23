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
