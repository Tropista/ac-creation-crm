import { describe, it, expect } from "vitest";
import {
  nextDocumentNumber,
  nextInvoiceNumber,
  detectInvoiceNumberGaps,
  getInvoiceNumberSettings,
  quoteAlreadyConverted,
  isQuoteConvertible,
  convertQuoteToInvoiceData,
  isQuoteDeliveryNoteEligible,
  createDeliveryNoteFromQuote,
  getDeliveryNoteForQuote,
  createDepositInvoiceFromQuote,
  createBalanceInvoiceFromQuote,
  getQuoteDepositSummary,
  isFullInvoiceFromQuote,
  computeDepositTotals,
  resolveDocumentTaxRate,
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

  it("respecte le préfixe et le padding des paramètres facture", () => {
    const year = 2026;
    const settings = { invoiceNumberPrefix: "FAC", invoiceNumberPadding: 3 };
    expect(nextInvoiceNumber([], settings, year)).toBe("FAC-2026-001");
  });
});

describe("detectInvoiceNumberGaps", () => {
  it("liste les numéros manquants dans la série annuelle", () => {
    const year = 2026;
    const settings = { invoiceNumberPrefix: "FAC", invoiceNumberPadding: 3 };
    const invoices = [
      { number: "FAC-2026-001" },
      { number: "FAC-2026-003" },
      { number: "FAC-2026-004" },
    ];

    expect(detectInvoiceNumberGaps(invoices, settings, year)).toEqual([
      "FAC-2026-002",
    ]);
  });

  it("normalise le préfixe facture depuis les paramètres", () => {
    expect(getInvoiceNumberSettings({ invoiceNumberPrefix: "  INV  " }).prefix).toBe("INV");
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
  it("accepte un devis accepté ou en production non encore converti", () => {
    const data = baseData();

    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "Accepté" })
    ).toBe(true);
    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "En production" })
    ).toBe(true);
    expect(
      isQuoteConvertible(data, { number: "DEV-2025-0020", status: "Prêt" })
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
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.remaining).toBe(120);
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

describe("bons de livraison", () => {
  const readyQuote = {
    id: "q-bl",
    number: "DEV-2025-0100",
    status: "Prêt",
    clientId: "c1",
    lines: [
      { description: "T-shirt personnalisé", quantity: 10, sku: "TS-01" },
    ],
  };

  const base = () => ({
    ...baseData(),
    clients: [{ id: "c1", name: "Client", address: "1 rue Test" }],
    deliveryNotes: [],
  });

  it("autorise la génération pour Prêt ou Livré uniquement", () => {
    expect(isQuoteDeliveryNoteEligible({ status: "Prêt" })).toBe(true);
    expect(isQuoteDeliveryNoteEligible({ status: "Livré" })).toBe(true);
    expect(isQuoteDeliveryNoteEligible({ status: "Accepté" })).toBe(false);
  });

  it("crée un BL numéroté BL-YYYY-NNNN", () => {
    const year = new Date().getFullYear();
    const result = createDeliveryNoteFromQuote(base(), readyQuote);
    expect(result.created).toBe(true);
    expect(result.deliveryNote.number).toBe(`BL-${year}-0001`);
    expect(result.deliveryNote.quoteNumber).toBe("DEV-2025-0100");
    expect(result.deliveryNote.lines).toHaveLength(1);
    expect(getDeliveryNoteForQuote(result, readyQuote)?.id).toBe(result.deliveryNote.id);
  });
});

describe("computeDepositTotals", () => {
  it("calcule le montant et le solde d'acompte", () => {
    expect(computeDepositTotals(117, 30)).toEqual({
      depositPercent: 30,
      depositAmount: 35.1,
      balanceAfterDeposit: 81.9,
    });
  });

  it("borne le pourcentage entre 0 et 100", () => {
    expect(computeDepositTotals(100, -5).depositPercent).toBe(0);
    expect(computeDepositTotals(100, 150).depositPercent).toBe(100);
  });
});

