import { describe, it, expect } from "vitest";
import {
  nextDocumentNumber,
  quoteAlreadyConverted,
  isQuoteConvertible,
  convertQuoteToInvoiceData,
} from "./documents.js";

const baseData = () => ({
  clients: [],
  products: [
    { id: "p1", name: "Produit A", stock: 10 },
    { id: "p2", name: "Produit B", stock: 5 },
  ],
  invoices: [
    { number: "FAC-2025-0001" },
    { number: "FAC-2025-0003", convertedFrom: "DEV-2025-0010" },
  ],
  quotes: [],
});

describe("nextDocumentNumber", () => {
  it("incrémente le dernier numéro de l'année courante", () => {
    const year = new Date().getFullYear();
    const list = [
      { number: `FAC-${year}-0001` },
      { number: `FAC-${year}-0005` },
      { number: `FAC-${year - 1}-0099` },
    ];

    expect(nextDocumentNumber(list, "FAC", year)).toBe(`FAC-${year}-0006`);
  });

  it("commence à 0001 si aucun document de l'année", () => {
    const year = 2025;
    expect(nextDocumentNumber([], "DEV", year)).toBe("DEV-2025-0001");
  });
});

describe("quoteAlreadyConverted", () => {
  it("détecte une facture issue du devis", () => {
    const data = baseData();
    const quote = { number: "DEV-2025-0010" };

    expect(quoteAlreadyConverted(data, quote)).toBe(true);
  });

  it("retourne false si le devis n'a pas encore été converti", () => {
    const data = baseData();
    const quote = { number: "DEV-2025-0099" };

    expect(quoteAlreadyConverted(data, quote)).toBe(false);
    expect(quoteAlreadyConverted(data, {})).toBe(false);
  });
});

describe("isQuoteConvertible", () => {
  it("accepte uniquement un devis au statut Accepté non encore converti", () => {
    const data = baseData();

    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "Accepté" })
    ).toBe(true);
    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0010", status: "Accepté" })
    ).toBe(false);
    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "En attente" })
    ).toBe(false);
    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "Refusé" })
    ).toBe(false);
  });
});

describe("convertQuoteToInvoiceData", () => {
  const acceptedQuote = {
    id: "q1",
    number: "DEV-2025-0050",
    status: "Accepté",
    clientId: "c1",
    totalTTC: 120,
    lines: [
      { productId: "p1", quantity: 3, label: "Produit A" },
      { productId: "p2", quantity: 1, label: "Produit B" },
    ],
  };

  it("crée une facture non payée liée au devis et décrémente le stock", () => {
    const data = baseData();
    const result = convertQuoteToInvoiceData(data, acceptedQuote);

    expect(result.invoices).toHaveLength(3);
    const invoice = result.invoices.at(-1);

    expect(invoice.status).toBe("Non payée");
    expect(invoice.stockAdjusted).toBe(true);
    expect(invoice.convertedFrom).toBe("DEV-2025-0050");
    expect(invoice.id).toBeTruthy();
    expect(invoice.id).not.toBe(acceptedQuote.id);
    expect(invoice.number).toMatch(/^FAC-\d{4}-\d{4}$/);

    const p1 = result.products.find((p) => p.id === "p1");
    const p2 = result.products.find((p) => p.id === "p2");
    expect(p1.stock).toBe(7);
    expect(p2.stock).toBe(4);
  });

  it("enregistre un mouvement de stock pour chaque produit concerné", () => {
    const data = baseData();
    const result = convertQuoteToInvoiceData(data, acceptedQuote);
    const invoice = result.invoices.at(-1);

    const p1 = result.products.find((p) => p.id === "p1");
    expect(p1.stockMovements).toHaveLength(1);
    expect(p1.stockMovements[0]).toMatchObject({
      type: "invoice",
      quantity: 3,
      previousStock: 10,
      nextStock: 7,
      reference: invoice.number,
      reason: "Conversion devis en facture",
    });
  });

  it("conserve les lignes et métadonnées du devis sur la facture", () => {
    const data = baseData();
    const result = convertQuoteToInvoiceData(data, acceptedQuote);
    const invoice = result.invoices.at(-1);

    expect(invoice.lines).toEqual(acceptedQuote.lines);
    expect(invoice.clientId).toBe("c1");
    expect(invoice.totalTTC).toBe(120);
  });

  it("n'altère pas les produits sans ligne correspondante", () => {
    const data = {
      ...baseData(),
      products: [
        { id: "p1", name: "Produit A", stock: 10 },
        { id: "p3", name: "Produit C", stock: 20 },
      ],
    };
    const quote = {
      ...acceptedQuote,
      lines: [{ productId: "p1", quantity: 2 }],
    };

    const result = convertQuoteToInvoiceData(data, quote);
    const p3 = result.products.find((p) => p.id === "p3");

    expect(p3.stock).toBe(20);
    expect(p3.stockMovements).toBeUndefined();
  });
});
