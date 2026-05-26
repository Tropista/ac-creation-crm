import { describe, expect, it } from "vitest";
import {
  allocateExpensesByProcessRevenue,
  computeProcessTypeStats,
} from "./processTypeStats.js";

describe("processTypeStats", () => {
  it("agrège le CA HT par technique", () => {
    const stats = computeProcessTypeStats([
      {
        totalHT: 100,
        lines: [{ description: "Découpe laser bois" }],
      },
      {
        totalHT: 50,
        lines: [{ description: "Transfert DTF hoodie" }],
      },
    ]);

    const laser = stats.find((entry) => entry.key === "laser");
    const dtf = stats.find((entry) => entry.key === "dtf");

    expect(laser?.revenueHT).toBe(100);
    expect(dtf?.revenueHT).toBe(50);
  });

  it("répartit les dépenses au prorata du CA", () => {
    const stats = computeProcessTypeStats([
      { totalHT: 100, lines: [{ description: "Laser" }] },
      { totalHT: 100, lines: [{ description: "DTF" }] },
    ]);
    const withMargin = allocateExpensesByProcessRevenue(stats, 40);

    expect(withMargin[0].marginHT).toBe(80);
    expect(withMargin[1].marginHT).toBe(80);
  });
});
