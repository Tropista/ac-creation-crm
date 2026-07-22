/* @vitest-environment jsdom */
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche la page avec donnees et le statut ready_for_review sans erreur", () => {
    render(<VatDeclaration data={baseData} />);

    expect(screen.getByText("Déclaration TVA")).toBeInTheDocument();
    expect(screen.getAllByText("Prêt pour vérification").length).toBeGreaterThan(0);
    expect(screen.getByText("Document préparatoire - aucune transmission automatique à l'AED")).toBeInTheDocument();
    expect(screen.getByText("Année fiscale 2025")).toBeInTheDocument();
    expect(screen.getByText(/Formulaire eCDF : version 2026/)).toBeInTheDocument();
    expect(screen.getByText("Résultat TVA")).toBeInTheDocument();
    expect(screen.getByText(/TVA due sur acquisitions UE/)).toBeInTheDocument();
    expect(screen.getByText(/TVA déductible sur autoliquidation/)).toBeInTheDocument();
    expect(screen.getByText("À payer")).toBeInTheDocument();
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

  it("permet de classer une vente depuis les lignes sources et recalcule le rapport", async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    render(
      <StatefulVatDeclaration
        initialData={{ ...baseData, invoices: [invoice({ id: "review", number: "FAC-REVIEW", sale_tax_category: "" })] }}
        onDataChange={onDataChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Lignes sources" }));
    expect(screen.getByText("SALE_CLASSIFICATION_TO_REVIEW")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Catégorie fiscale FAC-REVIEW"), "service");

    await waitFor(() => expect(onDataChange).toHaveBeenCalled());
    const next = onDataChange.mock.calls.at(-1)[0];
    expect(next.invoices[0].sale_tax_category).toBe("service");
    expect(next.invoices[0].sale_tax_review_status).toBe("reviewed");
    await waitFor(() => expect(screen.queryByText("SALE_CLASSIFICATION_TO_REVIEW")).not.toBeInTheDocument());
    expect(screen.getByText("Catégorie fiscale de vente enregistrée. Déclaration recalculée.")).toBeInTheDocument();
  });

  it("applique une categorie fiscale a plusieurs ventes selectionnees", async () => {
    const user = userEvent.setup();
    const onDataChange = vi.fn();
    render(
      <StatefulVatDeclaration
        initialData={{
          ...baseData,
          invoices: [
            invoice({ id: "r1", number: "FAC-BULK-1", sale_tax_category: "" }),
            invoice({ id: "r2", number: "FAC-BULK-2", sale_tax_category: "" }),
          ],
        }}
        onDataChange={onDataChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Lignes sources" }));
    await user.click(screen.getByLabelText("Sélectionner FAC-BULK-1"));
    await user.click(screen.getByLabelText("Sélectionner FAC-BULK-2"));
    await user.selectOptions(screen.getByLabelText("Catégorie à appliquer aux ventes sélectionnées"), "resold_goods");
    await user.click(screen.getByRole("button", { name: "Appliquer aux lignes sélectionnées" }));

    await waitFor(() => expect(onDataChange).toHaveBeenCalled());
    const next = onDataChange.mock.calls.at(-1)[0];
    expect(next.invoices.map((entry) => entry.sale_tax_category)).toEqual(["resold_goods", "resold_goods"]);
    expect(next.invoices.map((entry) => entry.sale_tax_review_status)).toEqual(["reviewed", "reviewed"]);
    await waitFor(() => expect(screen.queryByText("SALE_CLASSIFICATION_TO_REVIEW")).not.toBeInTheDocument());
  });

  it("mode cash incomplet genere une erreur", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "info").mockImplementation(() => {});
    render(<VatDeclaration data={baseData} />);

    await user.selectOptions(screen.getByTestId("vat-accounting-basis"), "cash");

    expect(screen.getAllByText(/Facture marquee payee ou partiellement payee sans paiement valide avec date et montant/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 erreurs bloquantes")).toBeInTheDocument();
    expect(screen.getAllByText("Incomplet").length).toBeGreaterThan(0);
  });

  it("cree un paiement historique manuel depuis le controle cash sans banque", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("117,00")
      .mockReturnValueOnce("2025-05-12")
      .mockReturnValueOnce("Virement");
    const onDataChange = vi.fn();
    render(<StatefulVatDeclaration initialData={baseData} onDataChange={onDataChange} />);

    await user.selectOptions(screen.getByTestId("vat-accounting-basis"), "cash");
    await user.click(screen.getByRole("button", { name: "Voir tous les contrôles" }));
    await user.click(screen.getByRole("button", { name: /Créer le paiement historique/i }));

    await waitFor(() => expect(onDataChange).toHaveBeenCalled());
    const next = onDataChange.mock.calls.at(-1)[0];
    expect(next.payments).toHaveLength(1);
    expect(next.payments[0]).toMatchObject({
      invoiceId: "inv-made",
      invoiceNumber: "FAC-MADE",
      amount: 117,
      method: "Virement",
      status: "Reçu",
      date: "2025-05-12",
      bankTransactionId: "",
    });
    await waitFor(() => expect(screen.queryByText("CASH_BASIS_PAYMENTS_INCOMPLETE")).not.toBeInTheDocument());
  });

  it("cree en masse le paiement historique de la facture N°19 depuis l'assistant", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDataChange = vi.fn();
    const data = {
      ...baseData,
      invoices: [
        invoice({
          id: "invoice-19",
          number: "19",
          date: "2025-06-11",
          totalHT: 132.999,
          taxAmount: 22.61,
          totalTTC: 155.61,
          paidAmount: 155.61,
          status: "Payée",
        }),
      ],
      payments: [],
    };
    render(<StatefulVatDeclaration initialData={data} onDataChange={onDataChange} />);

    await user.selectOptions(screen.getByTestId("vat-accounting-basis"), "cash");
    await user.click(screen.getByRole("button", { name: "Assistant de classification TVA" }));
    await user.click(screen.getByRole("button", { name: "Paiements (1)" }));

    expect(screen.getByText("19")).toBeInTheDocument();
    expect(screen.getByText("Date à saisir")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer les classifications" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("Date d'encaissement"), "2025-06-11");
    await user.click(screen.getByRole("button", { name: "Appliquer la date sélectionnée aux factures choisies" }));
    await user.click(screen.getByRole("button", { name: "Créer les paiements historiques sélectionnés" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Vous allez créer 1 paiement historique"));
    await waitFor(() => expect(onDataChange).toHaveBeenCalled());
    const next = onDataChange.mock.calls.at(-1)[0];
    expect(next.payments).toHaveLength(1);
    expect(next.payments[0]).toMatchObject({
      invoiceId: "invoice-19",
      invoiceNumber: "19",
      saleId: "invoice-19",
      documentType: "invoice",
      amount: 155.61,
      method: "Virement",
      status: "Reçu",
      date: "2025-06-11",
      paymentDate: "2025-06-11",
      receivedAt: "2025-06-11",
    });
    expect(screen.getByText("1 paiement créé ; 0 ignoré ; 0 erreur ; 0 restant à vérifier.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("CASH_BASIS_PAYMENTS_INCOMPLETE")).not.toBeInTheDocument());
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

    expect(screen.getAllByText("Solde TVA provisoire non disponible").length).toBeGreaterThan(0);
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

  it("correction rapide applique les classifications exploitables", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDataChange = vi.fn();
    const data = {
      ...baseData,
      invoices: [invoice({ id: "sale-review", description: "Impression DTF textile personnalise", sale_tax_category: "" })],
      expenses: [
        expense({
          id: "exp-lu-review",
          supplierId: "sup-lu",
          supplierName: "Fournisseur LU",
          vat_origin: "LU",
          vatRate: 17,
          vatAmount: 17,
          totalTTC: 117,
          expense_tax_category: "",
          vat_review_status: "to_review",
          description: "Facture diverse bureau",
        }),
      ],
      vatReports: [],
    };
    render(<StatefulVatDeclaration initialData={data} onDataChange={onDataChange} />);

    await user.click(screen.getByRole("button", { name: "Corriger les erreurs exploitables" }));

    const next = onDataChange.mock.calls.at(-1)[0];
    expect(next.invoices[0].sale_tax_category).toBe("manufactured_product");
    expect(next.expenses[0].expense_tax_category).toBe("general_expense");
    expect(next.expenses[0].vat_review_status).toBe("reviewed");
  });

  it("controle guide vers le bon onglet de l'assistant", async () => {
    const user = userEvent.setup();
    render(<VatDeclaration data={{ ...baseData, invoices: [invoice({ id: "review", number: "FAC-REVIEW", sale_tax_category: "" })] }} />);

    await user.click(screen.getByRole("button", { name: "Voir tous les contrôles" }));
    await user.click(screen.getAllByRole("button", { name: "Ouvrir Ventes" })[0]);

    expect(screen.getByRole("dialog", { name: "Assistant de classification TVA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ventes \(1\)/ })).toHaveClass("active");
  });

  it("assistant recharge les classifications depenses deja enregistrees", async () => {
    const user = userEvent.setup();
    const data = {
      ...baseData,
      suppliers: [{ id: "sup-fr-name", name: "Fournisseur France", country_name: "FRANCE" }],
      expenses: [
        expense({
          id: "exp-saved",
          supplierId: "sup-fr-name",
          supplierName: "Fournisseur France",
          vat_origin: "EU",
          expense_tax_category: "merchandise",
          eu_transaction_type: "eu_service",
          vat_review_status: "to_review",
          reverse_charge_rate_status: "confirmed",
          description: "Achat deja classe",
        }),
      ],
      vatReports: [],
    };
    render(<VatDeclaration data={data} />);

    await user.click(screen.getByRole("button", { name: "Assistant de classification TVA" }));
    await user.click(screen.getByRole("button", { name: /Dépenses \(1\)/ }));

    expect(screen.getByDisplayValue("merchandise")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Service UE")).toBeInTheDocument();
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
    expect(screen.getAllByText("1 099,21 €").length).toBeGreaterThan(0);
    expect(screen.getByText("19 035,42 €")).toBeInTheDocument();
    expect(screen.getAllByText("187,61 €").length).toBeGreaterThan(0);
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



