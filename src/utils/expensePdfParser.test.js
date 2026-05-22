import { describe, it, expect } from "vitest";
import {
  isPartialExpenseExtraction,
  parseAmount,
  parseExpenseFromText,
} from "./expensePdfParser.js";

describe("parseAmount", () => {
  it("parse les montants au format français", () => {
    expect(parseAmount("1 234,56")).toBe(1234.56);
    expect(parseAmount("117,00 €")).toBe(117);
    expect(parseAmount("17.50")).toBe(17.5);
  });
});

describe("parseExpenseFromText", () => {
  it("extrait HT, TVA et TTC d'une facture luxembourgeoise", () => {
    const text = `
      AC Fournitures SARL
      Facture n° FAC-2025-0042
      Date : 15/03/2025

      Total HT 100,00
      TVA 17% 17,00
      Total TTC 117,00 EUR
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toContain("AC Fournitures");
    expect(result.invoiceNumber).toBe("FAC-2025-0042");
    expect(result.purchaseDate).toBe("2025-03-15");
    expect(result.amountHT).toBe(100);
    expect(result.vatRate).toBe(17);
    expect(result.vatAmount).toBe(17);
    expect(result.totalTTC).toBe(117);
    expect(result.extractionSuccess).toBe(true);
  });

  it("déduit le HT à partir du TTC et du taux TVA", () => {
    const text = `
      Papeterie Dupont
      FACT-2024-99
      01-12-2024
      Montant TTC 234,00
      TVA (17%)
    `;

    const result = parseExpenseFromText(text);

    expect(result.invoiceNumber).toBe("FACT-2024-99");
    expect(result.purchaseDate).toBe("2024-12-01");
    expect(result.totalTTC).toBe(234);
    expect(result.vatRate).toBe(17);
    expect(result.amountHT).toBeCloseTo(200, 0);
    expect(result.extractionSuccess).toBe(true);
  });

  it("retourne un formulaire vide si le texte est illisible", () => {
    const result = parseExpenseFromText("   ");

    expect(result.supplierName).toBe("");
    expect(result.invoiceNumber).toBe("");
    expect(result.purchaseDate).toBe("");
    expect(result.extractionSuccess).toBe(false);
  });

  it("extrait la date avec Date de facture et format point", () => {
    const text = `
      Imprimerie Centrale S.A.
      Date de facture 22.05.2026
      Total TTC 59,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toContain("Imprimerie Centrale");
    expect(result.purchaseDate).toBe("2026-05-22");
  });

  it("extrait la date ISO et Date d'émission", () => {
    const text = `
      Tech Solutions GmbH
      Date d'émission : 2026-05-22
      Total HT 200,00
      Total TTC 234,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toContain("Tech Solutions");
    expect(result.purchaseDate).toBe("2026-05-22");
  });

  it("préfère la date étiquetée quand plusieurs dates sont présentes", () => {
    const text = `
      Fournisseur: Bureau Express SARL
      Échéance 01/01/2020
      Facturé le 22-05-2026
      Total TTC 100,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toContain("Bureau Express");
    expect(result.purchaseDate).toBe("2026-05-22");
  });

  it("choisit la date la plus récente sans étiquette explicite", () => {
    const text = `
      Stationery Plus SA
      Période du 01/01/2024 au 31/12/2024
      Livraison le 15/06/2025
      Total TTC 50,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.purchaseDate).toBe("2025-06-15");
  });

  it("extrait le fournisseur via Vendeur et Émetteur", () => {
    expect(
      parseExpenseFromText(`
        Vendeur : Atelier Graphique SARL
        Date : 10/04/2025
        Total TTC 80,00
      `).supplierName
    ).toContain("Atelier Graphique");

    expect(
      parseExpenseFromText(`
        Émetteur - Media Print SA
        Emission 12/08/2025
        Total TTC 120,00
      `).supplierName
    ).toContain("Media Print");
  });

  it("extrait le fournisseur via De : et Société", () => {
    expect(
      parseExpenseFromText(`
        De : Ac Création SARL
        Facturé à Mon Client SPRL
        Date : 05/02/2025
        Total TTC 300,00
      `).supplierName
    ).toBe("Ac Création SARL");

    expect(
      parseExpenseFromText(`
        Société : Luxembourg Supplies S.à r.l.
        Date de facture 01/03/2025
        Total TTC 150,00
      `).supplierName
    ).toContain("Luxembourg Supplies");
  });

  it("ignore le bloc Facturé à et les lignes d'adresse LU", () => {
    const text = `
      Ac Création SARL
      12 rue des Artisans
      L-1234 Luxembourg
      TVA LU12345678
      contact@accreation.lu
      Facturé à
      Mon Entreprise SPRL
      5 avenue de la Gare
      L-9999 Luxembourg
      Date : 22/05/2026
      Total TTC 117,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toBe("Ac Création SARL");
    expect(result.supplierName).not.toContain("Mon Entreprise");
    expect(result.purchaseDate).toBe("2026-05-22");
  });

  it("ignore les lignes email, téléphone et web pour le fournisseur", () => {
    const text = `
      www.fournisseur.lu
      info@shop.lu
      Tel. +352 26 12 34 56
      Print House SARL
      Date : 18/09/2025
      Total TTC 45,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toBe("Print House SARL");
  });

  it("extrait une facture APEGD-like avec en-tête association", () => {
    const text = `
      APEGD
      Association des Professionnels
      6 boulevard Grande-Duchesse Charlotte
      L-1330 Luxembourg
      FACTURE
      N° 28
      Date : 22/05/2025
      Total HT 256,41
      TVA 17% 43,59
      Total TTC 300,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toContain("Association");
    expect(result.invoiceNumber).toBe("28");
    expect(result.purchaseDate).toBe("2025-05-22");
    expect(result.amountHT).toBe(256.41);
    expect(result.vatRate).toBe(17);
    expect(result.vatAmount).toBe(43.59);
    expect(result.totalTTC).toBe(300);
    expect(result.extractionSuccess).toBe(true);
  });

  it("ne confond pas FACTURE avec le numéro de facture ou le fournisseur", () => {
    const text = `
      FACTURE
      Total HT 256,41
      TVA 17% 43,59
      Total TTC 300,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.supplierName).toBe("");
    expect(result.invoiceNumber).toBe("");
    expect(result.totalTTC).toBe(300);
  });

  it("utilise la date de secours metadata si aucune date dans le texte", () => {
    const text = `
      Fournisseur Test SARL
      Total TTC 100,00
    `;

    const result = parseExpenseFromText(text, { fallbackDate: "2025-03-10" });

    expect(result.purchaseDate).toBe("2025-03-10");
  });

  it("extrait la date en français littéral", () => {
    const text = `
      Media Print SA
      Date de facture 22 mai 2025
      Total TTC 80,00
    `;

    const result = parseExpenseFromText(text);

    expect(result.purchaseDate).toBe("2025-05-22");
  });
});

describe("isPartialExpenseExtraction", () => {
  it("signale une extraction partielle sans fournisseur ou date", () => {
    expect(
      isPartialExpenseExtraction({
        extractionSuccess: true,
        supplierName: "",
        purchaseDate: "2025-01-01",
        totalTTC: 100,
        amountHT: "",
        vatAmount: "",
      })
    ).toBe(true);

    expect(
      isPartialExpenseExtraction({
        extractionSuccess: true,
        supplierName: "Test SARL",
        purchaseDate: "",
        totalTTC: 100,
        amountHT: "",
        vatAmount: "",
      })
    ).toBe(true);

    expect(
      isPartialExpenseExtraction({
        extractionSuccess: true,
        supplierName: "Test SARL",
        purchaseDate: "2025-01-01",
        totalTTC: 100,
        amountHT: "",
        vatAmount: "",
      })
    ).toBe(false);
  });
});
