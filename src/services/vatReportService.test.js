import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_BASIS,
  REPORT_VALIDATION_STATUS,
  SALE_TAX_CATEGORY,
  calculateVatDeclaration,
} from "../utils/vatDeclaration";
import {
  VAT_REPORT_ERRORS,
  VAT_REPORT_STATUS,
  buildVatSourceSnapshot,
  compareVatReportToCurrent,
  createAmendedVatReport,
  createVatReport,
  markVatReportFiled,
  markVatReportReviewed,
  updateVatReport,
} from "./vatReportService";

function sale(overrides = {}) {
  return {
    id: overrides.id || "inv-1",
    number: overrides.number || "FAC-1",
    date: "2025-05-10",
    status: "Payee",
    totalHT: overrides.totalHT ?? 100,
    taxRate: 17,
    taxAmount: overrides.taxAmount ?? 17,
    totalTTC: overrides.totalTTC ?? 117,
    sale_tax_category: overrides.sale_tax_category ?? SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT,
    attachments: [{ name: "secret.pdf" }],
    ...overrides,
  };
}

function calculation(invoices = [sale()]) {
  return calculateVatDeclaration({
    taxYear: 2025,
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    accounting_basis: ACCOUNTING_BASIS.INVOICE,
    data: { invoices, expenses: [], clients: [{ id: "c1", name: "Client" }] },
  });
}

const meta = {
  taxYear: 2025,
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  accountingBasis: ACCOUNTING_BASIS.INVOICE,
  currentUser: { email: "admin@example.com" },
  now: new Date("2026-07-15T10:00:00.000Z"),
};

describe("vatReportService", () => {
  it("cree un brouillon ready_for_review sans erreur", () => {
    const outcome = createVatReport({ vatReports: [] }, calculation(), meta);

    expect(outcome.report.status).toBe(VAT_REPORT_STATUS.DRAFT);
    expect(outcome.report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.READY_FOR_REVIEW);
    expect(outcome.report.report_version).toBe(1);
  });

  it("cree un brouillon incomplete avec erreurs bloquantes", () => {
    const report = calculation([sale({ sale_tax_category: "" })]);
    const outcome = createVatReport({ vatReports: [] }, report, meta);

    expect(outcome.report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.INCOMPLETE);
  });

  it("empeche reviewed avec erreur bloquante", () => {
    const draft = createVatReport({ vatReports: [] }, calculation([sale({ sale_tax_category: "" })]), meta);

    expect(() => markVatReportReviewed(draft.data, draft.report.id, meta)).toThrow(
      "Impossible de verifier"
    );
  });

  it("passe a reviewed puis filed depuis reviewed uniquement", () => {
    const draft = createVatReport({ vatReports: [] }, calculation(), meta);
    const reviewed = markVatReportReviewed(draft.data, draft.report.id, meta);

    expect(reviewed.report.status).toBe(VAT_REPORT_STATUS.REVIEWED);
    expect(reviewed.report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.REVIEWED);

    const filed = markVatReportFiled(reviewed.data, reviewed.report.id, meta);
    expect(filed.report.status).toBe(VAT_REPORT_STATUS.FILED);
    expect(filed.report.report_validation_status).toBe(REPORT_VALIDATION_STATUS.FILED);
  });

  it("empeche filed depuis draft", () => {
    const draft = createVatReport({ vatReports: [] }, calculation(), meta);

    expect(() => markVatReportFiled(draft.data, draft.report.id, meta)).toThrow(
      "Seul un rapport verifie"
    );
  });

  it("verrouille un rapport filed et cree un amended", () => {
    const draft = createVatReport({ vatReports: [] }, calculation(), meta);
    const reviewed = markVatReportReviewed(draft.data, draft.report.id, meta);
    const filed = markVatReportFiled(reviewed.data, reviewed.report.id, meta);

    expect(() => updateVatReport(filed.data, filed.report.id, calculation(), meta)).toThrow(
      "ne peut pas etre modifie"
    );

    const amended = createAmendedVatReport(filed.data, filed.report.id, calculation([sale({ totalHT: 200, taxAmount: 34, totalTTC: 234 })]), meta);
    expect(amended.report.status).toBe(VAT_REPORT_STATUS.AMENDED);
    expect(amended.report.parent_report_id).toBe(filed.report.id);
    expect(amended.report.report_version).toBe(filed.report.report_version + 1);
    expect(amended.report.id).not.toBe(filed.report.id);
  });

  it("incremente report_version et conserve les versions moteur/formulaire", () => {
    const draft = createVatReport({ vatReports: [] }, calculation(), meta);
    const updated = updateVatReport(draft.data, draft.report.id, calculation([sale({ totalHT: 120, taxAmount: 20.4, totalTTC: 140.4 })]), meta);

    expect(updated.report.report_version).toBe(2);
    expect(updated.report.calculation_version).toBe("1.0.0");
    expect(updated.report.ecdf_form_version).toBe("2026");
  });

  it("snapshot contient les lignes utiles sans pieces jointes", () => {
    const snapshot = buildVatSourceSnapshot(calculation([sale({ id: "inv-a", number: "FAC-A" })])).snapshot;

    expect(snapshot.lines[0]).toMatchObject({
      id: "inv-a",
      type: "sale",
      document_number: "FAC-A",
      amount_ht: 100,
      vat_amount: 17,
      included_or_excluded: "included",
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret.pdf");
    expect(JSON.stringify(snapshot)).not.toContain("attachments");
  });

  it("compare lignes ajoutees, supprimees et modifiees", () => {
    const saved = createVatReport({ vatReports: [] }, calculation([sale({ id: "a" }), sale({ id: "b", totalHT: 50, taxAmount: 8.5, totalTTC: 58.5 })]), meta).report;
    const current = calculation([
      sale({ id: "a", totalHT: 150, taxAmount: 25.5, totalTTC: 175.5 }),
      sale({ id: "c", totalHT: 30, taxAmount: 5.1, totalTTC: 35.1 }),
    ]);

    const diff = compareVatReportToCurrent(current, saved);

    expect(diff.hasDifferences).toBe(true);
    expect(diff.addedLines.map((line) => line.id)).toContain("c");
    expect(diff.removedLines.map((line) => line.id)).toContain("b");
    expect(diff.modifiedLines.map((line) => line.id)).toContain("a");
  });

  it("conflit updatedAt empeche ecrasement", () => {
    const draft = createVatReport({ vatReports: [] }, calculation(), {
      ...meta,
      now: new Date("2026-07-15T10:00:00.000Z"),
    });
    const cloudChanged = {
      ...draft.data,
      vatReports: [
        {
          ...draft.report,
          updatedAt: "2026-07-15T11:00:00.000Z",
        },
      ],
    };

    let error;
    try {
      updateVatReport(cloudChanged, draft.report.id, calculation(), {
        ...meta,
        loadedUpdatedAt: "2026-07-15T10:00:00.000Z",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error.message).toContain("modifie depuis son chargement");
    expect(error.code).toBe(VAT_REPORT_ERRORS.CONFLICT);
  });
});
