import { isPaidInvoice, getInvoiceRemaining } from "./invoices";

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

export function getClientPortalDocuments(data = {}, quote = {}) {
  const clientId = quote?.clientId;
  const quotes = (data.quotes || [])
    .filter((entry) => isDocumentForClient(entry, clientId))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const invoices = (data.invoices || [])
    .filter(
      (entry) =>
        isDocumentForClient(entry, clientId) ||
        isDocumentLinkedToQuote(entry, quote)
    )
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const deliveryNotes = (data.deliveryNotes || [])
    .filter(
      (entry) =>
        isDocumentForClient(entry, clientId) ||
        isDocumentLinkedToQuote(entry, quote)
    )
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return { quotes, invoices, deliveryNotes };
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
