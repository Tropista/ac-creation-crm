import { describe, it, expect } from "vitest";
import {
  applyStockByLines,
  buildAdvancedStockRows,
  buildSupplierReorderGroups,
  countLowStockByKind,
  createSupplierPurchaseOrderDraft,
  getReservedProductQuantities,
  getLowStockProductsByKind,
  isBlankProduct,
  isConsumableProduct,
} from "./stock.js";

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

describe("stock avancé", () => {
  it("calcule les réservations issues des devis acceptés", () => {
    const reserved = getReservedProductQuantities([
      {
        id: "q1",
        number: "DEV-1",
        status: "Accepté",
        lines: [{ productId: "p1", quantity: 3 }],
      },
      {
        id: "q2",
        number: "DEV-2",
        status: "Brouillon",
        lines: [{ productId: "p1", quantity: 10 }],
      },
    ]);

    expect(reserved.get("p1").quantity).toBe(3);
    expect(reserved.get("p1").quotes[0].number).toBe("DEV-1");
  });

  it("génère les lignes de réassort par fournisseur selon le disponible réel", () => {
    const rows = buildAdvancedStockRows(
      [{ id: "p1", name: "T-shirt blanc", stock: 5, stockMin: 4, supplier: "Textiles SA" }],
      [{ id: "q1", status: "Accepté", lines: [{ productId: "p1", quantity: 3 }] }],
      [{ id: "s1", name: "Textiles SA", email: "stock@example.com" }]
    );

    expect(rows[0].availableStock).toBe(2);
    expect(rows[0].reorderQty).toBe(6);

    const groups = buildSupplierReorderGroups(
      rows.map((row) => row.product),
      [{ id: "s1", name: "Textiles SA", email: "stock@example.com" }],
      [{ id: "q1", status: "Accepté", lines: [{ productId: "p1", quantity: 3 }] }]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].totalSuggestedQty).toBe(6);

    const draft = createSupplierPurchaseOrderDraft(groups[0], { companyName: "AC" });
    expect(draft.subject).toContain("AC");
    expect(draft.body).toContain("T-shirt blanc");
  });
  it("utilise le fournisseur principal, le prix fournisseur et le délai moyen", () => {
    const suppliers = [{
      id: "s1",
      name: "Textiles SA",
      email: "stock@example.com",
      productLinks: [{
        id: "l1",
        name: "T-shirt blanc",
        purchasePriceHT: 4,
        supplierSku: "TS-BL",
        leadTimeDays: 5,
      }],
    }];
    const quotes = [{ id: "q1", status: "Accepté", lines: [{ productId: "p1", quantity: 3 }] }];
    const products = [{ id: "p1", name: "T-shirt blanc", stock: 5, stockMin: 4, supplierId: "s1" }];

    const rows = buildAdvancedStockRows(products, quotes, suppliers);
    expect(rows[0].supplierName).toBe("Textiles SA");
    expect(rows[0].supplierPurchasePriceHT).toBe(4);
    expect(rows[0].supplierLeadTimeDays).toBe(5);
    expect(rows[0].reorderCostHT).toBe(24);

    const groups = buildSupplierReorderGroups(products, suppliers, quotes);
    expect(groups[0].totalCostHT).toBe(24);
    expect(groups[0].maxLeadTimeDays).toBe(5);

    const draft = createSupplierPurchaseOrderDraft(groups[0], { companyName: "AC" });
    expect(draft.body).toContain("TS-BL");
    expect(draft.body).toContain("Total");
    expect(draft.body).toContain("5 jour");
  });
});

describe("stock consommables", () => {
  const settings = { consumablesStock: ["film-1"] };
  const products = [
    { id: "p1", name: "T-shirt", category: "Textile", stock: 5, stockMin: 10 },
    { id: "film-1", name: "Film DTF", category: "Autre", stock: 2, stockMin: 5 },
    { id: "c1", name: "Encre DTF", category: "Consommable", stock: 1, stockMin: 3 },
  ];

  it("détecte les consommables par catégorie ou liste paramètres", () => {
    expect(isConsumableProduct(products[0], settings)).toBe(false);
    expect(isConsumableProduct(products[1], settings)).toBe(true);
    expect(isConsumableProduct(products[2], settings)).toBe(true);
    expect(isBlankProduct(products[0], settings)).toBe(true);
  });

  it("filtre les alertes stock par type", () => {
    expect(countLowStockByKind(products, "blank", settings)).toBe(1);
    expect(countLowStockByKind(products, "consumable", settings)).toBe(2);
    expect(getLowStockProductsByKind(products, "consumable", 8, settings)).toHaveLength(2);
  });
});
