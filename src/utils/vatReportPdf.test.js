import { describe, expect, it } from "vitest";
import {
  buildVatReportPdfModel,
  getVatReportPdfFileName,
} from "./vatReportPdf";
import { normalizeSavedVatReportForExport } from "./vatReportExportModel";

function report(overrides = {}) {
  return {
    tax_year: 2025,
    period: { startDate: "2025-01-01", endDate: "2025-12-31" },
    accounting_basis: "invoice",
    calculation_version: "1.0.0",
    ecdf_form_version: "2026",
    report_validation_status: "incomplete",
    is_final_balance_reliable: false,
    totals: {
      salesHTCents: 100000,
      outputVatCents: 17000,
      expensesHTCents: 20000,
      deductibleVatCents: 3400,
      balanceCents: 13600,
      foreignVatNonDeductibleCents: 1200,
    },
    ecdfBoxes: [
      { box: "001", label: "Produits fabriques", amountCents: 100000, sourceIds: ["sale:1"] },
      { box: "711", label: "Acquisitions biens UE", amountCents: 30000, sourceIds: ["expense:1"] },
      { box: "741", label: "Services UE", amountCents: 40000, sourceIds: ["expense:2"] },
      { box: "077", label: "TVA LU marchandises", amountCents: 3400, sourceIds: ["expense:3"] },
    ],
    lines: [
      {
        type: "sale",
        sale_tax_category: "manufactured_product",
        rate: 17,
        htCents: 100000,
        vatCents: 17000,
        ecdfBoxes: ["001", "701"],
      },
      {
        type: "expense",
        vatOrigin: "EU",
        euTransactionType: "eu_goods",
        category: "raw_material",
        htCents: 30000,
        reverseChargeVatCents: 5100,
        deductibleVatCents: 5100,
      },
      {
        type: "expense",
        vatOrigin: "EU",
        euTransactionType: "eu_service",
        category: "service",
        htCents: 40000,
        reverseChargeVatCents: 6800,
        deductibleVatCents: 6800,
      },
      {
        type: "expense",
        vatOrigin: "EU",
        euTransactionType: "eu_service",
        category: "service",
        partner: "Fournisseur FR",
        htCents: 10000,
        vatCents: 2000,
        foreignVatCents: 2000,
      },
    ],
    anomalies: [
      { level: "error", code: "SALE_CLASSIFICATION_TO_REVIEW", message: "Vente a classer", sourceId: "sale:2" },
      { level: "warning", code: "REVERSE_CHARGE_RATE_NOT_CONFIRMED", message: "Taux propose", sourceId: "expense:1" },
      { level: "info", code: "INFO", message: "Info", sourceId: "report" },
    ],
    ...overrides,
  };
}

describe("vatReportPdf", () => {
  it("prepare un modele PDF avec titre, annee, mention non officielle et identite", () => {
    const model = buildVatReportPdfModel({
      report: report(),
      settings: {
        companyName: "AC Creation",
        legalName: "AC Creation SARL-S",
        companyAddress: "1 rue Test",
        vatNumber: "LU12345678",
        matricule: "20251234567",
      },
      generatedAt: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(model.title).toBe("Préparation de la déclaration annuelle TVA Luxembourg - 2025");
    expect(model.notice).toContain("ne constitue pas une déclaration officielle");
    expect(model.identity).toContainEqual(["Nom légal", "AC Creation SARL-S"]);
    expect(model.identity).toContainEqual(["Formulaire eCDF", "version 2026"]);
    expect(model.status.label).toBe("Incomplet");
    expect(model.status.incompleteMessage).toContain("provisoires");
  });

  it("masque le solde si non fiable et l'affiche si fiable", () => {
    const unreliable = buildVatReportPdfModel({ report: report({ is_final_balance_reliable: false }) });
    expect(unreliable.summary.at(-1)[1]).toContain("Solde TVA non déterminé");

    const reliable = buildVatReportPdfModel({
      report: report({ is_final_balance_reliable: true, report_validation_status: "ready_for_review" }),
    });
    expect(reliable.summary.at(-1)).toEqual(["Solde TVA", "136,00 €"]);
  });

  it("garde les acquisitions UE separees des services UE et de la TVA etrangere", () => {
    const model = buildVatReportPdfModel({ report: report() });

    expect(model.sections.euGoods).toHaveLength(1);
    expect(model.sections.euGoods[0].label).toBe("Matières premières");
    expect(model.sections.euServices).toHaveLength(1);
    expect(model.sections.euServices[0].count).toBe(2);
    expect(model.sections.foreignVat).toHaveLength(1);
  });

  it("regroupe les erreurs, avertissements et informations", () => {
    const model = buildVatReportPdfModel({ report: report() });

    expect(model.sections.anomalyGroups.errors[0]).toMatchObject({
      code: "SALE_CLASSIFICATION_TO_REVIEW",
      count: 1,
    });
    expect(model.sections.anomalyGroups.warnings[0].code).toBe("REVERSE_CHARGE_RATE_NOT_CONFIRMED");
    expect(model.sections.anomalyGroups.infos[0].code).toBe("INFO");
  });

  it("nettoie le nom de fichier PDF", () => {
    expect(getVatReportPdfFileName({
      report: report(),
      settings: { companyName: "AC Création SARL-S / Luxembourg" },
    })).toBe("preparation-tva-2025-ac-creation-sarl-s-luxembourg.pdf");
  });

  it("un rapport enregistré utilise le snapshot et indique la source", () => {
    const saved = normalizeSavedVatReportForExport({
      tax_year: 2025,
      updatedAt: "2026-07-15T10:00:00.000Z",
      report_version: 3,
      totals_json: { balanceCents: 5000 },
      ecdf_boxes_json: [{ box: "001", label: "Snapshot", amountCents: 5000, sourceIds: ["old"] }],
      warnings_json: [],
      source_snapshot_json: {
        lines: [
          {
            id: "old",
            type: "sale",
            document_number: "FAC-OLD",
            amount_ht: 50,
            vat_amount: 8.5,
            total_ttc: 58.5,
            category: "manufactured_product",
          },
        ],
      },
    });
    const model = buildVatReportPdfModel({ report: saved });

    expect(model.source).toContain("rapport enregistré");
    expect(model.source).toContain("version 3");
    expect(model.ecdfBoxes[0].label).toBe("Snapshot");
  });

  it("ne contient pas d'espaces fines inseccables connus dans les textes principaux", () => {
    const model = buildVatReportPdfModel({ report: report() });
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain("\u202f");
    expect(serialized).not.toContain("\u00a0");
  });
});


