import { describe, it, expect } from "vitest";
import {
  filterProducts,
  formatProductOptionLabel,
  matchesFreeProductOption,
} from "./productPicker.js";

const products = [
  { id: "1", name: "T-shirt Blanc", category: "Textile", sku: "TS-001", price: 12.5 },
  { id: "2", name: "Mug Personnalisé", category: "Objets", sku: "MUG-42", price: 8 },
  { id: "3", name: "Autocollant", category: "Signalétique", sku: "SIG-AUTO", price: 3 },
];

describe("formatProductOptionLabel", () => {
  it("affiche catégorie, nom et prix", () => {
    const label = formatProductOptionLabel(products[0], (value) => `${value} €`);
    expect(label).toBe("Textile — T-shirt Blanc - 12.5 €");
  });

  it("omet la catégorie si absente", () => {
    const label = formatProductOptionLabel({ name: "Produit", price: 5 }, (value) => `${value} €`);
    expect(label).toBe("Produit - 5 €");
  });
});

describe("filterProducts", () => {
  it("retourne tous les produits sans filtre", () => {
    expect(filterProducts(products, "")).toHaveLength(3);
  });

  it("filtre par nom (partiel, insensible à la casse)", () => {
    expect(filterProducts(products, "mug")).toEqual([products[1]]);
  });

  it("filtre par catégorie", () => {
    expect(filterProducts(products, "textile")).toEqual([products[0]]);
  });

  it("filtre par SKU", () => {
    expect(filterProducts(products, "sig-auto")).toEqual([products[2]]);
  });
});

describe("matchesFreeProductOption", () => {
  it("affiche Produit libre sans recherche", () => {
    expect(matchesFreeProductOption("")).toBe(true);
  });

  it("matche une saisie partielle", () => {
    expect(matchesFreeProductOption("prod")).toBe(true);
    expect(matchesFreeProductOption("xyz")).toBe(false);
  });
});
