import { parseDocumentDate } from "./invoices";
import { isQuoteDeliveryOverdue } from "./quoteDelivery";

export function startOfWeekMonday(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
}

export function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function isSameCalendarDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getWeekDays(weekStart) {
  const start = startOfWeekMonday(weekStart);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatWeekRangeLabel(weekStart) {
  const start = startOfWeekMonday(weekStart);
  const end = addDays(start, 6);
  const dayOpts = { day: "numeric", month: "short" };
  const startLabel = start.toLocaleDateString("fr-FR", dayOpts);
  const endLabel = end.toLocaleDateString("fr-FR", {
    ...dayOpts,
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()} — ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${startLabel} — ${endLabel}`;
}

export function getQuotesForCalendarDay(quotes = [], day) {
  return quotes.filter((quote) => {
    const promised = parseDocumentDate(quote.promisedDeliveryDate);
    if (!promised) return false;
    return isSameCalendarDay(promised, day);
  });
}

export function buildDeliveryWeekCalendar(quotes = [], weekStart = new Date(), referenceDate = new Date()) {
  const days = getWeekDays(weekStart);

  return days.map((day) => {
    const items = getQuotesForCalendarDay(quotes, day, referenceDate)
      .filter((quote) => String(quote.status || "") !== "Livré")
      .sort((a, b) => String(a.number || "").localeCompare(String(b.number || "")));

    return {
      date: day,
      label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      isToday: isSameCalendarDay(day, referenceDate),
      items: items.map((quote) => ({
        quote,
        overdue: isQuoteDeliveryOverdue(quote, referenceDate),
      })),
    };
  });
}

export function countWeekDeliveries(calendarDays = []) {
  return calendarDays.reduce((sum, day) => sum + day.items.length, 0);
}

export function getQuotesInWeekRange(quotes = [], weekStart = new Date()) {
  const start = startOfWeekMonday(weekStart);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);

  return quotes.filter((quote) => {
    const promised = parseDocumentDate(quote.promisedDeliveryDate);
    if (!promised) return false;
    return promised >= start && promised <= end;
  });
}
