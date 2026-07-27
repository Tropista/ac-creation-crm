// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INVOICE_PERIOD_MODES } from "../../utils/invoicePeriodStats";
import { buildFinancialPerformance } from "../../utils/financialPerformance";
import FinancialPerformance from "./FinancialPerformance";

vi.mock("recharts", () => ({
  Cell: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: ({ children }) => <div>{children}</div>,
  Pie: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const performance = buildFinancialPerformance({
  clients: [{ id: "client-1", name: "Client test" }],
  products: [],
  settings: { monthlyRevenueGoal: 5000, taxRate: 17 },
  invoices: [{ id: "invoice-1", date: "12/07/2026", totalHT: 600, clientId: "client-1", lines: [] }],
  expenses: [{ id: "expense-1", purchaseDate: "2026-07-14", amountHT: 200 }],
}, {
  period: { mode: INVOICE_PERIOD_MODES.MONTH, year: 2026, month: 6 },
  referenceDate: new Date(2026, 6, 20),
});

function renderPerformance(overrides = {}) {
  return render(
    <FinancialPerformance
      performance={performance}
      billingPeriodMode={INVOICE_PERIOD_MODES.MONTH}
      setBillingPeriodMode={vi.fn()}
      billingMonthValue="2026-07"
      setBillingMonthValue={vi.fn()}
      billingYear="2026"
      setBillingYear={vi.fn()}
      billingYearOptions={[2026, 2025]}
      {...overrides}
    />
  );
}

describe("FinancialPerformance", () => {
  it("affiche les résultats et toutes les cartes dans un viewport mobile", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    renderPerformance();

    expect(screen.getByTestId("financial-performance")).toBeInTheDocument();
    expect(screen.getByText("Résultat du mois")).toBeInTheDocument();
    expect(screen.getByText("Objectif mensuel")).toBeInTheDocument();
    expect(screen.getByText("Rentabilité par technique")).toBeInTheDocument();
    expect(screen.getByText("Top clients")).toBeInTheDocument();
    expect(screen.getByText("Top produits")).toBeInTheDocument();
  });

  it("transmet les changements de filtre au tableau de bord parent", () => {
    const setBillingPeriodMode = vi.fn();
    const setBillingMonthValue = vi.fn();
    renderPerformance({ setBillingPeriodMode, setBillingMonthValue });

    fireEvent.click(screen.getByRole("button", { name: "Année" }));
    fireEvent.change(screen.getByLabelText("Mois financier"), { target: { value: "2026-06" } });

    expect(setBillingPeriodMode).toHaveBeenCalledWith(INVOICE_PERIOD_MODES.YEAR);
    expect(setBillingMonthValue).toHaveBeenCalledWith("2026-06");
  });
});
