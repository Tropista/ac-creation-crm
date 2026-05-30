import { ATELIER_PIPELINE_STATUSES } from "./production";
import { parseDocumentDate } from "./invoices";
import {
  formatWeekRangeLabel,
  getWeekDays,
  startOfWeekMonday,
} from "./quoteDeliveryCalendar";

const PLANNING_STATUSES = new Set(ATELIER_PIPELINE_STATUSES);

export function isPlanningEligibleQuote(quote) {
  return PLANNING_STATUSES.has(String(quote?.status || "").trim());
}

export function getQuoteDeliveryDate(quote) {
  return parseDocumentDate(quote?.promisedDeliveryDate);
}

export function buildOperatorWeekPlanning(quotes = [], users = [], weekStart = new Date()) {
  const start = startOfWeekMonday(weekStart);
  const days = getWeekDays(start);
  const activeUsers = (users || []).filter(
    (user) => String(user?.status || "Actif") !== "Désactivé"
  );

  const eligibleQuotes = (quotes || []).filter(isPlanningEligibleQuote);

  function quotesForCell(assigneeId, day) {
    return eligibleQuotes
      .filter((quote) => {
        const delivery = getQuoteDeliveryDate(quote);
        if (!delivery) return false;
        const sameDay =
          delivery.getFullYear() === day.getFullYear() &&
          delivery.getMonth() === day.getMonth() &&
          delivery.getDate() === day.getDate();
        if (!sameDay) return false;

        if (!assigneeId) return !quote.assignedTo;
        return String(quote.assignedTo || "") === String(assigneeId);
      })
      .sort((a, b) => String(a.number || "").localeCompare(String(b.number || "")));
  }

  const operators = activeUsers.map((user) => ({
    user,
    days: days.map((day) => ({
      date: day,
      label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      quotes: quotesForCell(user.id, day),
    })),
  }));

  const unassigned = {
    user: null,
    label: "Non assignées",
    days: days.map((day) => ({
      date: day,
      label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      quotes: quotesForCell("", day),
    })),
  };

  return {
    weekStart: start,
    weekLabel: formatWeekRangeLabel(start),
    days,
    operators,
    unassigned,
    totalDeliveries: eligibleQuotes.filter((quote) => getQuoteDeliveryDate(quote)).length,
  };
}

export function filterPlanningByOperator(planning, assigneeFilter = "all") {
  if (!planning) return planning;
  if (assigneeFilter === "all") return planning;
  if (assigneeFilter === "unassigned") {
    return {
      ...planning,
      operators: [],
    };
  }

  return {
    ...planning,
    unassigned: { ...planning.unassigned, days: planning.unassigned.days.map((day) => ({ ...day, quotes: [] })) },
    operators: planning.operators.filter(
      (entry) => String(entry.user.id) === String(assigneeFilter)
    ),
  };
}
