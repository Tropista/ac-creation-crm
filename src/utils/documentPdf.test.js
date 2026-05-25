import { describe, it, expect } from "vitest";
import {
  buildDocumentPdf,
  formatPdfMoney,
  formatPdfQuantity,
  getDocumentFileName,
} from "./documentPdf.js";

const sampleData = {
  clients: [{ id: "c1", name: "Client Test", email: "test@example.com" }],
  products: [{ id: "p1", sku: "SKU-01", name: "Produit" }],
  settings: {
    companyName: "AC Creation",
    companyAddress: "1 rue Test",
    companyPhone: "0123456789",
    companyEmail: "contact@ac.test",
    vatNumber: "LU123",
    taxRate: 17,
    paymentTerms: "30 jours",
    bankInfo: "IBAN LU00 0000",
  },
};

const sampleInvoice = {
  id: "inv1",
  number: "FAC-2025-0001",
  date: "23/05/2025",
  clientId: "c1",
  status: "Non payée",
  dueDate: "22/06/2025",
  taxRate: 17,
  subtotal: 100,
  lineDiscountAmount: 0,
  globalDiscountAmount: 0,
  totalHT: 100,
  taxAmount: 17,
  totalTTC: 117,
  lines: [
    {
      productId: "p1",
      description: "Impression DTF",
      quantity: 2,
      price: 50,
      discount: 0,
      totalHT: 100,
    },
  ],
};

describe("documentPdf helpers", () => {
  it("formate les montants en français", () => {
    expect(formatPdfMoney(1234.5)).toBe("1 234,50");
  });

  it("formate les quantités", () => {
    expect(formatPdfQuantity(3)).toBe("3");
    expect(formatPdfQuantity(2.5)).toBe("2,5");
  });

  it("génère un nom de fichier sûr", () => {
    expect(getDocumentFileName({ number: "FAC-2025/0001" }, "invoice")).toBe(
      "facture-FAC-2025_0001.pdf"
    );
    expect(getDocumentFileName({ number: "DEV-2025-0002" }, "quote")).toBe(
      "devis-DEV-2025-0002.pdf"
    );
    expect(getDocumentFileName({ number: "BL-2025-0001" }, "delivery")).toBe(
      "bon-livraison-BL-2025-0001.pdf"
    );
  });
});

describe("buildDocumentPdf", () => {
  it("produit un PDF avec au moins une page", () => {
    const pdf = buildDocumentPdf({
      doc: sampleInvoice,
      type: "invoice",
      data: sampleData,
      logoDataUrl: null,
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(typeof pdf.output).toBe("function");
  });

  it("gère un devis sans échéance", () => {
    const pdf = buildDocumentPdf({
      doc: { ...sampleInvoice, number: "DEV-2025-0003", status: "Accepté" },
      type: "quote",
      data: sampleData,
      logoDataUrl: null,
    });

    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("paginate quand le tableau déborde", () => {
    const manyLines = Array.from({ length: 30 }, (_, index) => ({
      productId: "p1",
      description: `Ligne ${index + 1}`,
      quantity: 1,
      price: 10,
      discount: 0,
      totalHT: 10,
    }));

    const pdf = buildDocumentPdf({
      doc: { ...sampleInvoice, lines: manyLines, totalHT: 300, totalTTC: 351 },
      type: "invoice",
      data: sampleData,
      logoDataUrl: null,
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("produit un PDF bon de livraison", () => {
    const pdf = buildDocumentPdf({
      doc: {
        number: "BL-2025-0001",
        date: "23/05/2025",
        clientId: "c1",
        quoteNumber: "DEV-2025-0003",
        status: "Livré",
        lines: [{ sku: "TS-01", description: "T-shirt", quantity: 5 }],
      },
      type: "delivery",
      data: sampleData,
      logoDataUrl: null,
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("produit un PDF avec le style A", () => {
    const pdf = buildDocumentPdf({
      doc: sampleInvoice,
      type: "invoice",
      data: sampleData,
      logoDataUrl: null,
    });
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("garde une facture courte sur une page avec date d'émission", () => {
    const pdf = buildDocumentPdf({
      doc: {
        ...sampleInvoice,
        number: "N°61",
        date: "30/04/2026",
        status: "Payée",
        dueDate: "30/05/2026",
        subtotal: 17.09,
        totalHT: 17.09,
        taxAmount: 2.91,
        totalTTC: 20,
        paidAmount: 20,
        remaining: 0,
        lines: [
          {
            sku: "DIV-0019",
            description: "Bouteille personalisé",
            quantity: 1,
            price: 17.09,
            discount: 0,
            totalHT: 17.09,
          },
        ],
      },
      type: "invoice",
      data: sampleData,
      logoDataUrl: null,
    });

    expect(pdf.getNumberOfPages()).toBe(1);
    const pdfText = pdf.output("arraybuffer");
    expect(pdfText.byteLength).toBeGreaterThan(1000);
  });
});
