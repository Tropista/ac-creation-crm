import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_BASIS,
  ECDF_FORM_VERSION,
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  REVERSE_CHARGE_RATE_STATUS,
  REPORT_VALIDATION_STATUS,
  SALE_TAX_CATEGORY,
  VAT_CALCULATION_VERSION,
  VAT_ANOMALY_CODES,
  VAT_DEDUCTIBILITY,
  VAT_ORIGIN,
  VAT_REVIEW_STATUS,
  buildVatDeclaration,
  canReplaceVatReport,
  calculateVatDeclaration,
  createVatReportPayload,
  getEcdfBoxSourceLines,
  getInvoiceFiscalInclusion,
} from "./vatDeclaration";

function box(report, number) {
  return report.ecdfBoxes.find((entry) => entry.box === number)?.amount || 0;
}

function makeSale(overrides = {}) {
  const totalHT = overrides.totalHT ?? 100;
  const taxRate = overrides.taxRate ?? 17;
  const taxAmount = overrides.taxAmount ?? Math.round(totalHT * taxRate) / 100;
  return {
    id: overrides.id || `inv-${taxRate}`,
    number: overrides.number || `FAC-${taxRate}`,
    date: overrides.date || "2026-05-01",
    status: overrides.status || "Non payée",
    totalHT,
    taxRate,
    taxAmount,
    totalTTC: overrides.totalTTC ?? totalHT + taxAmount,
    sale_tax_category: overrides.sale_tax_category || SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT,
    ...overrides,
  };
}

function makeExpense(overrides = {}) {
  const amountHT = overrides.amountHT ?? 100;
  const vatRate = overrides.vatRate ?? 17;
  const vatAmount = overrides.vatAmount ?? Math.round(amountHT * vatRate) / 100;
  return {
    id: overrides.id || `exp-${vatRate}`,
    supplierName: overrides.supplierName || "Fournisseur",
    invoiceNumber: overrides.invoiceNumber || `ACH-${vatRate}`,
    purchaseDate: overrides.purchaseDate || "2026-06-01",
    amountHT,
    vatRate,
    vatAmount,
    totalTTC: overrides.totalTTC ?? amountHT + vatAmount,
    vat_origin: VAT_ORIGIN.LU,
    expense_tax_category: EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE,
    eu_transaction_type: EU_TRANSACTION_TYPE.NONE,
    vat_deductibility: VAT_DEDUCTIBILITY.FULLY,
    deductible_percentage: 100,
    vat_review_status: VAT_REVIEW_STATUS.REVIEWED,
    ...overrides,
  };
}

