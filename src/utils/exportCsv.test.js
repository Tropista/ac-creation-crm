import { describe, expect, it } from "vitest";
import {
  buildMonthlyAccountingCsvRows,
  formatAccountingMonthInput,
  parseAccountingMonthInput,
  rowsToCsv,
} from "./exportCsv";

describe("exportCsv", () => {
  it("escapes cells and uses semicolon separator", () => {
    const csv = rowsToCsv(
      ["Nom", "Notes"],
      [["AC; Corp", 'Ligne "test"']]
    );

    expect(csv).toContain("Nom;Notes");
    expect(csv).toContain('"AC; Corp"');
    expect(csv).toContain('"Ligne ""test"""');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("formats and parses accounting month input", () => {
    expect(formatAccountingMonthInput(2026, 0)).toBe("2026-01");
    expect(formatAccountingMonthInput(2026, 11)).toBe("2026-12");
    expect(parseAccountingMonthInput("2026-05")).toEqual({ year: 2026, month: 4 });
    expect(parseAccountingMonthInput("invalid")).toBeNull();
  });

  it("builds monthly accounting pack with TVA recap and journals", () => {
    const data = {
      settings: { taxRate: 17 },
      clients: [{ id: "c1", name: "Client Test" }],
      invoices: [
        {
          id: "i1",
          number: "FAC-1",
          clientId: "c1",
          date: "15/05/2026",
          totalHT: 100,
          taxAmount: 17,
          totalTTC: 117,
          status: "Payée",
        },
      ],
      expenses: [
        {
          id: "e1",
          supplierName: "Fournisseur",
          purchaseDate: "10/05/2026",
          amountHT: 50,
          vatAmount: 8.5,
          totalTTC: 58.5,
          category: "Matières",
          personalAccountPurchase: true,
          paidByPerson: "Couto Da Silva Carla",
          companyReimbursementStatus: "pending",
          vatDeductionStatus: "non_deductible",
        },
      ],
    };

    const built = buildMonthlyAccountingCsvRows(data, { year: 2026, month: 4 });
    expect(built).not.toBeNull();
    expect(built.invoiceCount).toBe(1);
    expect(built.expenseCount).toBe(1);
    expect(built.rows[0][0]).toContain("Export comptable mensuel");
    expect(built.rows.some((row) => row[0] === "TVA due estimée")).toBe(true);
    expect(built.rows.some((row) => row[0] === "Journal des ventes (factures)")).toBe(
      true
    );
    expect(built.rows.some((row) => row[0] === "Journal des achats (dépenses)")).toBe(
      true
    );
    expect(built.rows.some((row) => row.includes("Compte personnel"))).toBe(true);
    expect(built.rows.some((row) => row.includes("Couto Da Silva Carla"))).toBe(true);
  });

  it("filters monthly accounting export by selected month", () => {
    const data = {
      settings: { taxRate: 17 },
      clients: [],
      invoices: [
        { id: "i1", date: "15/05/2026", totalHT: 100, taxAmount: 17, totalTTC: 117 },
        { id: "i2", date: "10/06/2026", totalHT: 200, taxAmount: 34, totalTTC: 234 },
      ],
      expenses: [],
    };

    const may = buildMonthlyAccountingCsvRows(data, { year: 2026, month: 4 });
    const june = buildMonthlyAccountingCsvRows(data, { year: 2026, month: 5 });

    expect(may.invoiceCount).toBe(1);
    expect(june.invoiceCount).toBe(1);
  });
});
