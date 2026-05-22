import { describe, it, expect } from "vitest";
import { applyStockByLines } from "./stock.js";

const products = () => [
  { id: "p1", name: "Filament PLA", stock: 20 },
  { id: "p2", name: "Résine", stock: 8 },
  { id: "p3", name: "Emballage", stock: 100 },
];

describe("applyStockByLines", () => {
  const lines = [
    { productId: "p1", quantity: 4 },
    { productId: "p2", quantity: 2 },
    { productId: "p2", quantity: 1 },
  ];

  it("décrémente le stock en mode remove (vente facture)", () => {
    const result = applyStockByLines(products(), lines, "remove", {
      type: "invoice",
      reason: "Vente facture",
      reference: "FAC-2025-0010",
    });

    expect(result.find((p) => p.id === "p1").stock).toBe(16);
    expect(result.find((p) => p.id === "p2").stock).toBe(5);
    expect(result.find((p) => p.id === "p3").stock).toBe(100);
  });

  it("restitue le stock en mode add (annulation ou correction)", () => {
    const stocked = [
      { id: "p1", stock: 16 },
      { id: "p2", stock: 5 },
    ];

    const result = applyStockByLines(stocked, lines, "add", {
      type: "invoice",
      reference: "FAC-2025-0010",
    });

    expect(result.find((p) => p.id === "p1").stock).toBe(20);
    expect(result.find((p) => p.id === "p2").stock).toBe(8);
  });

  it("agrège les quantités de plusieurs lignes pour un même produit", () => {
    const singleProduct = [{ id: "p2", stock: 10 }];
    const multiLines = [
      { productId: "p2", quantity: 2 },
      { productId: "p2", quantity: 3 },
    ];

    const result = applyStockByLines(singleProduct, multiLines, "remove");

    expect(result[0].stock).toBe(5);
    expect(result[0].stockMovements[0].quantity).toBe(5);
  });

  it("ne descend jamais le stock en dessous de zéro", () => {
    const lowStock = [{ id: "p1", stock: 2 }];
    const result = applyStockByLines(
      lowStock,
      [{ productId: "p1", quantity: 10 }],
      "remove"
    );

    expect(result[0].stock).toBe(0);
    expect(result[0].stockMovements[0].nextStock).toBe(0);
  });

  it("ignore les lignes sans productId ou avec quantité nulle", () => {
    const result = applyStockByLines(
      products(),
      [
        { productId: "", quantity: 5 },
        { productId: "p1", quantity: 0 },
        { label: "Service", quantity: 1 },
      ],
      "remove"
    );

    expect(result).toEqual(products());
  });

  it("accepte des identifiants produit en chaîne ou en nombre", () => {
    const numericIds = [{ id: 42, stock: 10 }];
    const result = applyStockByLines(
      numericIds,
      [{ productId: "42", quantity: 3 }],
      "remove"
    );

    expect(result[0].stock).toBe(7);
  });
});
