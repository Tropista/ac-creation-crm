import { parseDocumentDate } from "./invoices";

export function toDateInputValue(frDate) {
  const parsed = parseDocumentDate(frDate);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(isoDate) {
  const value = String(isoDate || "").trim();
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function isQuoteDelivered(quote) {
  return String(quote?.status || "").trim() === "Livré";
}

export function isQuoteDeliveryOverdue(quote, referenceDate = new Date()) {
  if (!quote || isQuoteDelivered(quote)) return false;

  const promised = parseDocumentDate(quote.promisedDeliveryDate);
  if (!promised) return false;

  return startOfDay(promised) < startOfDay(referenceDate);
}

export function sortOverdueQuotes(quotes = [], referenceDate = new Date()) {
  return [...quotes]
    .filter((quote) => isQuoteDeliveryOverdue(quote, referenceDate))
    .sort((a, b) => {
      const dateA = parseDocumentDate(a.promisedDeliveryDate)?.getTime() || 0;
      const dateB = parseDocumentDate(b.promisedDeliveryDate)?.getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;
      return String(a.number || "").localeCompare(String(b.number || ""));
    });
}

export function getOverdueQuotes(quotes = [], referenceDate = new Date()) {
  return sortOverdueQuotes(quotes, referenceDate);
}
