/* @vitest-environment jsdom */
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/vatReportPdf", () => ({
  downloadVatReportPdf: vi.fn(() => "preparation-tva-2025-ac-creation.pdf"),
}));

vi.mock("../utils/vatReportCsv", () => ({
  exportVatEcdfBoxesCsv: vi.fn(() => "cases-ecdf-tva-2025.csv"),
  exportVatSourceLinesCsv: vi.fn(() => "lignes-sources-tva-2025.csv"),
}));

import VatDeclaration from "./VatDeclaration";
import { createVatReport, markVatReportFiled, markVatReportReviewed } from "../services/vatReportService";
import { calculateVatDeclaration } from "../utils/vatDeclaration";
import { downloadVatReportPdf } from "../utils/vatReportPdf";
import { exportVatEcdfBoxesCsv, exportVatSourceLinesCsv } from "../utils/vatReportCsv";

function invoice(overrides = {}) {
  const totalHT = overrides.totalHT ?? 100;
  const taxRate = overrides.taxRate ?? 17;
  const taxAmount = overrides.taxAmount ?? totalHT * taxRate / 100;
  return {
    id: overrides.id || "inv-1",
    number: overrides.number || "FAC-1",
    date: overrides.date || "2025-05-10",
    status: overrides.status || "Payee",
    totalHT,
    taxRate,
    taxAmount,
    totalTTC: overrides.totalTTC ?? totalHT + taxAmount,
    sale_tax_category: overrides.sale_tax_category || "manufactured_product",
    ...overrides,
  };
}

function expense(overrides = {}) {
  const amountHT = overrides.amountHT ?? 100;
  const vatRate = overrides.vatRate ?? 17;
  const vatAmount = overrides.vatAmount ?? amountHT * vatRate / 100;
  return {
    id: overrides.id || "exp-1",
    supplierId: overrides.supplierId || "sup-lu",
    supplierName: overrides.supplierName || "Fournisseur LU",
    invoiceNumber: overrides.invoiceNumber || "ACH-1",
    purchaseDate: overrides.purchaseDate || "2025-06-01",
    amountHT,
    vatRate,
    vatAmount,
    totalTTC: overrides.totalTTC ?? amountHT + vatAmount,
    vat_origin: overrides.vat_origin || "LU",
    expense_tax_category: overrides.expense_tax_category || "general_expense",
    eu_transaction_type: overrides.eu_transaction_type || "none",
    vat_deductibility: overrides.vat_deductibility || "fully_deductible",
    deductible_percentage: overrides.deductible_percentage ?? 100,
    vat_review_status: overrides.vat_review_status || "reviewed",
    reverse_charge_vat_rate: overrides.reverse_charge_vat_rate ?? 17,
    reverse_charge_rate_status: overrides.reverse_charge_rate_status || "confirmed",
    ...overrides,
  };
}

const baseData = {
  clients: [{ id: "c1", name: "Client" }],
  suppliers: [
    { id: "sup-lu", name: "Fournisseur LU", country_code: "LU" },
    { id: "sup-de", name: "Fournisseur DE", country_code: "DE", vat_number: "DE123" },
    { id: "sup-fr", name: "Fournisseur FR", country_code: "FR", vat_number: "FR123" },
  ],
  invoices: [invoice({ id: "inv-made", number: "FAC-MADE" })],
  expenses: [],
  payments: [],
  vatReports: [],
};

function StatefulVatDeclaration({ initialData = baseData, role = "Admin", onDataChange = vi.fn() } = {}) {
  const [data, setData] = useState(initialData);
  function updateData(next) {
    const resolved = typeof next === "function" ? next(data) : next;
    setData(resolved);
    onDataChange(resolved);
  }
  return (
    <VatDeclaration
      data={data}
      setData={updateData}
      currentRole={role}
      currentUser={{ email: "admin@example.com" }}
      logActivity={vi.fn()}
    />
  );
}

function buildSavedVatReport(data = baseData) {
  const report = calculateVatDeclaration({
    taxYear: 2025,
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    data,
  });
  return createVatReport({ vatReports: [] }, report, {
    taxYear: 2025,
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    accountingBasis: "invoice",
    currentUser: { email: "admin@example.com" },
    now: new Date("2026-07-15T10:00:00.000Z"),
  }).report;
}

