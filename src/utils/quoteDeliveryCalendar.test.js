import { describe, it, expect } from "vitest";
import {
  buildDeliveryWeekCalendar,
  formatWeekRangeLabel,
  getQuotesInWeekRange,
  startOfWeekMonday,
} from "./quoteDeliveryCalendar.js";

describe("quoteDeliveryCalendar", () => {
  it("calcule le lundi de la semaine", () => {
    const monday = startOfWeekMonday(new Date(2025, 4, 28)); // Wednesday
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(26);
  });

  it("formate la plage de la semaine en français", () => {
    const label = formatWeekRangeLabel(new Date(2025, 4, 26));
    expect(label).toContain("26");
    expect(label).toContain("juin");
  });

  it("regroupe les livraisons par jour", () => {
    const weekStart = new Date(2025, 4, 26);
    const referenceDate = new Date(2025, 4, 28);
    const quotes = [
      { id: "a", number: "DEV-1", status: "En production", promisedDeliveryDate: "26/05/2025" },
      { id: "b", number: "DEV-2", status: "Prêt", promisedDeliveryDate: "26/05/2025" },
      { id: "c", number: "DEV-3", status: "Livré", promisedDeliveryDate: "26/05/2025" },
    ];

    const calendar = buildDeliveryWeekCalendar(quotes, weekStart, referenceDate);
    const monday = calendar.find((day) => day.date.getDate() === 26);

    expect(monday.items).toHaveLength(2);
    expect(monday.items.some((entry) => entry.overdue)).toBe(true);
    expect(getQuotesInWeekRange(quotes, weekStart)).toHaveLength(3);
  });
});
