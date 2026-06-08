import { isPaidInvoice, getInvoiceRemaining } from "./invoices";
import { hydrateQuoteAttachments } from "./quoteAttachments";

function normalizeStatus(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isDocumentForClient(document, clientId) {
  if (!document || !clientId) return false;
  return String(document.clientId || "") === String(clientId);
}

export function isDocumentLinkedToQuote(document, quote) {
  if (!document || !quote) return false;
  const quoteId = String(quote.id || "");
  const quoteNumber = String(quote.number || "");
  return (
    (quoteId && String(document.parentQuoteId || document.quoteId || "") === quoteId) ||
    (quoteNumber && String(document.convertedFrom || document.quoteNumber || "") === quoteNumber)
  );
}

function sortByRecentDate(a, b) {
  return String(b.date || b.uploadedAt || b.createdAt || "").localeCompare(
    String(a.date || a.uploadedAt || a.createdAt || "")
  );
}

function getFileUrl(file) {
  return String(file?.url || file?.publicUrl || "").trim();
}

function getFileKey(file) {
  return String(file?.url || file?.storagePath || file?.id || file?.name || "");
}

function isClientFileVisibleInPortal(file) {
  return Boolean(
    file?.publicPortal ||
      file?.visibleToClient ||
      file?.clientVisible ||
      file?.isPublic
  );
}

function mapQuoteAttachment(attachment, quote) {
  const url = getFileUrl(attachment);
  if (!url) return null;
  return {
    id: `quote-file-${quote?.id || quote?.number || "quote"}-${attachment.id || attachment.name || url}`,
    name: attachment.name || "Fichier devis",
    url,
    mimeType: attachment.mimeType || "",
    size: attachment.size || 0,
    uploadedAt: attachment.uploadedAt || quote?.updatedAt || quote?.date || quote?.createdAt || "",
    source: quote?.number || "Devis",
    kind: "BAT / fichier devis",
  };
}

function mapClientFile(file) {
  const url = getFileUrl(file);
  if (!url) return null;
  return {
    id: file.id || file.storagePath || file.name || url,
    name: file.name || "Fichier client",
    url,
    mimeType: file.mimeType || "",
    size: file.size || 0,
    uploadedAt: file.uploadedAt || file.createdAt || file.date || "",
    source: file.source || "Espace client",
    kind: file.kind || file.category || "Fichier client",
  };
}

export function getClientPortalFiles(data = {}, quote = {}, relatedQuotes = []) {
  const clientId = quote?.clientId;
  const quoteList = relatedQuotes.length
    ? relatedQuotes
    : (data.quotes || []).filter((entry) => isDocumentForClient(entry, clientId));
  const files = [];

  quoteList.forEach((entry) => {
    hydrateQuoteAttachments(entry.attachments || [])
      .map((attachment) => mapQuoteAttachment(attachment, entry))
      .filter(Boolean)
      .forEach((file) => files.push(file));
  });

  (data.clientFiles || [])
    .filter((file) => isDocumentForClient(file, clientId) && isClientFileVisibleInPortal(file))
    .map(mapClientFile)
    .filter(Boolean)
    .forEach((file) => files.push(file));

  const deduped = new Map();
  files.forEach((file) => {
    const key = getFileKey(file);
    if (key && !deduped.has(key)) deduped.set(key, file);
  });

  return Array.from(deduped.values()).sort(sortByRecentDate);
}

export function getClientPortalDocuments(data = {}, quote = {}) {
  const clientId = quote?.clientId;
  const quotes = (data.quotes || [])
    .filter((entry) => isDocumentForClient(entry, clientId))
    .sort(sortByRecentDate);

  const invoices = (data.invoices || [])
    .filter(
      (entry) =>
        isDocumentForClient(entry, clientId) ||
        isDocumentLinkedToQuote(entry, quote)
    )
    .sort(sortByRecentDate);

  const deliveryNotes = (data.deliveryNotes || [])
    .filter(
      (entry) =>
        isDocumentForClient(entry, clientId) ||
        isDocumentLinkedToQuote(entry, quote)
    )
    .sort(sortByRecentDate);

  const files = getClientPortalFiles(data, quote, quotes);

  return { quotes, invoices, deliveryNotes, files };
}

export function getClientPortalSummary(portal = {}) {
  const invoices = portal.invoices || [];
  const remainingTTC = invoices.reduce(
    (sum, invoice) => sum + Math.max(0, getInvoiceRemaining(invoice)),
    0
  );
  const invoiceTotalTTC = invoices.reduce(
    (sum, invoice) => sum + (Number(invoice.totalTTC) || 0),
    0
  );

  return {
    quoteCount: (portal.quotes || []).length,
    invoiceCount: invoices.length,
    deliveryNoteCount: (portal.deliveryNotes || []).length,
    fileCount: (portal.files || []).length,
    invoiceTotalTTC,
    remainingTTC,
    paidInvoiceCount: invoices.filter((invoice) => isPaidInvoice(invoice)).length,
  };
}

export function getClientPortalProgress(quote = {}, related = {}) {
  const status = normalizeStatus(quote.status);
  const invoices = related.invoices || [];
  const deliveryNotes = related.deliveryNotes || [];
  const hasInvoice = invoices.length > 0;
  const allInvoicesPaid = hasInvoice && invoices.every((invoice) => isPaidInvoice(invoice));
  const hasDeliveryNote = deliveryNotes.length > 0;
  const delivered =
    status.includes("livre") ||
    deliveryNotes.some((note) => normalizeStatus(note.status).includes("livre"));
  const declined = status.includes("refus");
  const accepted =
    status.includes("accepte") ||
    status.includes("production") ||
    status.includes("pret") ||
    delivered;

  return [
    {
      id: "quote",
      label: "Devis envoyé",
      complete: Boolean(quote?.id || quote?.number),
    },
    {
      id: "decision",
      label: declined ? "Devis refusé" : "Acceptation client",
      complete: accepted || declined,
      muted: declined,
    },
    {
      id: "production",
      label: "Production / préparation",
      complete:
        status.includes("production") ||
        status.includes("pret") ||
        delivered ||
        hasDeliveryNote,
      muted: declined,
    },
    {
      id: "delivery",
      label: "Livraison / retrait",
      complete: delivered || hasDeliveryNote,
      muted: declined,
    },
    {
      id: "payment",
      label: allInvoicesPaid ? "Facture réglée" : "Facturation / paiement",
      complete: allInvoicesPaid,
      muted: declined || !hasInvoice,
    },
  ];
}

export function getInvoicePaymentLabel(invoice) {
  if (isPaidInvoice(invoice)) return "Payée";
  const remaining = getInvoiceRemaining(invoice);
  if (remaining > 0) return `Reste à payer : ${remaining.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  })}`;
  return invoice?.status || "En attente";
}