describe("VatDeclaration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadVatReportPdf.mockImplementation(() => "preparation-tva-2025-ac-creation.pdf");
    exportVatEcdfBoxesCsv.mockImplementation(() => "cases-ecdf-tva-2025.csv");
    exportVatSourceLinesCsv.mockImplementation(() => "lignes-sources-tva-2025.csv");
  });

  it("affiche la page avec donnees et le statut ready_for_review sans erreur", () => {
    render(<VatDeclaration data={baseData} />);

    expect(screen.getByText("Déclaration TVA")).toBeInTheDocument();
    expect(screen.getAllByText("Prêt pour vérification").length).toBeGreaterThan(0);
    expect(screen.getByText("Document préparatoire - aucune transmission automatique à l'AED")).toBeInTheDocument();
    expect(screen.getByText("Année fiscale 2025")).toBeInTheDocument();
    expect(screen.getByText(/Formulaire eCDF : version 2026/)).toBeInTheDocument();
  });

  it("changement d'annee met a jour la periode et calcule avec taxYear correct", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ date: "2024-03-01" })] }} />);

    const yearInput = screen.getByTestId("vat-tax-year");
    await user.clear(yearInput);
    await user.type(yearInput, "2025");

    expect(yearInput).toHaveValue(2025);
    expect(screen.getByDisplayValue("2025-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2025-12-31")).toBeInTheDocument();
    expect(screen.getByTestId("vat-empty-state")).toBeInTheDocument();
  });

  it("affiche incomplete en presence d'erreurs et montre les ventes to_review", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ id: "review", sale_tax_category: "" })] }} />);

    expect(screen.getAllByText("Incomplet").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Marquer comme vérifié" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marquer comme déposé dans eCDF" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Ventes" }));
    expect(screen.getByText("Ventes à revoir")).toBeInTheDocument();
  });

  it("separe biens UE et services UE", async () => {
    const user = userEvent.setup();
    render(
      <VatDeclaration
        data={{
          ...baseData,
          expenses: [
            expense({
              id: "goods",
              supplierId: "sup-de",
              supplierName: "Fournisseur DE",
              vat_origin: "EU",
              vatRate: 0,
              vatAmount: 0,
              totalTTC: 100,
              expense_tax_category: "raw_material",
              eu_transaction_type: "eu_goods",
            }),
            expense({
              id: "service",
              supplierId: "sup-de",
              supplierName: "Fournisseur DE",
              vat_origin: "EU",
              vatRate: 0,
              vatAmount: 0,
              totalTTC: 100,
              expense_tax_category: "service",
              eu_transaction_type: "eu_service",
            }),
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Acquisitions UE biens" }));
    expect(screen.getByText("Biens UE")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Services UE" }));
    expect(screen.getAllByText("Services UE").length).toBeGreaterThan(0);
  });

  it("affiche la TVA étrangère separement", async () => {
    const user = userEvent.setup();
    render(
      <VatDeclaration
        data={{
          ...baseData,
          expenses: [
            expense({
              id: "foreign",
              supplierId: "sup-fr",
              supplierName: "Fournisseur FR",
              vat_origin: "EU",
              vatRate: 20,
              vatAmount: 20,
              totalTTC: 120,
              expense_tax_category: "service",
              eu_transaction_type: "eu_service",
            }),
          ],
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: "TVA étrangère" }));
    expect(screen.getByText("Cette TVA n'est pas incluse dans la TVA déductible luxembourgeoise.")).toBeInTheDocument();
    expect(screen.getByText("Fournisseur FR")).toBeInTheDocument();
  });

  it("clic sur une case eCDF filtre les lignes sources", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={baseData} />);

    await user.click(screen.getByRole("button", { name: "Cases eCDF" }));
    const row701 = screen.getByText("701").closest("tr");
    await user.click(within(row701).getByRole("button", { name: "Voir les lignes sources" }));

    expect(screen.getByDisplayValue("701")).toBeInTheDocument();
    expect(screen.getByText("FAC-MADE")).toBeInTheDocument();
  });

  it("bouton elements a corriger filtre les lignes", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ id: "review", number: "FAC-REVIEW", sale_tax_category: "" })] }} />);

    await user.click(screen.getByRole("button", { name: "Contrôles" }));
    await user.click(screen.getByRole("button", { name: "Voir uniquement les éléments à corriger" }));

    expect(screen.getByText("FAC-REVIEW")).toBeInTheDocument();
  });

  it("mode cash incomplet genere une erreur", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={baseData} />);

    await user.selectOptions(screen.getByTestId("vat-accounting-basis"), "cash");

    expect(screen.getAllByText(/Le mode recettes nécessite des paiements correctement enregistrés/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Incomplet").length).toBeGreaterThan(0);
  });

  it("absence de donnees affiche un etat vide", () => {
    render(<VatDeclaration data={{ invoices: [], expenses: [], suppliers: [], payments: [] }} />);

    expect(screen.getByTestId("vat-empty-state")).toBeInTheDocument();
  });

  it("bandeau affiche les compteurs separement et les anomalies regroupees", () => {
    render(
      <VatDeclaration
        data={{
          ...baseData,
          invoices: [
            invoice({ id: "r1", sale_tax_category: "" }),
            invoice({ id: "r2", sale_tax_category: "" }),
          ],
        }}
      />
    );

    expect(screen.getByText("Statut global")).toBeInTheDocument();
    expect(screen.getByText("2 erreurs bloquantes")).toBeInTheDocument();
    expect(screen.getByText("0 avertissements")).toBeInTheDocument();
    expect(screen.getByText("0 informations")).toBeInTheDocument();
    expect(screen.getByText("2 ventes doivent être classées")).toBeInTheDocument();
  });

  it("masque le solde final quand il n'est pas fiable", () => {
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ id: "review", sale_tax_category: "" })] }} />);

    expect(screen.getByText("Solde TVA provisoire non disponible")).toBeInTheDocument();
    expect(screen.getByText("Des ventes ou dépenses doivent encore être classées avant de calculer un montant fiable.")).toBeInTheDocument();
  });

  it("assistant s'ouvre sans modifier les donnees et affiche les suggestions", async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    const data = {
      ...baseData,
      suppliers: [{ id: "sup-de", name: "Fournisseur DE", country_code: "DE", vat_number: "DE123", default_vat_origin: "EU" }],
      invoices: [invoice({ id: "sale-review", description: "Impression DTF textile personnalise", sale_tax_category: "" })],
      expenses: [
        expense({
          id: "exp-review",
          supplierId: "sup-de",
          supplierName: "Fournisseur DE",
          vat_origin: "EU",
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 120,
          expense_tax_category: "",
          vat_review_status: "to_review",
          description: "filament impression 3D",
        }),
      ],
      vatReports: [],
    };
    render(<StatefulVatDeclaration initialData={data} onDataChange={onDataChange} />);

    await user.click(screen.getByRole("button", { name: "Assistant de classification TVA" }));

    expect(onDataChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Assistant de classification TVA" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ventes \(1\)/ }));
    expect(screen.getAllByText("Produit fabriqué / transformé").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Dépenses \(1\)/ }));
    expect(screen.getByText("filament impression 3D")).toBeInTheDocument();
    expect(screen.getByText(/Aperçu basé sur les propositions/)).toBeInTheDocument();
  });

  it("assistant confirme avant sauvegarde et met a jour ventes et depenses", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDataChange = vi.fn();
    const data = {
      ...baseData,
      suppliers: [{ id: "sup-de", name: "Fournisseur DE", country_code: "DE", vat_number: "DE123", default_vat_origin: "EU" }],
      invoices: [invoice({ id: "sale-review", description: "Impression DTF textile personnalise", sale_tax_category: "" })],
      expenses: [
        expense({
          id: "exp-review",
          supplierId: "sup-de",
          supplierName: "Fournisseur DE",
          vat_origin: "EU",
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 120,
          expense_tax_category: "",
          vat_review_status: "to_review",
          description: "filament impression 3D",
        }),
      ],
      vatReports: [],
    };
    render(<StatefulVatDeclaration initialData={data} onDataChange={onDataChange} />);

    await user.click(screen.getByRole("button", { name: "Assistant de classification TVA" }));
    await user.click(screen.getByRole("button", { name: /Ventes \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Accepter toutes les propositions à confiance élevée" }));
    await user.click(screen.getByRole("button", { name: /Dépenses \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Marquer toutes les dépenses affichées" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer les classifications" }));

    const next = onDataChange.mock.calls.at(-1)[0];
    expect(window.confirm).toHaveBeenCalledWith("Vous allez mettre à jour 0 fournisseurs, 1 ventes et 1 dépenses. Continuer ?");
    expect(next.invoices[0].sale_tax_category).toBe("manufactured_product");
    expect(next.expenses[0].vat_review_status).toBe("reviewed");
    expect(next.expenses[0].reverse_charge_rate_status).toBe("confirmed");
  });

  it("cartes affichent titres et montants separement avec donnees TVA 2025 classees", () => {
    const data = {
      ...baseData,
      invoices: [invoice({ id: "sales", totalHT: 6465.88, taxAmount: 1099.21, totalTTC: 7565.09 })],
      suppliers: [
        { id: "sup-de", name: "Fournisseur DE", country_code: "DE", default_vat_origin: "EU", vat_number: "DE123" },
        { id: "sup-lu", name: "Fournisseur LU", country_code: "LU", default_vat_origin: "LU" },
        { id: "sup-fr", name: "Fournisseur FR", country_code: "FR", default_vat_origin: "EU", vat_number: "FR123" },
      ],
      expenses: [
        expense({ id: "eu-goods", supplierId: "sup-de", supplierName: "Fournisseur DE", amountHT: 17521.10, vatRate: 0, vatAmount: 0, totalTTC: 17521.10, vat_origin: "EU", expense_tax_category: "raw_material", eu_transaction_type: "eu_goods", vat_review_status: "reviewed", reverse_charge_rate_status: "confirmed" }),
        expense({ id: "lu-17", supplierId: "sup-lu", supplierName: "Fournisseur LU", amountHT: 1089.22, vatRate: 17, vatAmount: 185.16, totalTTC: 1274.38, vat_origin: "LU", expense_tax_category: "general_expense", vat_review_status: "reviewed" }),
        expense({ id: "lu-3", supplierId: "sup-lu", supplierName: "Fournisseur LU", amountHT: 81.54, vatRate: 3, vatAmount: 2.45, totalTTC: 83.99, vat_origin: "LU", expense_tax_category: "general_expense", vat_review_status: "reviewed" }),
        expense({ id: "foreign", supplierId: "sup-fr", supplierName: "Fournisseur FR", amountHT: 343.56, vatRate: 20, vatAmount: 68.72, totalTTC: 412.28, vat_origin: "EU", expense_tax_category: "service", eu_transaction_type: "eu_service", vat_review_status: "reviewed", reverse_charge_rate_status: "confirmed" }),
      ],
    };

    render(<VatDeclaration data={data} />);

    const caCard = screen.getByText("Chiffre d'affaires HT").closest(".vat-summary-card");
    expect(within(caCard).getByText("6 465,88 €")).toBeInTheDocument();
    expect(screen.getByText("1 099,21 €")).toBeInTheDocument();
    expect(screen.getByText("19 035,42 €")).toBeInTheDocument();
    expect(screen.getByText("187,61 €")).toBeInTheDocument();
    expect(screen.getByText("17 521,10 €")).toBeInTheDocument();
    expect(screen.getByText("68,72 €")).toBeInTheDocument();
  });

  it("enregistre et recharge un brouillon depuis la page", async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    render(<StatefulVatDeclaration onDataChange={onDataChange} />);

    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

    const saved = onDataChange.mock.calls.at(-1)[0].vatReports[0];
    expect(saved.status).toBe("draft");
    expect(saved.source_snapshot_json.lines).toHaveLength(1);
    expect(screen.getByTestId("vat-saved-report")).toBeInTheDocument();
  });

  it("passe un rapport a reviewed puis filed", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDataChange = vi.fn();
    render(<StatefulVatDeclaration onDataChange={onDataChange} />);

    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));
    await user.click(screen.getByRole("button", { name: "Marquer comme vérifié" }));
    expect(onDataChange.mock.calls.at(-1)[0].vatReports[0].status).toBe("reviewed");

    await user.click(screen.getByRole("button", { name: "Marquer comme déposé dans eCDF" }));
    expect(onDataChange.mock.calls.at(-1)[0].vatReports[0].status).toBe("filed");
  });

  it("affiche un rapport filed en lecture seule et cree une rectificative", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const draft = buildSavedVatReport(baseData);
    const reviewed = markVatReportReviewed({ ...baseData, vatReports: [draft] }, draft.id, {
      currentUser: { email: "admin@example.com" },
      now: new Date("2026-07-15T11:00:00.000Z"),
    });
    const filed = markVatReportFiled(reviewed.data, reviewed.report.id, {
      currentUser: { email: "admin@example.com" },
      now: new Date("2026-07-15T12:00:00.000Z"),
    });
    const onDataChange = vi.fn();

    render(<StatefulVatDeclaration initialData={filed.data} onDataChange={onDataChange} />);

    await user.selectOptions(screen.getByTestId("vat-report-select"), filed.report.id);
    expect(screen.getByRole("button", { name: "Mettre à jour le rapport" })).toBeDisabled();
    expect(screen.getByText("Ce rapport déposé est en lecture seule. Toute modification crée une rectificative.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer une déclaration rectificative" }));
    const reports = onDataChange.mock.calls.at(-1)[0].vatReports;
    expect(reports).toHaveLength(2);
    expect(reports[0].status).toBe("amended");
    expect(reports[0].parent_report_id).toBe(filed.report.id);
  });

  it("affiche les differences entre calcul actuel et rapport enregistré", async () => {
    const user = userEvent.setup();
    const saved = buildSavedVatReport(baseData);
    const currentData = {
      ...baseData,
      invoices: [invoice({ id: "inv-made", number: "FAC-MADE", totalHT: 200, taxAmount: 34, totalTTC: 234 })],
      vatReports: [saved],
    };

    render(<StatefulVatDeclaration initialData={currentData} />);

    await user.selectOptions(screen.getByTestId("vat-report-select"), saved.id);
    expect(screen.getByText("Différences détectées")).toBeInTheDocument();
    expect(screen.getByText("Lignes modifiées: 1")).toBeInTheDocument();
  });

  it("un role non autorise ne peut pas modifier", () => {
    render(<StatefulVatDeclaration role="Utilisateur" />);

    expect(screen.getByRole("button", { name: "Enregistrer le brouillon" })).toBeDisabled();
    expect(screen.getByText("Votre rôle permet la consultation, pas la modification des rapports TVA.")).toBeInTheDocument();
  });

  it("clic PDF et CSV exporte le calcul actuel", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={baseData} />);

    await user.click(screen.getByRole("button", { name: "Télécharger le PDF préparatoire" }));
    await user.click(screen.getByRole("button", { name: "Exporter les cases eCDF en CSV" }));
    await user.click(screen.getByRole("button", { name: "Exporter les lignes sources en CSV" }));

    expect(downloadVatReportPdf).toHaveBeenCalledWith({
      report: expect.objectContaining({ exportSource: "current", tax_year: 2025 }),
      settings: {},
    });
    expect(exportVatEcdfBoxesCsv).toHaveBeenCalledWith(expect.objectContaining({ exportSource: "current" }));
    expect(exportVatSourceLinesCsv).toHaveBeenCalledWith(expect.objectContaining({ exportSource: "current" }));
    expect(screen.getByText(/CSV des lignes sources généré depuis le calcul actuel/)).toBeInTheDocument();
  });

  it("confirme avant export quand des erreurs bloquantes existent", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ id: "review", sale_tax_category: "" })] }} />);

    await user.click(screen.getByRole("button", { name: "Télécharger le PDF préparatoire" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Ce rapport contient 1 erreurs bloquantes. Les exports seront marqués comme provisoires. Continuer ?"
    );
    expect(downloadVatReportPdf).not.toHaveBeenCalled();
  });

  it("exporte le rapport enregistré depuis son snapshot", async () => {
    const user = userEvent.setup();
    const saved = buildSavedVatReport(baseData);
    render(<StatefulVatDeclaration initialData={{ ...baseData, vatReports: [saved] }} />);

    await user.selectOptions(screen.getByTestId("vat-report-select"), saved.id);
    await user.click(screen.getByRole("button", { name: "Exporter les cases eCDF en CSV" }));

    expect(exportVatEcdfBoxesCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        exportSource: "saved",
        report_version: 1,
        ecdfBoxes: saved.ecdf_boxes_json,
      })
    );
    expect(screen.getByText(/CSV des cases eCDF généré depuis le rapport enregistré/)).toBeInTheDocument();
  });

  it("desactive les exports sans donnees", () => {
    render(<VatDeclaration data={{ invoices: [], expenses: [], suppliers: [], payments: [] }} />);

    expect(screen.getByRole("button", { name: "Télécharger le PDF préparatoire" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exporter les cases eCDF en CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exporter les lignes sources en CSV" })).toBeDisabled();
  });

  it("affiche une erreur utilisateur si un export echoue", async () => {
    const user = userEvent.setup();
    exportVatSourceLinesCsv.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    render(<VatDeclaration data={baseData} />);

    await user.click(screen.getByRole("button", { name: "Exporter les lignes sources en CSV" }));

    expect(screen.getByText("Impossible de générer le CSV des lignes sources.")).toBeInTheDocument();
  });
});



