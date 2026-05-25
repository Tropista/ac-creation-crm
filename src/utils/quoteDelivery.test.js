import { describe, expect, it } from "vitest";
import {
  getOverdueQuotes,
  fromDateInputValue,
  getDeliveryUrgency,
  getQuotesToLaunchToday,
  isQuoteDeliveryOverdue,
  sortOverdueQuotes,
  toDateInputValue,
} from "./quoteDelivery.js";

describe("quoteDelivery helpers", () => {
  it("détecte une livraison en retard", () => {
    const overdue = {
      status: "En production",
      promisedDeliveryDate: "01/01/2020",
    };
    const onTime = {
      status: "En production",
      promisedDeliveryDate: "31/12/2099",
    };

    expect(isQuoteDeliveryOverdue(overdue, new Date("2026-05-25"))).toBe(true);
    expect(isQuoteDeliveryOverdue(onTime, new Date("2026-05-25"))).toBe(false);
    expect(isQuoteDeliveryOverdue({ status: "Livré", promisedDeliveryDate: "01/01/2020" })).toBe(
      false
    );
  });

  it("ignore les devis sans date promise", () => {
    expect(isQuoteDeliveryOverdue({ status: "Accepté" })).toBe(false);
  });

  it("trie les retards par date croissante", () => {
    const quotes = [
      { id: "b", number: "DEV-2", status: "Prêt", promisedDeliveryDate: "10/01/2020" },
      { id: "a", number: "DEV-1", status: "Accepté", promisedDeliveryDate: "01/01/2020" },
      { id: "c", number: "DEV-3", status: "En production", promisedDeliveryDate: "31/12/2099" },
    ];

    const overdue = sortOverdueQuotes(quotes);
    expect(overdue.map((quote) => quote.id)).toEqual(["a", "b"]);
    expect(getOverdueQuotes(quotes)).toHaveLength(2);
  });

  it("convertit les dates input ↔ fr-FR", () => {
    expect(fromDateInputValue("2026-05-25")).toBe("25/05/2026");
    expect(toDateInputValue("25/05/2026")).toBe("2026-05-25");
  });

  it("calcule l'urgence de livraison", () => {
    const ref = new Date("2026-05-25");
    expect(
      getDeliveryUrgency({ status: "Accepté", promisedDeliveryDate: "20/05/2026" }, ref)
    ).toBe("overdue");
    expect(
      getDeliveryUrgency({ status: "Accepté", promisedDeliveryDate: "25/05/2026" }, ref)
    ).toBe("today");
    expect(
      getDeliveryUrgency({ status: "Accepté", promisedDeliveryDate: "27/05/2026" }, ref)
    ).toBe("thisWeek");
    expect(
      getDeliveryUrgency({ status: "Livré", promisedDeliveryDate: "20/05/2026" }, ref)
    ).toBe(null);
  });

  it("liste les devis à lancer aujourd'hui", () => {
    const ref = new Date("2026-05-25");
    const quotes = [
      { id: "a", number: "DEV-1", status: "Accepté", promisedDeliveryDate: "25/05/2026" },
      { id: "b", number: "DEV-2", status: "Accepté", promisedDeliveryDate: "30/05/2026", priority: "urgent" },
      { id: "c", number: "DEV-3", status: "Accepté", promisedDeliveryDate: "30/05/2026", priority: "normal" },
      { id: "d", number: "DEV-4", status: "En production", promisedDeliveryDate: "25/05/2026" },
      { id: "e", number: "DEV-5", status: "Accepté", promisedDeliveryDate: "20/05/2026", priority: "normal" },
    ];

    const toLaunch = getQuotesToLaunchToday(quotes, ref);
    expect(toLaunch.map((quote) => quote.id)).toEqual(["e", "a", "b"]);
  });
});
