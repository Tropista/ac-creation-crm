import { describe, expect, it } from "vitest";
import { buildOperatorWeekPlanning } from "./atelierPlanning.js";

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
});
