import { describe, expect, it } from "vitest";
import {
  buildOperatorCapacityPlanning,
  buildOperatorWeekPlanning,
  detectWorkshopRisks,
  estimateQuoteWorkshopMinutes,
} from "./atelierPlanning.js";

describe("atelierPlanning", () => {
  it("répartit les livraisons par opérateur et jour", () => {
    const weekStart = new Date("2025-05-26T12:00:00");
    const planning = buildOperatorWeekPlanning(
      [
        {
          id: "q1",
          number: "DEV-1",
          status: "En production",
          assignedTo: "u1",
          promisedDeliveryDate: "28/05/2025",
        },
        {
          id: "q2",
          number: "DEV-2",
          status: "Accepté",
          promisedDeliveryDate: "28/05/2025",
        },
      ],
      [{ id: "u1", name: "Marie", status: "Actif" }],
      weekStart
    );

    const marieRow = planning.operators.find((row) => row.user.id === "u1");
    const wednesday = marieRow.days.find((day) => day.quotes.some((q) => q.id === "q1"));
    expect(wednesday?.quotes).toHaveLength(1);

    const unassigned = planning.unassigned.days.find((day) =>
      day.quotes.some((q) => q.id === "q2")
    );
    expect(unassigned?.quotes).toHaveLength(1);
  });

  it("calcule la charge par opérateur et détecte les surcharges", () => {
    const weekStart = new Date("2025-05-26T12:00:00");
    const quotes = [
      {
        id: "q1",
        number: "DEV-1",
        status: "En production",
        assignedTo: "u1",
        promisedDeliveryDate: "28/05/2025",
        productionSheet: { estimatedMinutes: 180 },
      },
      {
        id: "q2",
        number: "DEV-2",
        status: "Accepté",
        promisedDeliveryDate: "29/05/2025",
        lines: [{ quantity: 5 }],
      },
    ];

    expect(estimateQuoteWorkshopMinutes(quotes[1])).toBeGreaterThan(0);

    const planning = buildOperatorCapacityPlanning(
      quotes,
      [{ id: "u1", name: "Marie", status: "Actif", weeklyCapacityHours: 2 }],
      weekStart
    );

    expect(planning.operators[0].weekMinutes).toBe(180);
    expect(planning.operators[0].overloaded).toBe(true);

    const risks = detectWorkshopRisks(quotes, [{ id: "u1", name: "Marie", weeklyCapacityHours: 2 }], weekStart);
    expect(risks.overloadedOperators).toHaveLength(1);
    expect(risks.unassignedQuotes).toHaveLength(1);
  });
});
