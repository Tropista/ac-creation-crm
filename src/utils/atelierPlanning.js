import { ATELIER_PIPELINE_STATUSES } from "./production";
import { parseDocumentDate } from "./invoices";
import {
  formatWeekRangeLabel,
  getWeekDays,
  startOfWeekMonday,
} from "./quoteDeliveryCalendar";

const PLANNING_STATUSES = new Set(ATELIER_PIPELINE_STATUSES);
const DEFAULT_WEEKLY_CAPACITY_HOURS = 35;
const DEFAULT_TECHNIQUE_MINUTES = {
  laser: 45,
  dtf: 35,
  uvdtf: 35,
  print3d: 90,
  tshirt: 40,
  other: 30,
};

export function isPlanningEligibleQuote(quote) {
  return PLANNING_STATUSES.has(String(quote?.status || "").trim());
}

export function getQuoteDeliveryDate(quote) {
  return parseDocumentDate(quote?.promisedDeliveryDate);
}

function resolveProcessKey(quote = {}) {
  const value = String(
    quote.processType ||
      quote.productionProcess ||
      quote.productionSheet?.processType ||
      ""
  ).toLowerCase();
  if (value.includes("laser")) return "laser";
  if (value.includes("uv")) return "uvdtf";
  if (value.includes("dtf")) return "dtf";
  if (value.includes("3d")) return "print3d";
  if (value.includes("shirt") || value.includes("textile")) return "tshirt";
  return "other";
}

export function estimateQuoteWorkshopMinutes(quote = {}) {
  const sheet = quote.productionSheet || {};
  const explicit = Number(sheet.estimatedMinutes || quote.estimatedMinutes || 0);
  if (explicit > 0) return explicit;

  const processKey = resolveProcessKey(quote);
  const base = DEFAULT_TECHNIQUE_MINUTES[processKey] || DEFAULT_TECHNIQUE_MINUTES.other;
  const lineQty = (quote.lines || []).reduce(
    (sum, line) => sum + Math.max(0, Number(line.quantity || 0)),
    0
  );
  return Math.max(base, base + Math.max(0, lineQty - 1) * Math.round(base * 0.18));
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
    days: days.map((day) => {
      const cellQuotes = quotesForCell(user.id, day);
      return {
        date: day,
        label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
        quotes: cellQuotes,
        minutes: cellQuotes.reduce(
          (sum, quote) => sum + estimateQuoteWorkshopMinutes(quote),
          0
        ),
      };
    }),
  }));

  for (const row of operators) {
    row.weekMinutes = row.days.reduce((sum, day) => sum + day.minutes, 0);
  }

  const unassigned = {
    user: null,
    label: "Non assignées",
    days: days.map((day) => {
      const cellQuotes = quotesForCell("", day);
      return {
        date: day,
        label: day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
        quotes: cellQuotes,
        minutes: cellQuotes.reduce(
          (sum, quote) => sum + estimateQuoteWorkshopMinutes(quote),
          0
        ),
      };
    }),
  };
  unassigned.weekMinutes = unassigned.days.reduce((sum, day) => sum + day.minutes, 0);

  return {
    weekStart: start,
    weekLabel: formatWeekRangeLabel(start),
    days,
    operators,
    unassigned,
    totalDeliveries: eligibleQuotes.filter((quote) => getQuoteDeliveryDate(quote)).length,
  };
}

export function buildOperatorCapacityPlanning(
  quotes = [],
  users = [],
  weekStart = new Date(),
  options = {}
) {
  const planning = buildOperatorWeekPlanning(quotes, users, weekStart);
  const defaultWeeklyCapacityHours = Number(
    options.defaultWeeklyCapacityHours || DEFAULT_WEEKLY_CAPACITY_HOURS
  );

  const operators = planning.operators.map((row) => {
    const weeklyCapacityHours = Number(
      row.user.weeklyCapacityHours ||
        row.user.capacityHours ||
        defaultWeeklyCapacityHours
    );
    const capacityMinutes = Math.max(0, weeklyCapacityHours * 60);
    const loadRate =
      capacityMinutes > 0 ? Math.round((row.weekMinutes / capacityMinutes) * 1000) / 10 : 0;

    return {
      ...row,
      weeklyCapacityHours,
      capacityMinutes,
      loadRate,
      overloaded: loadRate > 100,
      remainingMinutes: Math.round((capacityMinutes - row.weekMinutes) * 100) / 100,
    };
  });

  return {
    ...planning,
    operators,
    overloadedOperators: operators.filter((row) => row.overloaded),
    totalPlannedMinutes: operators.reduce((sum, row) => sum + row.weekMinutes, 0),
    totalCapacityMinutes: operators.reduce((sum, row) => sum + row.capacityMinutes, 0),
  };
}

export function detectWorkshopRisks(quotes = [], users = [], weekStart = new Date(), options = {}) {
  const capacity = buildOperatorCapacityPlanning(quotes, users, weekStart, options);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueQuotes = (quotes || []).filter((quote) => {
    if (!isPlanningEligibleQuote(quote)) return false;
    const delivery = getQuoteDeliveryDate(quote);
    return delivery && delivery < today;
  });

  return {
    overloadedOperators: capacity.overloadedOperators,
    overdueQuotes,
    unassignedQuotes: (quotes || []).filter(
      (quote) => isPlanningEligibleQuote(quote) && !quote.assignedTo
    ),
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
    unassigned: {
      ...planning.unassigned,
      days: planning.unassigned.days.map((day) => ({ ...day, quotes: [], minutes: 0 })),
    },
    operators: planning.operators.filter(
      (entry) => String(entry.user.id) === String(assigneeFilter)
    ),
  };
}
