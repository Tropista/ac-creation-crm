import { describe, expect, it } from "vitest";
import {
  buildExpensesFromImportRows,
  mapCsvHeaders,
  matchSupplierFromList,
  parseCsvLine,
  parseCsvNumber,
  parseCsvDate,
  parseExpensesCsv,
  parseExpenseImportRow,
} from "./importExpensesCsv";

const suppliers = [
  { id: "s1", name: "AC Fournitures" },
  { id: "s2", name: "Print Shop Pro" },
];

describe("importExpensesCsv", () => {
  it("parses semicolon CSV lines with quoted values", () => {
    expect(parseCsvLine('"AC; Corp";120,50', ";")).toEqual([
      "AC; Corp",
      "120,50",
    ]);
  });

  it("maps flexible French headers", () => {
    const mapping = mapCsvHeaders([
      "Date",
      "Fournisseur",
      "Libellé",
      "Montant HT",
      "TVA",
      "Montant TTC",
    ]);

    expect(mapping.date).toBe(0);
    expect(mapping.supplier).toBe(1);
    expect(mapping.description).toBe(2);
    expect(mapping.amountHT).toBe(3);
    expect(mapping.totalTTC).toBe(5);
  });

  it("parses French numbers and dates", () => {
    expect(parseCsvNumber("1 234,56 €")).toBe(1234.56);
    expect(parseCsvDate("15/05/2026")).toBe("2026-05-15");
    expect(parseCsvDate("2026-05-15")).toBe("2026-05-15");
  });

  it("matches suppliers by fuzzy name", () => {
    const match = matchSupplierFromList("AC Fournitures", suppliers);
    expect(match.matched).toBe(true);
    expect(match.supplierId).toBe("s1");
  });

  it("computes missing amounts from TTC only", () => {
    const row = parseExpenseImportRow(
      ["2026-05-10", "Autre", "Achat", "", "", "120,00"],
      mapCsvHeaders([
        "date",
        "fournisseur",
        "description",
        "montant_ht",
        "tva",
        "montant_ttc",
      ]),
      suppliers,
      0
    );

    expect(row.valid).toBe(true);
    expect(row.totalTTC).toBe(120);
    expect(row.amountHT).toBe(120);
    expect(row.vatAmount).toBe(0);
  });

  it("parses a full CSV file with valid and invalid rows", () => {
    const csv = [
      "date;fournisseur;description;montant_ht;tva;montant_ttc",
      "15/05/2026;AC Fournitures;Papier;100;20;120",
      "2026-05-01;Print Shop Pro;Encre;50;10;60",
      "; ; ; ; ;",
      "10/05/2026;;Sans fournisseur;10;2;12",
    ].join("\n");

    const result = parseExpensesCsv(csv, suppliers);

    expect(result.fileErrors).toEqual([]);
    expect(result.validRows).toHaveLength(2);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.validRows[0].supplierMatched).toBe(true);
    expect(result.invalidRows[0].errors).toContain("Fournisseur manquant");
  });

  it("builds expense records for import", () => {
    const expenses = buildExpensesFromImportRows(
      [
        {
          supplierId: "s1",
          supplierName: "AC Fournitures",
          purchaseDate: "2026-05-15",
          invoiceNumber: "F-001",
          amountHT: 100,
          vatRate: 20,
          vatAmount: 20,
          totalTTC: 120,
          category: "Matériel",
          notes: "Papier",
        },
      ],
      { uid: () => "exp-1", now: "2026-05-15T10:00:00.000Z" }
    );

    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      id: "exp-1",
      source: "csv-import",
      supplierId: "s1",
      totalTTC: 120,
    });
  });

  it("reports missing required headers", () => {
    const result = parseExpensesCsv("libelle;montant\nTest;10", suppliers);

    expect(result.fileErrors.length).toBeGreaterThan(0);
    expect(result.validRows).toHaveLength(0);
  });
});
