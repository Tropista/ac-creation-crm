import { describe, expect, it } from "vitest";
import {
  addVatWorkbookSnapshots,
  calculateVatWorkbookDeductible,
  createVatWorkbookPeriod,
  createVatWorkbookSnapshot,
  findVatWorkbookPlacement,
  getVatWorkbookDocumentCandidates,
  recommendVatWorkbookSheet,
  toVatWorkbookDate,
  updateVatWorkbookLine,
} from "./vatWorkbook";

const data = { clients: [{ id: "client", name: "Client" }], settings: { taxRate: 17 } };
const luxExpense = { id: "expense-lu", supplierName: "Fournisseur LU", invoiceNumber: "A-1", purchaseDate: "2026-01-10", amountHT: 100, vatAmount: 17, totalTTC: 117, country: "LU" };
const ueExpense = { id: "expense-eu", supplierName: "Fournisseur FR", invoiceNumber: "B-1", purchaseDate: "2026-01-11", amountHT: 200, vatAmount: 0, totalTTC: 200, country: "FR", vat_origin: "UE" };

describe("vatWorkbook", () => {
  it("place une dépense Luxembourg dans Achats_LUX sans modifier la source", () => {
    const period = createVatWorkbookPeriod({ startDate: "2026-01-01", endDate: "2026-12-31" });
    const snapshot = createVatWorkbookSnapshot(luxExpense, "expense", data);
    const result = addVatWorkbookSnapshots(period, "achatsLux", [snapshot]);
    expect(result.period.sheets.achatsLux).toHaveLength(1);
    expect(result.period.sheets.achatsLux[0].amountHT).toBe(100);
    expect(luxExpense).toMatchObject({ amountHT: 100, vatAmount: 17 });
  });

  it("recommande AIC pour une acquisition UE et empêche le doublon", () => {
    const period = createVatWorkbookPeriod();
    const snapshot = createVatWorkbookSnapshot(ueExpense, "expense", data);
    expect(recommendVatWorkbookSheet(ueExpense, "expense")).toBe("aic");
    const first = addVatWorkbookSnapshots(period, "aic", [snapshot]);
    const second = addVatWorkbookSnapshots(first.period, "aic", [snapshot]);
    expect(second.added).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
  });

  it("déplace une ligne d'une annexe vers une autre quand cela est confirmé", () => {
    const snapshot = createVatWorkbookSnapshot(luxExpense, "expense", data);
    const first = addVatWorkbookSnapshots(createVatWorkbookPeriod(), "achatsLux", [snapshot]);
    const moved = addVatWorkbookSnapshots(first.period, "aic", [snapshot], { moveExisting: true });
    expect(moved.period.sheets.achatsLux).toHaveLength(0);
    expect(findVatWorkbookPlacement(moved.period, "expense", luxExpense.id)?.sheetKey).toBe("aic");
  });

  it("modifie le snapshot et calcule la TVA déductible sans toucher à la dépense", () => {
    const snapshot = createVatWorkbookSnapshot(luxExpense, "expense", data);
    const added = addVatWorkbookSnapshots(createVatWorkbookPeriod(), "achatsLux", [snapshot]);
    const period = updateVatWorkbookLine(added.period, "achatsLux", snapshot.id, { amountHT: 120, vatAmount: 20.4 });
    expect(calculateVatWorkbookDeductible(period)).toMatchObject({ localBase: 120, localVat: 20.4, deductible: 20.4 });
    expect(luxExpense.amountHT).toBe(100);
  });
  it("propose uniquement les documents de la période et normalise les dates locales", () => {
    const period = createVatWorkbookPeriod({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const candidates = getVatWorkbookDocumentCandidates({ expenses: [
      { ...luxExpense, id: "jan-2026", purchaseDate: "15/01/2026" },
      { ...luxExpense, id: "old-2025", purchaseDate: "31/12/2025" },
    ] }, period, "expense");
    expect(toVatWorkbookDate("15/01/2026")).toBe("2026-01-15");
    expect(candidates.map((item) => item.sourceId)).toEqual(["jan-2026"]);
  });
});
