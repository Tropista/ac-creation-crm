import { describe, it, expect } from "vitest";
import {
  advanceProductionStatus,
  getAtelierBoard,
  getAtelierStatusBoard,
  getNextProductionStatus,
  getProductionQueue,
  inferProcessType,
  isAtelierPipelineQuote,
  isProductionStatus,
  isQuoteInProductionQueue,
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

  it("trie les devis par statut puis date décroissante", () => {
    const quotes = [
      {
        id: "a",
        number: "DEV-10",
        status: "Prêt",
        date: "01/01/2026",
        lines: [{ description: "Laser" }],
      },
      {
        id: "b",
        number: "DEV-11",
        status: "Accepté",
        date: "05/01/2026",
        lines: [{ description: "Laser" }],
      },
      {
        id: "c",
        number: "DEV-12",
        status: "Accepté",
        date: "03/01/2026",
        lines: [{ description: "Laser" }],
      },
    ];

    const laserItems = getAtelierBoard(quotes).byProcess.find(
      (group) => group.key === "laser"
    )?.items;

    expect(laserItems.map((quote) => quote.id)).toEqual(["b", "c", "a"]);
  });

  it("regroupe la file atelier par statut", () => {
    const quotes = [
      { id: "1", number: "DEV-1", status: "Accepté", lines: [] },
      { id: "2", number: "DEV-2", status: "En production", lines: [] },
      { id: "3", number: "DEV-3", status: "Brouillon", lines: [] },
    ];

    const board = getAtelierStatusBoard(quotes);

    expect(board.total).toBe(2);
    expect(board.byStatus.find((column) => column.status === "Accepté")?.items).toHaveLength(1);
    expect(board.byStatus.find((column) => column.status === "En production")?.items).toHaveLength(1);
  });
});

describe("getProductionQueue", () => {
  it("inclut Accepté et les statuts de production uniquement", () => {
    const quotes = [
      { id: "1", status: "Accepté", lines: [{ description: "Laser" }] },
      { id: "2", status: "En production", lines: [{ description: "DTF" }] },
      { id: "3", status: "Prêt", lines: [{ description: "3D print PLA" }] },
      { id: "4", status: "Envoyé", lines: [{ description: "Laser" }] },
      { id: "5", status: "Livré", lines: [{ description: "T-shirt flex" }] },
    ];

    const queue = getProductionQueue(quotes);

    expect(queue.total).toBe(4);
    expect(queue.items.map((quote) => quote.id)).toEqual(["1", "2", "3", "5"]);
    expect(isQuoteInProductionQueue(quotes[0])).toBe(true);
    expect(isQuoteInProductionQueue(quotes[3])).toBe(false);
  });

  it("regroupe par processus et exclut le bucket other s'il est vide", () => {
    const quotes = [
      {
        id: "laser",
        status: "Accepté",
        lines: [{ description: "Gravure laser bois" }],
      },
      {
        id: "tshirt",
        status: "En production",
        lines: [{ description: "Vinyle textile" }],
      },
    ];

    const queue = getProductionQueue(quotes);
    const keys = queue.byProcess.map((group) => group.key);

    expect(keys).toContain("laser");
    expect(keys).toContain("tshirt");
    expect(keys).not.toContain("other");
  });
});

describe("inferProcessType / isProductionStatus", () => {
  it("infère le processus depuis les lignes du devis", () => {
    expect(inferProcessType({ lines: [{ description: "Film Tristar" }] }).key).toBe(
      "uvdtf"
    );
    expect(inferProcessType({ lines: [{ description: "Impression 3D PETG" }] }).key).toBe(
      "print3d"
    );
    expect(inferProcessType({ description: "Prestation diverse" }).key).toBe("other");
  });

  it("reconnaît les statuts de production", () => {
    expect(isProductionStatus("En production")).toBe(true);
    expect(isProductionStatus("Prêt")).toBe(true);
    expect(isProductionStatus("Accepté")).toBe(false);
    expect(getNextProductionStatus("En production")).toBe("Prêt");
  });
});
