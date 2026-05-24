import { applyStockByLines } from "./stock";
import { computeDueDate } from "./invoiceReminders";

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export function today() {
  return new Date().toLocaleDateString("fr-FR");
}

export function clientName(data, id) {
  return data.clients.find((c) => c.id === id)?.name || "Client supprimé";
}

export function statusClass(status) {
  return (
    "badge " +
    String(status || "")
      .toLowerCase()
      .replaceAll(" ", "-")
      .replaceAll("é", "e")
  );
}

export function dedupeDocuments(items = []) {
  const map = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const key = String(item.id || item.number || JSON.stringify(item));
    map.set(key, { ...map.get(key), ...item });
  }

  return Array.from(map.values());
}
export function createBackupSnapshot(
  data,
  label = "Sauvegarde automatique"
) {
  const safeData = normalizeData(data);

  return {
    id: uid(),
    label,
    createdAt: new Date().toISOString(),

    clientsCount: safeData.clients.length,
    productsCount: safeData.products.length,
    invoicesCount: safeData.invoices.length,
    quotesCount: safeData.quotes.length,

    data: {
      ...safeData,
      backups: [],
    },
  };
}
export function downloadJson(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
export function normalizeData(data) {
  return {
    ...data,

    users: data.users || [],
    clients: data.clients || [],
    products: data.products || [],
    categories: data.categories || [],

    quotes: data.quotes || [],
    invoices: data.invoices || [],

    backups: data.backups || [],
    logs: data.logs || [],

    settings: data.settings || {},
  };
}
export function pruneBackups(backups, max = 12) {
  return [...(backups || [])]
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0)
        - new Date(a.createdAt || 0)
    )
    .slice(0, max);
}

export function currentDocumentYear() {
  return new Date().getFullYear();
}

export function nextDocumentNumber(list, docPrefix, year = currentDocumentYear()) {
  const numbers = (list || [])
    .map((doc) => String(doc.number || ""))
    .filter((number) => number.startsWith(`${docPrefix}-${year}-`))
    .map((number) => Number(number.split("-").pop()))
    .filter((value) => !Number.isNaN(value));

  const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `${docPrefix}-${year}-${String(nextNumber).padStart(4, "0")}`;
}

export function quoteAlreadyConverted(data, quote) {
  const quoteNumber = String(quote?.number || "");
  if (!quoteNumber) return false;
  return (data.invoices || []).some(
    (invoice) => String(invoice.convertedFrom || "") === quoteNumber
  );
}

const CONVERTIBLE_QUOTE_STATUSES = new Set([
  "Accepté",
  "En production",
  "Prêt",
  "Livré",
]);

export function isQuoteConvertible(data, quote) {
  const status = String(quote?.status || "").trim();
  if (!CONVERTIBLE_QUOTE_STATUSES.has(status)) return false;
  return !quoteAlreadyConverted(data, quote);
}

export function convertQuoteToInvoiceData(data, quote) {
  const invoice = {
    ...quote,
    id: uid(),
    number: nextDocumentNumber(data.invoices || [], "FAC"),
    date: today(),
    status: "Non payée",
    dueDate: computeDueDate(today(), data.settings?.paymentDays),
    stockAdjusted: true,
    convertedFrom: quote.number,
  };

  return {
    ...data,
    products: applyStockByLines(data.products || [], invoice.lines || [], "remove", {
      type: "invoice",
      reason: "Conversion devis en facture",
      reference: invoice.number,
    }),
    invoices: [...(data.invoices || []), invoice],
  };
}