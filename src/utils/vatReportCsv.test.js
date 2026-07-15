import { describe, expect, it } from "vitest";
import { buildVatEcdfBoxesCsv, buildVatSourceLinesCsv } from "./vatReportCsv";
import { normalizeSavedVatReportForExport } from "./vatReportExportModel";

function report(overrides = {}) {
  return {
    tax_year: 2025,
    ecdf_form_version: "2026",
    calculation_version: "1.0.0",
    anomalies: [{ level: "error", code: "SALE_CLASSIFICATION_TO_REVIEW", sourceId: "sale:2" }],
    ecdfBoxes: [
      {
        box: "001",
        label: "Produits fabriques",
        amountCents: 123456,
        sourceIds: ["sale:1"],
      },
      {
        box: "004",
        label: "Prestations",
        amountCents: 0,
        sourceIds: [],
      },
    ],
    lines: [
      {
        type: "sale",
        date: "2025-05-01",
        number: "FAC-1",
        partner: "Client",
        country: "LU",
        description: "=test dangereux",
        htCents: 123456,
        rate: 17,
        vatCents: 20987,
        ttcCents: 144443,
        sale_tax_category: "manufactured_product",
        vatOrigin: "LU",
        ecdfBoxes: ["001", "701", "702"],
        anomalies: [],
      },
      {
        type: "expense",
        date: "2025-06-01",
        number: "ACH-1",
        partner: "Fournisseur",
        country: "DE",
        description: "Logiciel",
        htCents: 10000,
        rate: 0,
        reverseChargeVatCents: 1700,
        ttcCents: 10000,
        category: "service",
        vatOrigin: "EU",
        euTransactionType: "eu_service",
        vatDeductibility: "fully_deductible",
        deductiblePercentage: 100,
        ecdfBoxes: ["741", "742"],
        anomalies: [{ level: "warning", code: "REVERSE_CHARGE_RATE_NOT_CONFIRMED" }],
      },
    ],
    ...overrides,
  };
}

describe("vatReportCsv", () => {
  it("exporte les cases eCDF avec les en-tetes, BOM, montants et nom de fichier", () => {
    const built = buildVatEcdfBoxesCsv(report());

    expect(built.filename).toBe("cases-ecdf-tva-2025.csv");
    expect(built.headers).toEqual([
      "case",
      "intitule",
      "type",
      "montant",
      "statut",
      "nombre_lignes_sources",
      "annee_fiscale",
      "version_formulaire",
      "version_calcul",
    ]);
    expect(built.content.charCodeAt(0)).toBe(0xfeff);
    expect(built.rows[0]).toEqual([
      "001",
      "Produits fabriques",
      "base HT",
      "1234,56",
      "calcule",
      "1",
      "2025",
      "2026",
      "1.0.0",
    ]);
  });

  it("exporte les lignes sources avec anomalies concatenees et sans formule Excel texte", () => {
    const built = buildVatSourceLinesCsv(report());

    expect(built.filename).toBe("lignes-sources-tva-2025.csv");
    expect(built.headers[0]).toBe("date");
    expect(built.headers.at(-1)).toBe("anomalies");
    expect(built.rows[0][5]).toBe("'=test dangereux");
    expect(built.rows[0][6]).toBe("1234,56");
    expect(built.rows[0][16]).toBe("001|701|702");
    expect(built.rows[1][20]).toBe("REVERSE_CHARGE_RATE_NOT_CONFIRMED");
  });

  it("un rapport enregistre conserve son snapshot distinct du calcul actuel", () => {
    const saved = normalizeSavedVatReportForExport({
      tax_year: 2025,
      ecdf_form_version: "2026",
      calculation_version: "1.0.0",
      totals_json: {},
      ecdf_boxes_json: [{ box: "001", label: "Snapshot", amountCents: 5000, sourceIds: ["old"] }],
      warnings_json: [],
      source_snapshot_json: {
        lines: [
          {
            id: "old",
            type: "sale",
            date: "2025-01-01",
            document_number: "FAC-OLD",
            client_or_supplier: "Ancien client",
            amount_ht: 50,
            vat_rate: 17,
            vat_amount: 8.5,
            total_ttc: 58.5,
            category: "manufactured_product",
            ecdf_boxes: ["001"],
          },
        ],
      },
    });

    expect(buildVatEcdfBoxesCsv(saved).rows[0][3]).toBe("50,00");
    expect(buildVatSourceLinesCsv(saved).rows[0][2]).toBe("FAC-OLD");
  });
});
