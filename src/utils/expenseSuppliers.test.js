import { describe, expect, it } from "vitest";
import {
  expenseMatchesSupplier,
  getExpensesForSupplier,
  isExpenseInMonth,
  resolveSupplierForExpense,
} from "./expenseSuppliers";

const suppliers = [
  { id: "s1", name: "AC Fournitures" },
  { id: "s2", name: "Print Shop Pro" },
];

const expenses = [
  { id: "e1", supplierId: "s1", supplierName: "AC Fournitures", purchaseDate: "2026-05-10" },
  { id: "e2", supplierName: "Print Shop Pro", purchaseDate: "2026-05-15" },
  { id: "e3", supplierName: "Autre", purchaseDate: "2026-04-01" },
];

describe("expenseSuppliers", () => {
  it("matches by supplierId", () => {
    expect(expenseMatchesSupplier(expenses[0], suppliers[0])).toBe(true);
  });

  it("matches by fuzzy supplierName", () => {
    expect(expenseMatchesSupplier(expenses[1], suppliers[1])).toBe(true);
  });

  it("resolves supplier from expense", () => {
    expect(resolveSupplierForExpense(expenses[1], suppliers)?.id).toBe("s2");
  });

  it("returns linked expenses for supplier", () => {
    expect(getExpensesForSupplier(suppliers[0], expenses)).toHaveLength(1);
    expect(getExpensesForSupplier(suppliers[1], expenses)).toHaveLength(1);
  });

  it("filters expenses by month", () => {
    expect(isExpenseInMonth(expenses[0], 2026, 4)).toBe(true);
    expect(isExpenseInMonth(expenses[2], 2026, 4)).toBe(false);
  });
});
