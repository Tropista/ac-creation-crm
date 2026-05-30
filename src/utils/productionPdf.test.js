import { describe, it, expect } from "vitest";
import {
  buildProductionSheetPdf,
  getProductionSheetFileName,
  isProductionSheetEligible,
} from "./productionPdf.js";

const sampleData = {
  clients: [{ id: "c1", name: "Client Atelier", company: "Test SARL" }],
  settings: { companyName: "AC Creation" },
};

const sampleQuote = {
  id: "q1",
  number: "DEV-2025-0042",
  status: "En production",
  clientId: "c1",
  promisedDeliveryDate: "30/05/2025",
  atelierNotes: "Urgent — client passe jeudi",
  lines: [
    {
      description: "T-shirt personnalisé",
      quantity: 10,
      taille: "L",
      couleur: "Noir",
      emplacementMarquage: "Poitrine",
      technique: "DTF",
    },
  ],
};

describe("productionPdf", () => {
  it("identifie les devis éligibles à la fiche atelier", () => {
    expect(isProductionSheetEligible({ status: "En production" })).toBe(true);
    expect(isProductionSheetEligible({ status: "Prêt" })).toBe(true);
    expect(isProductionSheetEligible({ status: "Accepté" })).toBe(false);
  });

  it("génère un nom de fichier sûr", () => {
    expect(getProductionSheetFileName({ number: "DEV-2025/0042" })).toBe(
      "fiche-atelier-DEV-2025_0042.pdf"
    );
  });

  it("produit un PDF fiche atelier sur une page", async () => {
    const pdf = buildProductionSheetPdf({ quote: sampleQuote, data: sampleData });
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(typeof pdf.output).toBe("function");
  });

  it("accepte un QR code optionnel", () => {
    const pdf = buildProductionSheetPdf({
      quote: sampleQuote,
      data: sampleData,
      qrDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(pdf.getNumberOfPages()).toBe(1);
  });
});
