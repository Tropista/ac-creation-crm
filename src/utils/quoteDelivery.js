import { parseDocumentDate } from "./invoices";
import { addDays, isSameCalendarDay, startOfWeekMonday } from "./quoteDeliveryCalendar";

export const DELIVERY_URGENCY = {
  overdue: { label: "En retard", tone: "danger" },
  today: { label: "Aujourd'hui", tone: "warning" },
  thisWeek: { label: "Cette semaine", tone: "success" },
  later: { label: "Planifié", tone: "neutral" },
};

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2 };
const URGENCY_ORDER = { overdue: 0, today: 1, thisWeek: 2, later: 3 };

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

export function getDeliveryUrgency(quote, referenceDate = new Date()) {
  if (!quote || isQuoteDelivered(quote)) return null;

  const promised = parseDocumentDate(quote.promisedDeliveryDate);
  if (!promised) return null;

  const ref = startOfDay(referenceDate);
  const delivery = startOfDay(promised);

  if (delivery < ref) return "overdue";
  if (isSameCalendarDay(delivery, ref)) return "today";

  const weekStart = startOfWeekMonday(ref);
  const weekEnd = addDays(weekStart, 6);
  if (delivery >= weekStart && delivery <= weekEnd) return "thisWeek";

  return "later";
}

export function getDeliveryUrgencyMeta(quote, referenceDate = new Date()) {
  const key = getDeliveryUrgency(quote, referenceDate);
  if (!key) return null;
  return { key, ...DELIVERY_URGENCY[key] };
}

export function isQuoteToLaunchToday(quote, referenceDate = new Date()) {
  if (String(quote?.status || "").trim() !== "Accepté") return false;

  const urgency = getDeliveryUrgency(quote, referenceDate);
  if (!urgency || urgency === "later") return false;
  if (urgency === "overdue" || urgency === "today") return true;

  const priority = String(quote.priority || "normal");
  return priority === "high" || priority === "urgent";
}

export function compareQuotesByDeliveryAndPriority(
  a,
  b,
  referenceDate = new Date()
) {
  const urgA = getDeliveryUrgency(a, referenceDate);
  const urgB = getDeliveryUrgency(b, referenceDate);
  const urgDiff = (URGENCY_ORDER[urgA] ?? 99) - (URGENCY_ORDER[urgB] ?? 99);
  if (urgDiff !== 0) return urgDiff;

  const priDiff =
    (PRIORITY_ORDER[a?.priority] ?? 2) - (PRIORITY_ORDER[b?.priority] ?? 2);
  if (priDiff !== 0) return priDiff;

  const dateA = parseDocumentDate(a?.promisedDeliveryDate)?.getTime() ?? Infinity;
  const dateB = parseDocumentDate(b?.promisedDeliveryDate)?.getTime() ?? Infinity;
  if (dateA !== dateB) return dateA - dateB;

  return String(a?.number || "").localeCompare(String(b?.number || ""));
}

export function getQuotesToLaunchToday(quotes = [], referenceDate = new Date()) {
  return quotes
    .filter((quote) => isQuoteToLaunchToday(quote, referenceDate))
    .sort((a, b) => compareQuotesByDeliveryAndPriority(a, b, referenceDate));
}
