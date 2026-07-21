import { describe, expect, it } from "vitest";
import {
  INVOICE_PERIOD_MODES,
  collectInvoiceYears,
  computeInvoicePeriodTotals,
  filterInvoicesByPeriod,
  formatInvoicePeriodLabel,
  isInvoiceDateInPeriod,
} from "./invoicePeriodStats";

describe("isInvoiceDateInPeriod", () => {
  it("inclut toutes les dates en mode « depuis la création »", () => {
    expect(
      isInvoiceDateInPeriod("15/05/2026", { mode: INVOICE_PERIOD_MODES.ALL })
    ).toBe(true);
    expect(
      isInvoiceDateInPeriod("", { mode: INVOICE_PERIOD_MODES.ALL })
    ).toBe(true);
  });

  it("filtre par mois au format français", () => {
    const period = { mode: INVOICE_PERIOD_MODES.MONTH, year: 2026, month: 4 };
    expect(isInvoiceDateInPeriod("15/05/2026", period)).toBe(true);
    expect(isInvoiceDateInPeriod("10/06/2026", period)).toBe(false);
    expect(isInvoiceDateInPeriod("invalid", period)).toBe(false);
  });

  it("filtre par année", () => {
    const period = { mode: INVOICE_PERIOD_MODES.YEAR, year: 2025 };
    expect(isInvoiceDateInPeriod("31/12/2025", period)).toBe(true);
    expect(isInvoiceDateInPeriod("01/01/2026", period)).toBe(false);
  });
});

describe("filterInvoicesByPeriod / computeInvoicePeriodTotals", () => {
  const invoices = [
    { id: "1", date: "15/05/2026", totalTTC: 117, paidAmount: 117, status: "Payée" },
    {
      id: "2",
      date: "10/06/2026",
      totalTTC: 234,
      paidAmount: 100,
      status: "Partiellement payée",
    },
    { id: "3", date: "01/01/2025", totalTTC: 50, paidAmount: 0, status: "Non payée" },
  ];

  it("agrège le TTC facturé et le montant payé sur la période", () => {
    const may = filterInvoicesByPeriod(invoices, {
      mode: INVOICE_PERIOD_MODES.MONTH,
      year: 2026,
      month: 4,
    });
    expect(may).toHaveLength(1);
    expect(computeInvoicePeriodTotals(may)).toEqual({
      billedTTC: 117,
      paidTTC: 117,
      unpaidTTC: 0,
      count: 1,
    });
  });

  it("calcule l'impayé sur toute la période annuelle", () => {
    const year2026 = filterInvoicesByPeriod(invoices, {
      mode: INVOICE_PERIOD_MODES.YEAR,
      year: 2026,
    });
    const totals = computeInvoicePeriodTotals(year2026);
    expect(totals.billedTTC).toBe(351);
    expect(totals.paidTTC).toBe(217);
    expect(totals.unpaidTTC).toBe(134);
    expect(totals.count).toBe(2);
  });

  it("formate le libellé de période en français", () => {
    expect(
      formatInvoicePeriodLabel({
        mode: INVOICE_PERIOD_MODES.MONTH,
        year: 2026,
        month: 4,
      })
    ).toMatch(/mai\s+2026/i);
    expect(
      formatInvoicePeriodLabel({ mode: INVOICE_PERIOD_MODES.YEAR, year: 2026 })
    ).toBe("2026");
    expect(
      formatInvoicePeriodLabel({ mode: INVOICE_PERIOD_MODES.ALL })
    ).toBe("Depuis la création");
  });
  it("additionne les restes dus reels pour le montant a encaisser", () => {
    const totals = computeInvoicePeriodTotals([
      { id: "paid", totalTTC: 100, paidAmount: 0, remaining: 999, status: "Payee" },
      { id: "partial", totalTTC: 200, paidAmount: 50, remaining: 150, status: "Partiellement payÃ©e" },
      { id: "unpaid", totalTTC: 80, paidAmount: 0, remaining: 80, status: "Non payÃ©e" },
    ]);

    expect(totals.billedTTC).toBe(380);
    expect(totals.paidTTC).toBe(150);
    expect(totals.unpaidTTC).toBe(230);
  });
});

describe("collectInvoiceYears", () => {
  it("retourne les années distinctes triées décroissant", () => {
    expect(
      collectInvoiceYears(
        [{ date: "01/03/2024" }, { date: "15/05/2026" }],
        2026
      )
    ).toEqual([2026, 2024]);
  });
});
