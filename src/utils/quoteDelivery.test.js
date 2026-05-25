import { describe, expect, it } from "vitest";
import {
  getOverdueQuotes,
  fromDateInputValue,
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
});