describe("vatDeclaration", () => {
  it("calcule les ventes aux taux TVA 17, 14, 8 et 3 en centimes", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "s17", totalHT: 100, taxRate: 17, taxAmount: 17 }),
        makeSale({ id: "s14", totalHT: 200, taxRate: 14, taxAmount: 28 }),
        makeSale({ id: "s8", totalHT: 300, taxRate: 8, taxAmount: 24 }),
        makeSale({ id: "s3", totalHT: 400, taxRate: 3, taxAmount: 12 }),
      ],
    }, { year: 2026 });

    expect(report.calculation_version).toBe(VAT_CALCULATION_VERSION);
    expect(report.ecdf_form_version).toBe(ECDF_FORM_VERSION);
    expect(box(report, "701")).toBe(100);
    expect(box(report, "702")).toBe(17);
    expect(box(report, "703")).toBe(200);
    expect(box(report, "704")).toBe(28);
    expect(box(report, "705")).toBe(300);
    expect(box(report, "706")).toBe(24);
    expect(box(report, "031")).toBe(400);
    expect(box(report, "040")).toBe(12);
    expect(box(report, "103")).toBe(81);
  });

  it("detaille le resultat TVA sans melanger TVA collectee, autoliquidation et deductible", () => {
    const report = buildVatDeclaration({
      invoices: [makeSale({ id: "sale", totalHT: 100, taxAmount: 17, totalTTC: 117 })],
      expenses: [
        makeExpense({ id: "lu", amountHT: 100, vatRate: 17, vatAmount: 17, totalTTC: 117 }),
        makeExpense({
          id: "eu-goods",
          amountHT: 100,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 100,
          vat_origin: VAT_ORIGIN.EU,
          eu_transaction_type: EU_TRANSACTION_TYPE.GOODS,
          expense_tax_category: EXPENSE_TAX_CATEGORY.MERCHANDISE,
          reverse_charge_rate_status: REVERSE_CHARGE_RATE_STATUS.CONFIRMED,
        }),
        makeExpense({
          id: "eu-service",
          amountHT: 100,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 100,
          vat_origin: VAT_ORIGIN.EU,
          eu_transaction_type: EU_TRANSACTION_TYPE.SERVICE,
          expense_tax_category: EXPENSE_TAX_CATEGORY.SERVICE,
          reverse_charge_rate_status: REVERSE_CHARGE_RATE_STATUS.CONFIRMED,
        }),
      ],
    }, { year: 2026 });

    expect(report.totals.salesOutputVatCents).toBe(1700);
    expect(report.totals.reverseChargeGoodsVatCents).toBe(1700);
    expect(report.totals.reverseChargeServicesVatCents).toBe(1700);
    expect(report.totals.luDeductibleVatCents).toBe(1700);
    expect(report.totals.reverseChargeDeductibleVatCents).toBe(3400);
    expect(report.totals.previousVatReportsCents).toBe(0);
    expect(report.totals.balanceCents).toBe(0);
  });

  it("vente sans categorie => erreur bloquante et aucune affectation automatique a 001", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "uncategorized", sale_tax_category: "" }),
      ],
    }, { year: 2026 });

    expect(report.lines[0].sale_tax_category).toBe(SALE_TAX_CATEGORY.TO_REVIEW);
    expect(box(report, "001")).toBe(0);
    expect(box(report, "012")).toBe(100);
    expect(report.anomalies.some((entry) => entry.code === "SALE_CLASSIFICATION_TO_REVIEW")).toBe(true);
    expect(report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
  });

  it("affecte explicitement produit fabrique, marchandise revendue, prestation et cession immobilisation", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "made", totalHT: 100, sale_tax_category: SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT }),
        makeSale({ id: "resold", totalHT: 200, sale_tax_category: SALE_TAX_CATEGORY.RESOLD_GOODS }),
        makeSale({ id: "service", totalHT: 300, sale_tax_category: SALE_TAX_CATEGORY.SERVICE }),
        makeSale({ id: "asset-sale", totalHT: 400, sale_tax_category: SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL }),
      ],
    }, { year: 2026 });

    expect(box(report, "001")).toBe(100);
    expect(box(report, "002")).toBe(200);
    expect(box(report, "004")).toBe(300);
    expect(box(report, "005")).toBe(400);
  });

  it("accepte les alias de categorie utilises par l'interface metier", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "resale", totalHT: 200, sale_tax_category: "resale_goods" }),
        makeSale({ id: "fixed-asset", totalHT: 400, sale_tax_category: "fixed_asset_sale" }),
      ],
    }, { year: 2026 });

    expect(report.lines.map((line) => line.sale_tax_category)).toEqual([
      SALE_TAX_CATEGORY.RESOLD_GOODS,
      SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL,
    ]);
    expect(box(report, "002")).toBe(200);
    expect(box(report, "005")).toBe(400);
  });

  it("enregistre taxYear separement de la version eCDF", () => {
    const report = calculateVatDeclaration({
      data: {
        invoices: [
          makeSale({ id: "tax-year", date: "2025-05-01", sale_tax_category: SALE_TAX_CATEGORY.SERVICE }),
        ],
      },
      taxYear: 2025,
    });
    const payload = createVatReportPayload(report);

    expect(report.tax_year).toBe(2025);
    expect(report.ecdf_form_version).toBe("2026");
    expect(payload.tax_year).toBe(2025);
    expect(payload.ecdf_form_version).toBe("2026");
  });

  it("exclut les brouillons et factures annulees via une fonction centralisee", () => {
    expect(getInvoiceFiscalInclusion({ status: "Brouillon" }).included).toBe(false);
    expect(getInvoiceFiscalInclusion({ status: "Annulée" }).included).toBe(false);
    expect(getInvoiceFiscalInclusion({ status: "Payée" }).included).toBe(true);

    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "ok", status: "Payée", totalHT: 100, taxAmount: 17 }),
        makeSale({ id: "draft", status: "Brouillon", totalHT: 999, taxAmount: 169.83 }),
      ],
    }, { year: 2026 });

    expect(box(report, "701")).toBe(100);
    expect(report.excluded).toHaveLength(1);
  });

  it("documente les statuts inclus, exclus et le statut inconnu visible mais non officiel", () => {
    expect(getInvoiceFiscalInclusion({ status: "Non payée" })).toMatchObject({ included: true });
    expect(getInvoiceFiscalInclusion({ status: "Partiellement payée" })).toMatchObject({ included: true });
    expect(getInvoiceFiscalInclusion({ status: "Payée" })).toMatchObject({ included: true });
    expect(getInvoiceFiscalInclusion({ status: "En retard" })).toMatchObject({ included: true });
    expect(getInvoiceFiscalInclusion({ status: "Brouillon" })).toMatchObject({ included: false });
    expect(getInvoiceFiscalInclusion({ status: "Annulée" })).toMatchObject({ included: false });
    expect(getInvoiceFiscalInclusion({ status: "Mystère" })).toMatchObject({
      included: false,
      visible: true,
      code: "UNKNOWN_INVOICE_STATUS",
    });

    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "unknown", status: "Mystère", totalHT: 999, taxAmount: 169.83 }),
        makeSale({ id: "official", status: "Payée", totalHT: 100, taxAmount: 17 }),
      ],
    }, { year: 2026 });

    expect(report.lines.find((line) => line.sourceId === "unknown")?.officialExcluded).toBe(true);
    expect(box(report, "001")).toBe(100);
    expect(report.anomalies.some((entry) => entry.code === "UNKNOWN_INVOICE_STATUS")).toBe(true);
  });

  it("detecte une ancienne depense sans classification comme a verifier sans l'exclure", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "legacy",
          vat_origin: null,
          expense_tax_category: null,
          vat_deductibility: null,
          vat_review_status: "to_review",
        }),
      ],
    }, { year: 2026 });

    expect(report.lines).toHaveLength(1);
    expect(report.anomalies.some((entry) => entry.code === "UNREVIEWED_EXPENSE_CLASSIFICATION")).toBe(true);
    expect(report.anomalies.some((entry) => entry.message === "Classification TVA a verifier")).toBe(true);
    expect(report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
  });

  it("signale une erreur bloquante pour achat UE a 0 % sans bien/service", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "eu-missing",
          vat_origin: VAT_ORIGIN.EU,
          vatRate: 0,
          vatAmount: 0,
          eu_transaction_type: EU_TRANSACTION_TYPE.NONE,
          expense_tax_category: EXPENSE_TAX_CATEGORY.RAW_MATERIAL,
        }),
      ],
    }, { year: 2026 });

    expect(report.anomalies.some((entry) => entry.level === "error" && entry.code === "EU_ZERO_MISSING_TRANSACTION_TYPE")).toBe(true);
    expect(report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
  });

  it("calcule autoliquidation biens UE et taxe en amont marchandises", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "eu-goods",
          vat_origin: VAT_ORIGIN.EU,
          amountHT: 1000,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 1000,
          eu_transaction_type: EU_TRANSACTION_TYPE.GOODS,
          expense_tax_category: EXPENSE_TAX_CATEGORY.RAW_MATERIAL,
        }),
      ],
    }, { year: 2026 });

    expect(box(report, "711")).toBe(1000);
    expect(box(report, "712")).toBe(170);
    expect(box(report, "078")).toBe(170);
    expect(box(report, "080")).toBe(170);
    expect(box(report, "105")).toBe(0);
  });

  it("achat UE avec taux d'autoliquidation propose mais non confirme => avertissement", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "eu-suggested-rate",
          vat_origin: VAT_ORIGIN.EU,
          amountHT: 1000,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 1000,
          eu_transaction_type: EU_TRANSACTION_TYPE.GOODS,
          expense_tax_category: EXPENSE_TAX_CATEGORY.RAW_MATERIAL,
          reverse_charge_vat_rate: 17,
          reverse_charge_rate_status: REVERSE_CHARGE_RATE_STATUS.SUGGESTED,
        }),
      ],
    }, { year: 2026 });

    expect(box(report, "712")).toBe(170);
    expect(report.lines[0].reverseChargeRateStatus).toBe(REVERSE_CHARGE_RATE_STATUS.SUGGESTED);
    expect(report.anomalies.some((entry) => entry.code === "REVERSE_CHARGE_RATE_NOT_CONFIRMED")).toBe(true);
  });

  it("calcule autoliquidation service UE logiciel", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "eu-service",
          vat_origin: VAT_ORIGIN.EU,
          amountHT: 500,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 500,
          eu_transaction_type: EU_TRANSACTION_TYPE.SERVICE,
          expense_tax_category: EXPENSE_TAX_CATEGORY.SERVICE,
        }),
      ],
    }, { year: 2026 });

    expect(box(report, "741")).toBe(500);
    expect(box(report, "742")).toBe(85);
    expect(box(report, "436")).toBe(500);
    expect(box(report, "462")).toBe(85);
    expect(box(report, "404")).toBe(85);
  });

  it("classe une immobilisation UE hors annexe marchandises", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "eu-asset",
          vat_origin: VAT_ORIGIN.EU,
          amountHT: 2000,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 2000,
          eu_transaction_type: EU_TRANSACTION_TYPE.GOODS,
          expense_tax_category: EXPENSE_TAX_CATEGORY.INVESTMENT,
          is_fixed_asset: true,
          asset_name: "Laser",
        }),
      ],
    }, { year: 2026 });

    expect(box(report, "711")).toBe(2000);
    expect(box(report, "712")).toBe(340);
    expect(box(report, "082")).toBe(340);
    expect(box(report, "084")).toBe(340);
    expect(box(report, "154")).toBe(0);
  });

  it("calcule la deductibilite partielle a 50 %", () => {
    const report = buildVatDeclaration({
      expenses: [
        makeExpense({
          id: "half",
          amountHT: 100,
          vatAmount: 17,
          vat_deductibility: VAT_DEDUCTIBILITY.PARTIALLY,
          deductible_percentage: 50,
        }),
      ],
    }, { year: 2026 });

    expect(box(report, "085")).toBe(8.5);
    expect(box(report, "097")).toBe(8.5);
    expect(box(report, "104")).toBe(8.5);
  });

  it("separe la TVA etrangere non deductible sans exclure la depense HT", () => {
    const report = buildVatDeclaration({
      suppliers: [{ id: "sup-fr", name: "Prestataire FR", country_code: "FR" }],
      expenses: [
        makeExpense({
          id: "foreign-vat",
          supplierId: "sup-fr",
          supplierName: "Prestataire FR",
          vat_origin: VAT_ORIGIN.EU,
          amountHT: 343.56,
          vatRate: 20,
          vatAmount: 68.72,
          totalTTC: 412.28,
          eu_transaction_type: EU_TRANSACTION_TYPE.SERVICE,
        }),
      ],
    }, { year: 2026 });

    expect(report.totals.foreignVatNonDeductibleCents).toBe(6872);
    expect(report.anomalies.some((entry) => entry.code === "foreign_vat_not_deductible")).toBe(true);
    expect(box(report, "104")).toBe(0);
  });

  it("signale un fournisseur LU avec taux etranger", () => {
    const report = buildVatDeclaration({
      suppliers: [{ id: "sup-lu", name: "Local", country_code: "LU" }],
      expenses: [
        makeExpense({
          id: "lu-foreign-rate",
          supplierId: "sup-lu",
          vat_origin: null,
          vatRate: 20,
          vatAmount: 20,
        }),
      ],
    }, { year: 2026 });

    expect(report.anomalies.some((entry) => entry.code === "lu_supplier_foreign_rate")).toBe(true);
  });

  it("detecte les incoherences TTC et differences d'arrondis", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "round", totalHT: 0.03, taxRate: 17, taxAmount: 0.03, totalTTC: 0.06 }),
      ],
      expenses: [
        makeExpense({ id: "bad-ttc", amountHT: 100, vatAmount: 17, totalTTC: 200 }),
      ],
    }, { year: 2026 });

    expect(report.anomalies.some((entry) => entry.code === "sale_vat_rounding_difference")).toBe(true);
    expect(report.anomalies.some((entry) => entry.code === "expense_ttc_mismatch")).toBe(true);
  });

  it("retourne les lignes sources d'une case eCDF", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({ id: "a", totalHT: 100, taxRate: 17, taxAmount: 17 }),
        makeSale({ id: "b", totalHT: 50, taxRate: 8, taxAmount: 4 }),
      ],
    }, { year: 2026 });

    const lines = getEcdfBoxSourceLines(report, "701");
    expect(lines).toHaveLength(1);
    expect(lines[0].sourceId).toBe("a");
  });

  it("cree un payload de rapport avec version et empeche le remplacement silencieux d'un filed", () => {
    const report = buildVatDeclaration({
      invoices: [makeSale({ id: "payload", totalHT: 100, taxAmount: 17 })],
    }, { year: 2026 });
    const payload = createVatReportPayload(report, { created_by: "admin@example.com" });

    expect(payload.calculation_version).toBe(VAT_CALCULATION_VERSION);
    expect(payload.ecdf_form_version).toBe(ECDF_FORM_VERSION);
    expect(payload.source_snapshot_json.sources).toHaveLength(1);
    expect(canReplaceVatReport({ status: "draft" })).toBe(true);
    expect(canReplaceVatReport({ status: "filed" })).toBe(false);
  });

  it("signale le mode recettes comme dependant des paiements enregistres", () => {
    const report = buildVatDeclaration({
      invoices: [makeSale({ id: "cash", totalHT: 100, taxAmount: 17 })],
    }, { year: 2026, accounting_basis: ACCOUNTING_BASIS.CASH });

    expect(report.anomalies.some((entry) => entry.code === "cash_basis_requires_payments")).toBe(true);
  });

  it("mode recettes: une facture payee sans paiement lie est incomplète et identifie la facture", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({
          id: "bancomat-13",
          number: "FAC-BANCOMAT",
          status: "Payée",
          totalHT: 11.11,
          taxAmount: 1.89,
          totalTTC: 13,
          paidAmount: 13,
        }),
      ],
      payments: [],
    }, { year: 2026, accounting_basis: ACCOUNTING_BASIS.CASH });

    const cashError = report.anomalies.find(
      (entry) => entry.code === VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE
    );
    expect(cashError).toMatchObject({
      level: "error",
      sourceId: "sale:bancomat-13",
      status: "Payée",
    });
    expect(cashError.cashBasis).toMatchObject({
      invoiceNumber: "FAC-BANCOMAT",
      totalTtcCents: 1300,
      paymentPaidCents: 0,
      linkedPaymentCount: 0,
      reason: "Facture marquee payee ou partiellement payee sans paiement valide avec date et montant",
    });
    expect(report.lines[0]).toMatchObject({
      sourceId: "bancomat-13",
      officialExcluded: true,
    });
    expect(box(report, "012")).toBe(0);
  });

  it("mode recettes: une facture payee avec paiement recu lie est calculee", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({
          id: "cash-paid",
          number: "FAC-CASH-PAID",
          status: "Payée",
          totalHT: 100,
          taxAmount: 17,
          totalTTC: 117,
          paidAmount: 117,
        }),
      ],
      payments: [
        {
          id: "pay-1",
          invoiceId: "cash-paid",
          invoiceNumber: "FAC-CASH-PAID",
          amount: 117,
          status: "Reçu",
          date: "2026-05-12",
        },
      ],
    }, { year: 2026, accounting_basis: ACCOUNTING_BASIS.CASH });

    expect(report.anomalies.some((entry) => entry.code === VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE)).toBe(false);
    expect(box(report, "012")).toBe(100);
  });

  it("mode recettes: un paiement manuel valide sans transaction bancaire suffit", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({
          id: "manual-paid",
          number: "FAC-MANUAL",
          status: "Payée",
          totalHT: 100,
          taxAmount: 17,
          totalTTC: 117,
          paidAmount: 117,
        }),
      ],
      payments: [
        {
          id: "manual-payment",
          invoiceId: "manual-paid",
          invoiceNumber: "FAC-MANUAL",
          amount: 117,
          status: "Reçu",
          date: "2026-05-12",
          method: "Bancomat",
        },
      ],
    }, { year: 2026, accounting_basis: ACCOUNTING_BASIS.CASH });

    expect(report.anomalies.some((entry) => entry.code === VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE)).toBe(false);
    expect(box(report, "012")).toBe(100);
  });

  it("mode recettes: un paiement sans date reste incomplet", () => {
    const report = buildVatDeclaration({
      invoices: [
        makeSale({
          id: "missing-date",
          number: "FAC-NO-DATE",
          status: "Payée",
          totalHT: 100,
          taxAmount: 17,
          totalTTC: 117,
        }),
      ],
      payments: [
        {
          id: "payment-no-date",
          invoiceId: "missing-date",
          amount: 117,
          status: "Reçu",
        },
      ],
    }, { year: 2026, accounting_basis: ACCOUNTING_BASIS.CASH });

    const cashError = report.anomalies.find(
      (entry) => entry.code === VAT_ANOMALY_CODES.CASH_BASIS_PAYMENTS_INCOMPLETE
    );
    expect(cashError.cashBasis).toMatchObject({
      linkedPaymentCount: 1,
      receivedPaymentCount: 1,
      validPaymentCount: 0,
    });
    expect(box(report, "012")).toBe(0);
  });

  it("interdit ready_for_review en presence d'une vente ou depense a revoir", () => {
    const saleReport = buildVatDeclaration({
      invoices: [makeSale({ id: "sale-review", sale_tax_category: "" })],
    }, { year: 2026 });
    const expenseReport = buildVatDeclaration({
      expenses: [makeExpense({ id: "expense-review", vat_review_status: VAT_REVIEW_STATUS.TO_REVIEW })],
    }, { year: 2026 });

    expect(saleReport.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
    expect(expenseReport.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
  });
});
