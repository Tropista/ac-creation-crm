import { describe, expect, it } from "vitest";
import {
  applyPersonalPurchaseDefaults,
  applyExpenseVatSuggestions,
  applyExpenseCategoryVatRecommendation,
  getExpenseCategoryVatRecommendation,
  getSupplierVatDefaults,
  getSuggestedEuTransactionType,
  normalizeExpenseCategory,
  normalizeExpenseVatFields,
  resolvePersonalPurchaseDefaults,
  shouldConfirmExpenseCategoryChange,
  suggestExpenseVatClassification,
  validateExpenseVatClassification,
} from "./expenseVatClassification";

describe("expenseVatClassification", () => {
  it.each([
    ["small_equipment", "EU", "merchandise", "eu_goods", false],
    ["goods", "EU", "merchandise", "eu_goods", false],
    ["fixed_asset", "EU", "investment", "eu_goods", true],
    ["software_subscription", "EU", "service", "eu_service", false],
    ["general_expenses", "EU", "general_expense", "eu_service", false],
    ["goods", "LU", "merchandise", "none", false],
    ["goods", "NON_EU", "merchandise", "none", false],
  ])("propose la classification TVA de %s pour l'origine %s", (category, origin, taxCategory, euType, isFixedAsset) => {
    expect(getExpenseCategoryVatRecommendation({
      category,
      vat_origin: origin,
      vatRate: 0,
      vatAmount: 0,
    })).toMatchObject({
      expense_tax_category: taxCategory,
      eu_transaction_type: euType,
      vat_deductibility: "fully_deductible",
      is_fixed_asset: isFixedAsset,
      vatClassificationSource: "automatic",
    });
  });

  it("met à jour une classification automatique quand la catégorie change", () => {
    const result = applyExpenseCategoryVatRecommendation({
      category: "small_equipment",
      vat_origin: "EU",
      vatRate: 0,
      vatAmount: 0,
    });

    expect(result).toMatchObject({
      expense_tax_category: "merchandise",
      eu_transaction_type: "eu_goods",
      vatClassificationSource: "automatic",
    });
  });

  it("identifie une classification personnalisée avant un changement de catégorie", () => {
    expect(shouldConfirmExpenseCategoryChange({ vatClassificationSource: "manual" })).toBe(true);
    expect(shouldConfirmExpenseCategoryChange({ vatClassificationSource: "automatic" })).toBe(false);
  });

  it("normalise les anciennes catégories et classe une valeur inconnue en autre", () => {
    expect(normalizeExpenseCategory("matériel")).toBe("small_equipment");
    expect(normalizeExpenseCategory("marchandises")).toBe("goods");
    expect(normalizeExpenseCategory("catégorie inconnue")).toBe("other");
  });

  it("laisse une acquisition UE à 0 % déductible", () => {
    const validation = validateExpenseVatClassification({
      vat_origin: "EU",
      eu_transaction_type: "eu_goods",
      vat_deductibility: "fully_deductible",
      vatDeductionStatus: "deductible",
      vatRate: 0,
      vatAmount: 0,
    }, { country_code: "FR" });

    expect(validation.errors).toEqual([]);
  });

  it("préremplit la personne et la fonction pour un achat personnel", () => {
    expect(applyPersonalPurchaseDefaults({ personalAccountPurchase: true })).toMatchObject({
      paidByPerson: "Couto Da Silva Carla",
      paidByRole: "Gérante",
    });
  });

  it("conserve les informations déjà saisies pour un achat personnel", () => {
    expect(applyPersonalPurchaseDefaults({
      personalAccountPurchase: true,
      paidByPerson: "Autre personne",
      paidByRole: "Associée",
    })).toMatchObject({
      paidByPerson: "Autre personne",
      paidByRole: "Associée",
    });
  });

  it("ne modifie pas les valeurs lorsque l'achat personnel est décoché", () => {
    const expense = {
      personalAccountPurchase: false,
      paidByPerson: "Couto Da Silva Carla",
      paidByRole: "Gérante",
    };

    expect(applyPersonalPurchaseDefaults(expense)).toEqual(expense);
  });

  it("conserve les valeurs après décochage puis recochage", () => {
    const initiallyChecked = applyPersonalPurchaseDefaults({ personalAccountPurchase: true });
    const unchecked = applyPersonalPurchaseDefaults({
      ...initiallyChecked,
      personalAccountPurchase: false,
    });
    const checkedAgain = applyPersonalPurchaseDefaults({
      ...unchecked,
      personalAccountPurchase: true,
    });

    expect(checkedAgain).toMatchObject({
      paidByPerson: "Couto Da Silva Carla",
      paidByRole: "Gérante",
    });
  });

  it("complète une ancienne dépense personnelle dont les champs sont absents", () => {
    expect(applyPersonalPurchaseDefaults({ personalAccountPurchase: true })).toMatchObject({
      paidByPerson: "Couto Da Silva Carla",
      paidByRole: "Gérante",
    });
  });

  it("utilise les paramètres société avant les valeurs par défaut", () => {
    const settings = {
      personalPurchaseDefaults: {
        paidByPerson: "Marie Exemple",
        paidByRole: "Directrice",
      },
    };

    expect(resolvePersonalPurchaseDefaults(settings)).toEqual({
      paidByPerson: "Marie Exemple",
      paidByRole: "Directrice",
    });
  });

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

  it.each([
    ["Atome3D", "merchandise", "eu_goods"],
    ["Amazon FR", "merchandise", "eu_goods"],
    ["Canva", "general_expense", "eu_service"],
    ["Adobe", "general_expense", "eu_service"],
  ])("propose un profil fournisseur fiable pour %s", (supplierName, category, euType) => {
    const result = suggestExpenseVatClassification({
      expense: { supplierName, vatRate: 0, vatAmount: 0 },
      supplier: { name: supplierName, country_code: "FR" },
    });

    expect(result.suggestions).toMatchObject({
      vat_origin: "EU",
      expense_tax_category: category,
      eu_transaction_type: euType,
      vat_deductibility: "fully_deductible",
    });
    expect(result.confidence).toBe("high");
  });

  it("deduit le Type UE de la categorie choisie", () => {
    expect(getSuggestedEuTransactionType("EU", "merchandise")).toBe("eu_goods");
    expect(getSuggestedEuTransactionType("EU", "investment")).toBe("eu_goods");
    expect(getSuggestedEuTransactionType("EU", "general_expense")).toBe("eu_service");
    expect(getSuggestedEuTransactionType("EU", "service")).toBe("eu_service");
    expect(getSuggestedEuTransactionType("LU", "merchandise")).toBe("none");
  });

  it("ne conserve pas une anomalie automatique lorsque la categorie manuelle est valide", () => {
    const result = suggestExpenseVatClassification({
      expense: {
        supplierName: "Atome3D",
        vat_origin: "EU",
        expense_tax_category: "merchandise",
        eu_transaction_type: "eu_goods",
        vat_deductibility: "fully_deductible",
        vat_classification_confidence: "manual",
      },
      supplier: { name: "Atome3D", country_code: "FR" },
    });

    expect(result.confidence).toBe("high");
    expect(result.warnings.join(" ")).not.toContain("Categorie fiscale non reconnue");
    expect(result.reasons.join(" ")).not.toContain("Type UE non reconnu");
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
    const legacy = { id: "old", amountHT: 10, category: "matériel" };
    const normalized = normalizeExpenseVatFields(legacy);

    expect(legacy.vat_review_status).toBeUndefined();
    expect(normalized.vat_review_status).toBe("to_review");
    expect(normalized.reverse_charge_rate_status).toBe("to_review");
    expect(normalized.personalAccountPurchase).toBe(false);
    expect(normalized.vatDeductionStatus).toBe("accountant_review");
    expect(normalized.category).toBe("small_equipment");
  });

  it("conserve les informations d'un achat Amazon paye personnellement", () => {
    const normalized = normalizeExpenseVatFields({
      supplierName: "Amazon",
      personalAccountPurchase: true,
      paidByPerson: "Couto Da Silva Carla",
      paidByRole: "Gerante",
      companyReimbursementStatus: "pending",
      vatDeductionStatus: "foreign_vat",
      invoiceInCompanyName: false,
      companyAddressOnInvoice: true,
      companyVatNumberOnInvoice: false,
    });

    expect(normalized).toMatchObject({
      personalAccountPurchase: true,
      paidByPerson: "Couto Da Silva Carla",
      companyReimbursementStatus: "pending",
      vatDeductionStatus: "foreign_vat",
      companyAddressOnInvoice: true,
      companyVatNumberOnInvoice: false,
    });
  });

  it("exige une date lorsqu'un remboursement est deja effectue", () => {
    const validation = validateExpenseVatClassification({
      companyReimbursementStatus: "reimbursed",
      vatDeductionStatus: "non_deductible",
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("date de remboursement obligatoire");
  });

  it("refuse la TVA deductible lorsque la facture porte une TVA etrangere", () => {
    const validation = validateExpenseVatClassification({
      vat_origin: "EU",
      vatRate: 20,
      vatAmount: 20,
      vatDeductionStatus: "deductible",
      eu_transaction_type: "eu_service",
    }, { country_code: "FR" });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("TVA etrangere");
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
