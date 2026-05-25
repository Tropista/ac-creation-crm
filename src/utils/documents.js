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
    deliveryNotes: data.deliveryNotes || [],

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
    paidAmount: 0,
    remaining: Number(quote.totalTTC || 0),
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

export const DELIVERY_NOTE_ELIGIBLE_STATUSES = ["Prêt", "Livré"];

export function isQuoteDeliveryNoteEligible(quote) {
  return DELIVERY_NOTE_ELIGIBLE_STATUSES.includes(String(quote?.status || "").trim());
}

export function quoteHasDeliveryNote(data, quote) {
  const quoteNumber = String(quote?.number || "");
  if (!quoteNumber) return false;
  return (data.deliveryNotes || []).some(
    (note) =>
      String(note.quoteNumber || "") === quoteNumber ||
      String(note.quoteId || "") === String(quote?.id || "")
  );
}

export function getDeliveryNoteForQuote(data, quote) {
  const quoteNumber = String(quote?.number || "");
  return (data.deliveryNotes || []).find(
    (note) =>
      String(note.quoteNumber || "") === quoteNumber ||
      String(note.quoteId || "") === String(quote?.id || "")
  );
}

function normalizeDeliveryLines(quote, products = []) {
  const sourceLines = quote?.lines?.length
    ? quote.lines
    : [
        {
          productId: quote?.productId,
          sku: quote?.sku,
          description: quote?.description,
          quantity: quote?.quantity || 1,
        },
      ];

  return sourceLines
    .filter((line) => line.description && Number(line.quantity || 0) > 0)
    .map((line) => {
      const product = products.find((p) => String(p.id) === String(line.productId));
      return {
        productId: line.productId || product?.id || "",
        sku: line.sku || product?.sku || "",
        description: line.description || product?.name || "",
        quantity: Number(line.quantity || 0),
      };
    });
}

export function createDeliveryNoteFromQuote(data, quote, options = {}) {
  if (!isQuoteDeliveryNoteEligible(quote)) {
    throw new Error("Le devis doit être au statut Prêt ou Livré.");
  }

  const existing = getDeliveryNoteForQuote(data, quote);
  if (existing && !options.regenerate) {
    return { ...data, deliveryNote: existing, created: false };
  }

  const client = (data.clients || []).find((c) => c.id === quote.clientId);
  const lines = normalizeDeliveryLines(quote, data.products || []);
  if (lines.length === 0) {
    throw new Error("Aucune ligne à livrer sur ce devis.");
  }

  const deliveryNote = {
    id: uid(),
    number: nextDocumentNumber(data.deliveryNotes || [], "BL"),
    date: today(),
    quoteNumber: quote.number,
    quoteId: quote.id,
    clientId: quote.clientId,
    status: quote.status === "Livré" ? "Livré" : "Prêt",
    lines,
    deliveryAddress: options.deliveryAddress || client?.address || "",
    deliveryInfo: options.deliveryInfo || "",
    notes: options.notes || "",
  };

  const nextNotes = existing
    ? (data.deliveryNotes || []).map((note) =>
        String(note.id) === String(existing.id) ? deliveryNote : note
      )
    : [...(data.deliveryNotes || []), deliveryNote];

  return {
    ...data,
    deliveryNotes: nextNotes,
    deliveryNote,
    created: !existing,
  };
}

export function createDepositInvoiceFromQuote(data, quote, percent) {
  const rate = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  if (rate <= 0) {
    throw new Error("Le pourcentage d'acompte doit être supérieur à 0.");
  }

  const quoteTotalTTC = Number(quote.totalTTC || 0);
  if (quoteTotalTTC <= 0) {
    throw new Error("Le devis n'a pas de montant TTC valide.");
  }

  const totalHT = Math.round(Number(quote.totalHT || 0) * rate * 100) / 100;
  const taxAmount = Math.round(Number(quote.taxAmount || 0) * rate * 100) / 100;
  const totalTTC = Math.round(quoteTotalTTC * rate * 100) / 100;
  const taxRate = Number(quote.taxRate ?? data.settings?.taxRate ?? 0);

  const invoice = {
    id: uid(),
    number: nextDocumentNumber(data.invoices || [], "FAC"),
    date: today(),
    clientId: quote.clientId,
    status: "Non payée",
    dueDate: computeDueDate(today(), data.settings?.paymentDays),
    invoiceType: "acompte",
    depositPercent: rate * 100,
    convertedFrom: quote.number,
    parentQuoteId: quote.id,
    description: `Acompte ${Math.round(rate * 100)}% — Devis ${quote.number}`,
    lines: [
      {
        productId: "",
        sku: "",
        description: `Acompte ${Math.round(rate * 100)}% — Devis ${quote.number}`,
        quantity: 1,
        price: totalHT,
        discount: 0,
        subtotal: totalHT,
        totalHT,
      },
    ],
    globalDiscount: 0,
    subtotal: totalHT,
    lineDiscountAmount: 0,
    globalDiscountAmount: 0,
    totalHT,
    taxRate,
    taxAmount,
    totalTTC,
    paidAmount: 0,
    remaining: totalTTC,
    stockAdjusted: false,
  };

  return {
    ...data,
    invoices: [...(data.invoices || []), invoice],
    invoice,
  };
}

export function enrichInvoicePaymentFields(invoice) {
  const totalTTC = Number(invoice?.totalTTC || 0);
  const paidAmount = Number(invoice?.paidAmount);
  const remaining = Number(invoice?.remaining);

  if (Number.isNaN(paidAmount)) {
    const nextPaid = invoice?.status === "Payée" ? totalTTC : 0;
    return {
      ...invoice,
      paidAmount: nextPaid,
      remaining: Number.isNaN(remaining) ? Math.max(0, totalTTC - nextPaid) : remaining,
    };
  }

  if (Number.isNaN(remaining)) {
    return {
      ...invoice,
      remaining: Math.max(0, totalTTC - paidAmount),
    };
  }

  return invoice;
}