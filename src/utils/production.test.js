import { describe, it, expect } from "vitest";
import {
  advanceProductionStatus,
  getAtelierBoard,
  getNextProductionStatus,
  isAtelierPipelineQuote,
} from "./production.js";

describe("production atelier helpers", () => {
  it("détecte les devis du pipeline atelier", () => {
    expect(isAtelierPipelineQuote({ status: "Accepté" })).toBe(true);
    expect(isAtelierPipelineQuote({ status: "Livré" })).toBe(true);
    expect(isAtelierPipelineQuote({ status: "Envoyé" })).toBe(false);
  });

  it("avance le statut dans le pipeline", () => {
    expect(getNextProductionStatus("Accepté")).toBe("En production");
    expect(advanceProductionStatus("Prêt")).toBe("Livré");
    expect(advanceProductionStatus("Livré")).toBeNull();
  });

  it("regroupe la file atelier par processus", () => {
    const quotes = [
      {
        id: "1",
        number: "DEV-1",
        status: "Accepté",
        date: "01/01/2026",
        lines: [{ description: "Découpe laser acrylique" }],
      },
      {
        id: "2",
        number: "DEV-2",
        status: "En production",
        date: "02/01/2026",
        lines: [{ description: "Transfert DTF textile" }],
      },
      {
        id: "3",
        number: "DEV-3",
        status: "Brouillon",
        lines: [{ description: "Laser" }],
      },
    ];

    const board = getAtelierBoard(quotes);

    expect(board.total).toBe(2);
    expect(board.byProcess.find((group) => group.key === "laser")?.items).toHaveLength(
      1
    );
    expect(board.byProcess.find((group) => group.key === "dtf")?.items).toHaveLength(1);
  });
});
