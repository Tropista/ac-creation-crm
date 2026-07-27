// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VatWorkbook from "./VatWorkbook";
import { exportVatWorkbook } from "../utils/vatWorkbookExport";

vi.mock("../utils/vatWorkbookExport", () => ({ exportVatWorkbook: vi.fn() }));

const sheets = (partner) => ({
  achatsLux: partner ? [{ id: `snapshot-${partner}`, partner, date: "2025-01-15", number: "F-1", nature: "Achat", amountHT: 100, vatRate: 17, vatAmount: 17, totalTTC: 117 }] : [],
  aic: [], chidaLux: [], chidaUeTaxable: [], chidaUeExempt: [], importations1: [], chidaHue: [], importations: [],
});
const periods = [
  { id: "period-2026", startDate: "2026-01-01", endDate: "2026-12-31", status: "draft", sheets: sheets("Fournisseur 2026") },
  { id: "period-2025", startDate: "2025-01-01", endDate: "2025-12-31", status: "draft", sheets: sheets("Fournisseur 2025") },
];

describe("VatWorkbook", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(exportVatWorkbook).mockReset();
  });

  it("affiche les huit onglets du classeur et aucune ancienne action TVA", () => {
    render(<VatWorkbook data={{ invoices: [], expenses: [], clients: [], vatWorkbookPeriods: [] }} setData={vi.fn()} />);
    ["Achats_LUX", "AIC", "Chida_LUX", "Chida_UE", "Importations 1", "Chida_HUE", "Importations", "Montant TVA deductible"].forEach((label) => expect(screen.getByRole("button", { name: label })).toBeInTheDocument());
    expect(screen.queryByText("Assistant de classification TVA")).not.toBeInTheDocument();
    expect(screen.queryByText("Telecharger le PDF preparatoire")).not.toBeInTheDocument();
  });

  it("exporte toujours le dossier actif et ne conserve pas la periode 2026 dans une closure", () => {
    render(<VatWorkbook data={{ invoices: [], expenses: [], clients: [], vatWorkbookPeriods: periods }} setData={vi.fn()} />);
    const selector = screen.getByRole("combobox");
    const exportButton = screen.getByRole("button", { name: "Exporter le classeur TVA" });

    fireEvent.change(selector, { target: { value: "period-2025" } });
    expect(screen.getByText("Fournisseur 2025")).toBeInTheDocument();
    fireEvent.click(exportButton);
    expect(exportVatWorkbook).toHaveBeenLastCalledWith(expect.objectContaining({ id: "period-2025", startDate: "2025-01-01", endDate: "2025-12-31" }));

    fireEvent.change(selector, { target: { value: "period-2026" } });
    fireEvent.click(exportButton);
    expect(exportVatWorkbook).toHaveBeenLastCalledWith(expect.objectContaining({ id: "period-2026" }));

    fireEvent.change(selector, { target: { value: "period-2025" } });
    fireEvent.click(exportButton);
    expect(exportVatWorkbook).toHaveBeenLastCalledWith(expect.objectContaining({ id: "period-2025", sheets: expect.objectContaining({ achatsLux: [expect.objectContaining({ partner: "Fournisseur 2025" })] }) }));
  });

  it("affiche l'erreur reelle si l'export du dossier actif echoue", async () => {
    vi.mocked(exportVatWorkbook).mockRejectedValueOnce(new Error("Ligne achatsLux invalide"));
    render(<VatWorkbook data={{ invoices: [], expenses: [], clients: [], vatWorkbookPeriods: periods }} setData={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "period-2025" } });
    fireEvent.click(screen.getByRole("button", { name: "Exporter le classeur TVA" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ligne achatsLux invalide"));
  });
});
