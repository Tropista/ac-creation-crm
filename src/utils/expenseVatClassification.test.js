import { describe, expect, it } from "vitest";
import {
  applyExpenseVatSuggestions,
  getSupplierVatDefaults,
  normalizeExpenseVatFields,
  suggestExpenseVatClassification,
  validateExpenseVatClassification,
} from "./expenseVatClassification";

describe("expenseVatClassification", () => {
  it("fournisseur sans pays => origine null et avertissement", () => {
    const defaults = getSupplierVatDefaults({ name: "Inconnu" });
    expect(defaults.default_vat_origin).toBeNull();
    expect(defaults.warnings).toContain("Pays fournisseur non renseigne");
  });

  it("fournisseur avec pays en toutes lettres => origine UE reconnue", () => {
    const defaults = getSupplierVatDefaults({ country_name: "FRANCE" });

    expect(defaults.country_code).toBe("FR");
    expect(defaults.default_vat_origin).toBe("EU");
  });

  it("machine => investment + is_fixed_asset", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Achat machine laser", vatRate: 17 },
      supplier: { country_code: "LU" },
    });

    expect(result.suggestions.expense_tax_category).toBe("investment");
    expect(result.suggestions.is_fixed_asset).toBe(true);
  });

  it("textile/vinyle/encre => raw_material", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Textile et vinyle DTF", vatRate: 17 },
      supplier: { country_code: "LU" },
    });

    expect(result.suggestions.expense_tax_category).toBe("raw_material");
  });

  it("depense LU sans categorie reconnue => frais generaux a confirmer", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Facture diverse bureau", vatRate: 17, vatAmount: 17 },
      supplier: { country_code: "LU" },
    });

    expect(result.confidence).toBe("medium");
    expect(result.suggestions.vat_origin).toBe("LU");
    expect(result.suggestions.expense_tax_category).toBe("general_expense");
  });

  it("logiciel/abonnement => service", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Abonnement logiciel design", vatRate: 0 },
      supplier: { country_code: "FR", vat_number: "FR123" },
    });

    expect(result.suggestions.expense_tax_category).toBe("service");
  });

  it("fournisseur UE avec taux 0 et materiel => eu_goods", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Filament PLA material", vatRate: 0 },
      supplier: { country_code: "DE", vat_number: "DE123" },
    });

    expect(result.suggestions.vat_origin).toBe("EU");
    expect(result.suggestions.eu_transaction_type).toBe("eu_goods");
  });

  it("fournisseur UE avec taux 0 et logiciel => eu_service", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Software subscription", vatRate: 0 },
      supplier: { country_code: "IE", vat_number: "IE123" },
    });

    expect(result.suggestions.vat_origin).toBe("EU");
    expect(result.suggestions.eu_transaction_type).toBe("eu_service");
  });

  it("TVA etrangere facturee => avertissement non deductible LU", () => {
    const result = suggestExpenseVatClassification({
      expense: { notes: "Service", vatRate: 20, vatAmount: 20 },
      supplier: { country_code: "FR", vat_number: "FR123" },
    });

    expect(result.warnings).toContain(
      "TVA etrangere non deductible dans la declaration TVA luxembourgeoise"
    );
  });

  it("ancienne depense => to_review sans ecriture automatique", () => {
    const legacy = { id: "old", amountHT: 10 };
    const normalized = normalizeExpenseVatFields(legacy);

    expect(legacy.vat_review_status).toBeUndefined();
    expect(normalized.vat_review_status).toBe("to_review");
    expect(normalized.reverse_charge_rate_status).toBe("to_review");
  });

  it("correction manuelle non ecrasee silencieusement", () => {
    const current = { vat_origin: "LU", expense_tax_category: "service" };
    const next = applyExpenseVatSuggestions(
      current,
      { vat_origin: "EU", expense_tax_category: "raw_material" },
      { overwrite: false }
    );

    expect(next.vat_origin).toBe("LU");
    expect(next.expense_tax_category).toBe("service");
  });

  it("suggestion conserve une classification deja enregistree", () => {
    const result = suggestExpenseVatClassification({
      expense: {
        expense_tax_category: "merchandise",
        eu_transaction_type: "eu_service",
        vat_origin: "EU",
        vat_review_status: "reviewed",
        reverse_charge_rate_status: "confirmed",
      },
      supplier: { country_name: "FRANCE" },
    });

    expect(result.suggestions.expense_tax_category).toBe("merchandise");
    expect(result.suggestions.eu_transaction_type).toBe("eu_service");
    expect(result.suggestions.vat_review_status).toBe("reviewed");
    expect(result.suggestions.reverse_charge_rate_status).toBe("confirmed");
  });

  it("deductibilite partielle invalide => erreur", () => {
    const validation = validateExpenseVatClassification({
      vat_origin: "LU",
      vat_deductibility: "partially_deductible",
      deductible_percentage: 0,
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("pourcentage invalide");
  });

  it("valide une depense en saisie manuelle sans fournisseur selectionne sans planter", () => {
    const validation = validateExpenseVatClassification({
      vat_origin: "LU",
      expense_tax_category: "general_expense",
      vat_deductibility: "fully_deductible",
      reverse_charge_vat_rate: 17,
    }, null);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("investissement incomplet => erreur", () => {
    const validation = validateExpenseVatClassification({
      vat_origin: "LU",
      expense_tax_category: "investment",
      is_fixed_asset: true,
      asset_name: "",
      asset_purchase_date: "",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("Immobilisation");
  });
});
