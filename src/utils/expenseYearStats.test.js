import { describe, expect, it } from "vitest";
import {
  collectExpenseYears,
  computeExpenseMonthlyBreakdown,
  computeExpenseYearTotals,
  filterExpensesByYear,
  isExpenseInYear,
  parseExpenseDate,
} from "./expenseYearStats";

const expenses = [
  {
    id: "e1",
    purchaseDate: "15/05/2026",
    amountHT: 100,
    vatAmount: 17,
    totalTTC: 117,
  },
  {
    id: "e2",
    purchaseDate: "2026-06-10",
    amountHT: 200,
    vatAmount: 34,
    totalTTC: 234,
  },
  { id: "e3", purchaseDate: "01/01/2025", amountHT: 50, vatAmount: 0, totalTTC: 50 },
  { id: "e4", createdAt: "2026-05-20T10:00:00.000Z", amountHT: 10, vatAmount: 1.7, totalTTC: 11.7 },
];

describe("parseExpenseDate", () => {
  it("parse purchaseDate au format français ou ISO", () => {
    expect(parseExpenseDate(expenses[0])?.getFullYear()).toBe(2026);
    expect(parseExpenseDate(expenses[0])?.getMonth()).toBe(4);
    expect(parseExpenseDate(expenses[1])?.getMonth()).toBe(5);
  });

  it("retombe sur createdAt si purchaseDate absent", () => {
    expect(parseExpenseDate(expenses[3])?.getFullYear()).toBe(2026);
  });
});

describe("isExpenseInYear / filterExpensesByYear", () => {
  it("filtre par année", () => {
    expect(isExpenseInYear(expenses[0], 2026)).toBe(true);
    expect(isExpenseInYear(expenses[2], 2026)).toBe(false);
    expect(filterExpensesByYear(expenses, 2026)).toHaveLength(3);
    expect(filterExpensesByYear(expenses, 2025)).toHaveLength(1);
  });
});

describe("computeExpenseYearTotals", () => {
  it("agrège HT, TVA et TTC", () => {
    const year2026 = filterExpensesByYear(expenses, 2026);
    expect(computeExpenseYearTotals(year2026)).toEqual({
      count: 3,
      ht: 310,
      vat: 52.7,
      ttc: 362.7,
    });
  });
});

describe("computeExpenseMonthlyBreakdown", () => {
  it("répartit les montants par mois", () => {
    const breakdown = computeExpenseMonthlyBreakdown(expenses, 2026);
    expect(breakdown[4].count).toBe(2);
    expect(breakdown[4].ht).toBe(110);
    expect(breakdown[5].count).toBe(1);
    expect(breakdown[5].ttc).toBe(234);
    expect(breakdown[0].count).toBe(0);
  });
});

describe("collectExpenseYears", () => {
  it("retourne les années distinctes triées décroissant", () => {
    expect(collectExpenseYears(expenses, 2026)).toEqual([2026, 2025]);
  });
});
