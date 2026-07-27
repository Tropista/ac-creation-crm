import { describe, expect, it } from "vitest";
import { buildFinancialPerformance, FINANCIAL_PERIOD_MODES } from "./financialPerformance";

const invoice = (id, date, totalHT, overrides = {}) => ({
  id,
  date,
  totalHT,
  totalTTC: totalHT * 1.17,
  clientId: overrides.clientId || "client-1",
  lines: overrides.lines || [{ productId: "product-1", description: "DTF", technique: "DTF", quantity: 1, price: totalHT }],
  ...overrides,
});

const expense = (id, purchaseDate, amountHT) => ({ id, purchaseDate, amountHT });

const baseData = {
  clients: [{ id: "client-1", name: "Client fidèle" }],
  products: [{ id: "product-1", name: "Produit DTF", purchasePrice: 25 }],
  settings: { taxRate: 17, monthlyRevenueGoal: 5000 },
  invoices: [
    invoice("jan", "15/01/2026", 100),
    invoice("feb", "15/02/2026", 300, { lines: [{ productId: "product-1", description: "Laser", technique: "Laser", quantity: 2, price: 150 }] }),
    invoice("old", "15/02/2025", 120),
    invoice("cancelled", "19/02/2026", 400, { status: "Annulée" }),
  ],
  expenses: [
    expense("jan-expense", "2026-01-20", 40),
    expense("feb-expense", "2026-02-20", 90),
    expense("old-expense", "2025-02-20", 30),
  ],
};

function calculate(period, data = baseData, referenceDate = new Date(2026, 2, 15)) {
  return buildFinancialPerformance(data, { period, referenceDate });
}

describe("buildFinancialPerformance", () => {
  it("calcule le résultat HT mensuel à partir du CA et des dépenses HT", () => {
    const report = calculate({ mode: FINANCIAL_PERIOD_MODES.MONTH, year: 2026, month: 0 });

    expect(report.selected).toMatchObject({ revenueHT: 100, expensesHT: 40, resultHT: 60, marginRate: 60 });
    expect(report.selected.invoiceCount).toBe(1);
  });

  it("calcule le résultat annuel et son évolution sans inclure les factures annulées", () => {
    const report = calculate({ mode: FINANCIAL_PERIOD_MODES.YEAR, year: 2026 });

    expect(report.annual).toMatchObject({ revenueHT: 400, expensesHT: 130, resultHT: 270 });
    expect(report.previousAnnual).toMatchObject({ revenueHT: 120, expensesHT: 30, resultHT: 90 });
    expect(report.annualResultDeltaHT).toBe(180);
  });

  it("construit les douze points du graphique avec un résultat positif ou négatif", () => {
    const report = calculate({ mode: FINANCIAL_PERIOD_MODES.YEAR, year: 2026 });

    expect(report.monthly).toHaveLength(12);
    expect(report.monthly[0]).toMatchObject({ revenueHT: 100, expensesHT: 40, resultHT: 60 });
    expect(report.monthly[1]).toMatchObject({ revenueHT: 300, expensesHT: 90, resultHT: 210 });
  });

  it("projette l'année à partir de la moyenne des mois écoulés", () => {
    const report = calculate({ mode: FINANCIAL_PERIOD_MODES.YEAR, year: 2026 });

    expect(report.forecast).toMatchObject({ averageRevenueHT: 133.33, projectedRevenueHT: 1600, projectedResultHT: 1080 });
  });

  it("calcule l'objectif mensuel depuis les paramètres de la société", () => {
    const report = calculate({ mode: FINANCIAL_PERIOD_MODES.MONTH, year: 2026, month: 1 });

    expect(report.monthlyGoal).toEqual({ targetHT: 5000, revenueHT: 300, progress: 6 });
  });

  it("applique les filtres mois, année et depuis la création", () => {
    expect(calculate({ mode: FINANCIAL_PERIOD_MODES.MONTH, year: 2026, month: 1 }).selected.revenueHT).toBe(300);
    expect(calculate({ mode: FINANCIAL_PERIOD_MODES.YEAR, year: 2026 }).selected.revenueHT).toBe(400);
    expect(calculate({ mode: FINANCIAL_PERIOD_MODES.ALL }).selected.revenueHT).toBe(520);
  });

  it("produit les alertes de rentabilité et les classements technique, client et produit", () => {
    const report = calculate(
      { mode: FINANCIAL_PERIOD_MODES.MONTH, year: 2026, month: 1 },
      { ...baseData, expenses: [...baseData.expenses, expense("high", "2026-02-25", 260)] }
    );

    expect(report.alerts.map((alert) => alert.type)).toEqual(expect.arrayContaining(["expenses_over_revenue", "negative_result"]));
    expect(report.techniquePerformance[0]).toMatchObject({ name: "Laser CO2", revenueHT: 300 });
    expect(report.clientPerformance[0]).toMatchObject({ name: "Client fidèle", revenueHT: 300 });
    expect(report.productPerformance[0]).toMatchObject({ name: "Produit DTF", revenueHT: 300, costHT: 50 });
  });
});