describe("factures d'acompte", () => {
  const quote = {
    id: "q-dep",
    number: "DEV-2025-0200",
    status: "Accepté",
    clientId: "c1",
    totalHT: 100,
    taxAmount: 17,
    totalTTC: 117,
    taxRate: 17,
    lines: [{ description: "Commande textile", quantity: 1, price: 100, totalHT: 100 }],
  };

  it("crée une facture d'acompte au pourcentage demandé", () => {
    const data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    const result = createDepositInvoiceFromQuote(data, quote, 30);
    const invoice = result.invoice;

    expect(invoice.invoiceType).toBe("acompte");
    expect(invoice.depositPercent).toBe(30);
    expect(invoice.totalTTC).toBeCloseTo(35.1, 2);
    expect(invoice.remaining).toBeCloseTo(35.1, 2);
    expect(invoice.stockAdjusted).toBe(false);
    expect(invoice.convertedFrom).toBe("DEV-2025-0200");
    expect(invoice.parentQuoteId).toBe("q-dep");
  });
});

describe("factures de solde", () => {
  const quote = {
    id: "q-bal",
    number: "DEV-2025-0300",
    status: "Accepté",
    clientId: "c1",
    totalHT: 100,
    taxAmount: 17,
    totalTTC: 117,
    taxRate: 17,
    lines: [{ productId: "p1", description: "Commande", quantity: 1, price: 100, totalHT: 100 }],
  };

  it("ignore les acomptes dans quoteAlreadyConverted", () => {
    const data = {
      ...baseData(),
      invoices: [
        ...baseData().invoices,
        {
          id: "dep-1",
          number: "FAC-2025-0100",
          invoiceType: "acompte",
          convertedFrom: "DEV-2025-0300",
          parentQuoteId: "q-bal",
          totalTTC: 35.1,
        },
      ],
    };

    expect(isFullInvoiceFromQuote(data.invoices.at(-1), quote.number)).toBe(false);
  });

  it("crée une facture de solde TTC − acomptes payés", () => {
    let data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    data = createDepositInvoiceFromQuote(data, quote, 30);
    const deposit = data.invoices.at(-1);
    data = {
      ...data,
      invoices: data.invoices.map((inv) =>
        inv.id === deposit.id ? { ...inv, status: "Payée", paidAmount: inv.totalTTC, remaining: 0 } : inv
      ),
    };

    const summary = getQuoteDepositSummary(data, quote);
    expect(summary.paidDeposit).toBeCloseTo(35.1, 2);
    expect(summary.remainingBalance).toBeCloseTo(81.9, 2);
    expect(summary.canCreateBalance).toBe(true);

    const result = createBalanceInvoiceFromQuote(data, quote);
    const balance = result.invoice;

    expect(balance.invoiceType).toBe("solde");
    expect(balance.parentQuoteId).toBe("q-bal");
    expect(balance.totalTTC).toBeCloseTo(81.9, 2);
    expect(balance.stockAdjusted).toBe(true);
    expect(balance.depositPaidAmount).toBeCloseTo(35.1, 2);
  });

  it("refuse la conversion directe si un acompte existe", () => {
    let data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    data = createDepositInvoiceFromQuote(data, quote, 30);

    expect(() => convertQuoteToInvoiceData(data, quote)).toThrow(/acompte/i);
  });
});

describe("resolveDocumentTaxRate", () => {
  it("utilise le taux par défaut des paramètres", () => {
    expect(resolveDocumentTaxRate({}, { taxRate: 17 })).toBe(17);
    expect(resolveDocumentTaxRate({ taxRateOverride: "" }, { taxRate: 17 })).toBe(17);
  });

  it("applique l'override client (0 % ou personnalisé)", () => {
    expect(resolveDocumentTaxRate({ taxRateOverride: 0 }, { taxRate: 17 })).toBe(0);
    expect(resolveDocumentTaxRate({ taxRateOverride: 8 }, { taxRate: 17 })).toBe(8);
  });
});
