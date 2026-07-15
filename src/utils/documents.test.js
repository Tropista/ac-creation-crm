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
  getDocumentFooterTotals,
  getDocumentAmountDue,
  scaleDocumentLinesByRatio,
  resolveDocumentTaxRate,
  recalculateDocumentAmounts,
  getInvoiceAmountPaid,
  getDocumentBillingDetail,
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

  it("transmet le snapshot societe du devis a la facture convertie", () => {
    const data = {
      ...baseData(),
      settings: { companyName: "Nouvelle Societe", vatNumber: "LUNEW" },
    };
    const result = convertQuoteToInvoiceData(data, {
      ...acceptedQuote,
      companySnapshot: {
        companyName: "Ancienne Societe",
        vatNumber: "LUOLD",
      },
    });
    const invoice = result.invoices.at(-1);

    expect(invoice.companySnapshot.companyName).toBe("Ancienne Societe");
    expect(invoice.companySnapshot.vatNumber).toBe("LUOLD");
  });

  it("conserve le service ou la classe concernée lors de la conversion en facture", () => {
    const data = baseData();
    const result = convertQuoteToInvoiceData(data, {
      ...acceptedQuote,
      billingDetail: "Service scolaire - Classe de Mme Dupont",
    });
    const invoice = result.invoices.at(-1);

    expect(invoice.billingDetail).toBe("Service scolaire - Classe de Mme Dupont");
    expect(getDocumentBillingDetail(invoice)).toBe("Service scolaire - Classe de Mme Dupont");
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

  it("copie le service ou la classe concernée sur le bon de livraison", () => {
    const result = createDeliveryNoteFromQuote(base(), {
      ...readyQuote,
      billingDetail: "Classe 4.2 - Ecole fondamentale de Grosbous",
    });

    expect(result.deliveryNote.billingDetail).toBe("Classe 4.2 - Ecole fondamentale de Grosbous");
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

describe("getDocumentFooterTotals / getDocumentAmountDue", () => {
  it("n'affiche pas le split acompte/solde sur une facture d'acompte", () => {
    const depositInvoice = {
      invoiceType: "acompte",
      depositPercent: 30,
      totalTTC: 540,
      totalHT: 461.54,
    };
    const footer = getDocumentFooterTotals(depositInvoice, "invoice");
    expect(footer.showQuoteDepositSplit).toBe(false);
    expect(footer.showSoldeBreakdown).toBe(false);
    expect(getDocumentAmountDue(depositInvoice, "invoice", { remaining: 540 })).toBe(540);
  });

  it("affiche le split uniquement sur le devis", () => {
    const quote = { depositPercent: 30, totalTTC: 1800 };
    const footer = getDocumentFooterTotals(quote, "quote");
    expect(footer.showQuoteDepositSplit).toBe(true);
    expect(footer.quoteDeposit.depositAmount).toBe(540);
    expect(footer.quoteDeposit.balanceAfterDeposit).toBe(1260);
    expect(getDocumentAmountDue(quote, "quote", { remaining: 1800 })).toBe(540);
  });

  it("affiche le détail devis − acomptes sur facture de solde", () => {
    const balance = {
      invoiceType: "solde",
      totalTTC: 1260,
      depositPaidAmount: 540,
    };
    const footer = getDocumentFooterTotals(balance, "invoice");
    expect(footer.showSoldeBreakdown).toBe(true);
    expect(footer.quoteTotalTTCForSolde).toBe(1800);
  });
});

describe("recalculateDocumentAmounts", () => {
  function invoiceWithLine(overrides = {}) {
    return {
      id: "fac-0011",
      number: "FAC-2026-0011",
      type: "invoice",
      status: "Non payée",
      taxRate: 17,
      globalDiscount: 0,
      paidAmount: 0,
      remaining: 3811.86,
      lines: [{ description: "Prestation", quantity: 362, price: 9 }],
      ...overrides,
    };
  }

  it("recalcule le total TTC et le reste à payer quand une facture existante est modifiée", () => {
    const original = recalculateDocumentAmounts(invoiceWithLine(), { type: "invoice" });
    expect(original.totalHT).toBe(3258);
    expect(original.taxAmount).toBe(553.86);
    expect(original.totalTTC).toBe(3811.86);
    expect(original.remaining).toBe(3811.86);
    expect(getDocumentAmountDue(original, "invoice", { remaining: original.remaining })).toBe(3811.86);

    const updated = recalculateDocumentAmounts(
      {
        ...original,
        lines: [{ description: "Prestation", quantity: 363, price: 9 }],
      },
      { type: "invoice" }
    );
    const savedToDatabase = { ...updated };

    expect(updated.totalHT).toBe(3267);
    expect(updated.taxAmount).toBe(555.39);
    expect(updated.totalTTC).toBe(3822.39);
    expect(updated.remaining).toBe(3822.39);
    expect(updated.remainingAmount).toBe(3822.39);
    expect(updated.balanceDue).toBe(3822.39);
    expect(updated.amountDue).toBe(3822.39);
    expect(getDocumentAmountDue(updated, "invoice", { remaining: updated.remaining })).toBe(3822.39);
    expect(savedToDatabase.remaining).toBe(3822.39);
  });

  it("conserve le montant déjà payé et recalcule le reste après modification", () => {
    const updated = recalculateDocumentAmounts(
      invoiceWithLine({
        paidAmount: 1000,
        remaining: 2811.86,
        lines: [{ description: "Prestation", quantity: 363, price: 9 }],
      }),
      { type: "invoice" }
    );

    expect(updated.totalTTC).toBe(3822.39);
    expect(updated.paidAmount).toBe(1000);
    expect(updated.remaining).toBe(2822.39);
    expect(getInvoiceAmountPaid(updated)).toBe(1000);
  });

  it("ne produit jamais de reste à payer négatif sur une facture déjà payée", () => {
    const updated = recalculateDocumentAmounts(
      invoiceWithLine({
        status: "Payée",
        paidAmount: 3811.86,
        remaining: 0,
        lines: [{ description: "Prestation", quantity: 100, price: 9 }],
      }),
      { type: "invoice" }
    );

    expect(updated.totalTTC).toBe(1053);
    expect(updated.remaining).toBe(0);
    expect(getDocumentAmountDue(updated, "invoice", { remaining: updated.remaining })).toBe(0);
  });

  it("recalcule correctement les remises globales dans le reste à payer", () => {
    const updated = recalculateDocumentAmounts(
      invoiceWithLine({
        globalDiscount: 10,
        paidAmount: 100,
        remaining: 0,
        lines: [{ description: "Prestation", quantity: 10, price: 100 }],
      }),
      { type: "invoice" }
    );

    expect(updated.subtotal).toBe(1000);
    expect(updated.globalDiscountAmount).toBe(100);
    expect(updated.totalHT).toBe(900);
    expect(updated.taxAmount).toBe(153);
    expect(updated.totalTTC).toBe(1053);
    expect(updated.remaining).toBe(953);
  });

  it("conserve et normalise l'information de service/classe d'un document", () => {
    const invoice = recalculateDocumentAmounts(
      invoiceWithLine({
        billingDetail: "  Maison relais  ",
      }),
      { type: "invoice" }
    );

    expect(invoice.billingDetail).toBe("  Maison relais  ");
    expect(getDocumentBillingDetail(invoice)).toBe("Maison relais");
    expect(getDocumentBillingDetail({ billingDetail: "   " })).toBe("");
  });
});

describe("scaleDocumentLinesByRatio", () => {
  it("réduit prix unitaire et total HT par ligne", () => {
    const scaled = scaleDocumentLinesByRatio(
      [{ description: "Polo XL", quantity: 100, price: 15.38, discount: 0 }],
      0.7
    );
    expect(scaled[0].price).toBeCloseTo(10.77, 2);
    expect(scaled[0].totalHT).toBeCloseTo(1077, 0);
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

  it("copie le service ou la classe concernée sur la facture d'acompte", () => {
    const data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    const result = createDepositInvoiceFromQuote(
      data,
      { ...quote, billingDetail: "Service technique" },
      30
    );

    expect(result.invoice.billingDetail).toBe("Service technique");
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

  it("copie le service ou la classe concernée sur la facture de solde", () => {
    let data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    const quoteWithBillingDetail = {
      ...quote,
      billingDetail: "Projet Schoulfest 2025-2026",
    };
    data = createDepositInvoiceFromQuote(data, quoteWithBillingDetail, 30);
    const deposit = data.invoices.at(-1);
    data = {
      ...data,
      invoices: data.invoices.map((inv) =>
        inv.id === deposit.id ? { ...inv, status: "Payée", paidAmount: inv.totalTTC, remaining: 0 } : inv
      ),
    };

    const result = createBalanceInvoiceFromQuote(data, quoteWithBillingDetail);

    expect(result.invoice.billingDetail).toBe("Projet Schoulfest 2025-2026");
  });

  it("aligne les lignes du solde sur le ratio 70 % (DEV-2026-0002)", () => {
    const quote = {
      id: "q-dev-2026-0002",
      number: "DEV-2026-0002",
      status: "Accepté",
      clientId: "c1",
      totalHT: 1538.46,
      taxAmount: 261.54,
      totalTTC: 1800,
      taxRate: 17,
      lines: [
        {
          productId: "p-polo",
          description: "Polo XL",
          quantity: 100,
          price: 15.38,
          discount: 0,
          subtotal: 1538.46,
          totalHT: 1538.46,
        },
      ],
    };

    let data = { ...baseData(), settings: { taxRate: 17, paymentDays: 30 } };
    data = createDepositInvoiceFromQuote(data, quote, 30);
    const deposit = data.invoices.at(-1);
    expect(deposit.totalTTC).toBeCloseTo(540, 2);
    expect(deposit.totalHT).toBeCloseTo(461.54, 2);
    expect(getDocumentFooterTotals(deposit, "invoice").showQuoteDepositSplit).toBe(false);

    data = {
      ...data,
      invoices: data.invoices.map((inv) =>
        inv.id === deposit.id
          ? { ...inv, status: "Payée", paidAmount: inv.totalTTC, remaining: 0 }
          : inv
      ),
    };

    const result = createBalanceInvoiceFromQuote(data, quote);
    const balance = result.invoice;
    expect(balance.totalTTC).toBeCloseTo(1260, 2);
    expect(balance.totalHT).toBeCloseTo(1076.92, 2);
    expect(balance.lines[0].price).toBeCloseTo(10.77, 2);
    expect(balance.lines[0].totalHT).toBeCloseTo(balance.totalHT, 0);
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
