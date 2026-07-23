import { useMemo, useRef, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import {
  VAT_RATE_CUSTOM,
  LUXEMBOURG_VAT_RATES,
  computeTotalFromHtAndVat,
  computeVatFromHtAndRate,
  formatExpenseAmountField,
  isPresetVatRate,
  resolveVatRateSelectValue,
  roundMoney,
} from "../utils/expenseAmounts";
import {
  resolveSupplierForExpense,
} from "../utils/expenseSuppliers";
import {
  NEW_EXPENSE_VAT_DEFAULTS,
  PERSONAL_ACCOUNT_PURCHASE_DEFAULTS,
  VAT_DEDUCTION_STATUS,
  applyExpenseVatSuggestions,
  getSuggestedEuTransactionType,
  normalizeExpenseVatFields,
  suggestExpenseVatClassification,
  validateExpenseVatClassification,
} from "../utils/expenseVatClassification";
import {
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  REVERSE_CHARGE_RATE_STATUS,
  VAT_DEDUCTIBILITY,
  VAT_ORIGIN,
  VAT_REVIEW_STATUS,
} from "../utils/vatDeclaration";
import { exportExpensesCsv } from "../utils/exportCsv";
import MonthlyAccountingExport from "./MonthlyAccountingExport";
import {
  buildExpensesFromImportRows,
  parseExpensesCsv,
} from "../utils/importExpensesCsv";
import {
  collectExpenseYears,
  computeExpenseMonthlyBreakdown,
  computeExpenseYearTotals,
  filterExpensesByYear,
} from "../utils/expenseYearStats";
import { getPermissions } from "../utils/permissions";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}

function money(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function parseNumberInput(value) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

const emptyExpenseForm = {
  supplierId: "",
  supplierName: "",
  invoiceNumber: "",
  purchaseDate: "",
  amountHT: "",
  vatRate: "",
  vatAmount: "",
  totalTTC: "",
  category: "",
  notes: "",
  ...NEW_EXPENSE_VAT_DEFAULTS,
  ...PERSONAL_ACCOUNT_PURCHASE_DEFAULTS,
};

export default function Expenses({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  setPage,
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [selectedYear, setSelectedYear] = useState(() =>
    String(new Date().getFullYear())
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyExpenseForm);
  const [customVatRateMode, setCustomVatRateMode] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFileName, setImportFileName] = useState("");
  const importInputRef = useRef(null);
  const amountsManualRef = useRef({ vatAmount: false, totalTTC: false });

  const itemsPerPage = 25;
  const expenses = data.expenses || [];
  const canAccessSuppliers = getPermissions(currentRole).pages.includes(
    "suppliers"
  );
  const suppliers = useMemo(
    () =>
      [...(data.suppliers || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      ),
    [data.suppliers]
  );

  const yearOptions = useMemo(
    () => collectExpenseYears(expenses),
    [expenses]
  );

  const yearExpenses = useMemo(
    () => filterExpensesByYear(expenses, selectedYear),
    [expenses, selectedYear]
  );

  const yearTotals = useMemo(
    () => computeExpenseYearTotals(yearExpenses),
    [yearExpenses]
  );

  const monthlyBreakdown = useMemo(
    () => computeExpenseMonthlyBreakdown(expenses, selectedYear),
    [expenses, selectedYear]
  );

  const monthsWithExpenses = monthlyBreakdown.filter((entry) => entry.count > 0);

  const filteredExpenses = yearExpenses
    .filter((expense) => {
      const supplier = resolveSupplierForExpense(expense, suppliers);
      const supplierLabel = supplier?.name || expense.supplierName || "";

      const searchMatch = [
        supplierLabel,
        expense.supplierName,
        expense.invoiceNumber,
        expense.purchaseDate,
        expense.category,
        expense.notes,
        expense.pdfFileName,
        expense.source,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      const supplierMatch =
        !supplierFilter ||
        String(expense.supplierId || "") === String(supplierFilter) ||
        String(supplier?.id || "") === String(supplierFilter);

      return searchMatch && supplierMatch;
    })
    .sort((a, b) => {
      const dateA = new Date(a.purchaseDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.purchaseDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const paginatedExpenses = filteredExpenses.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  function resetAmountOverrides() {
    amountsManualRef.current = { vatAmount: false, totalTTC: false };
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyExpenseForm);
    setCustomVatRateMode(false);
    resetAmountOverrides();
    setShowForm(false);
  }

  function applyHtRateCalculation(next, amountHT, vatRate) {
    const computed = computeVatFromHtAndRate(amountHT, vatRate);
    if (!computed) return next;

    next.vatAmount = formatExpenseAmountField(computed.vatAmount);
    next.totalTTC = formatExpenseAmountField(computed.totalTTC);
    return next;
  }

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "vat_origin" || field === "expense_tax_category") {
        next.eu_transaction_type = getSuggestedEuTransactionType(
          field === "vat_origin" ? value : current.vat_origin,
          field === "expense_tax_category" ? value : current.expense_tax_category
        );
        next.eu_transaction_type_source = "automatic";
      }

      if (field === "eu_transaction_type") {
        next.eu_transaction_type_source = "manual";
      }

      if (field === "amountHT" || field === "vatRate") {
        resetAmountOverrides();
        return applyHtRateCalculation(
          next,
          field === "amountHT" ? value : current.amountHT,
          field === "vatRate" ? value : current.vatRate
        );
      }

      if (field === "vatAmount") {
        amountsManualRef.current.vatAmount = true;
        if (!amountsManualRef.current.totalTTC) {
          const totalTTC = computeTotalFromHtAndVat(current.amountHT, value);
          if (totalTTC != null) {
            next.totalTTC = formatExpenseAmountField(totalTTC);
          }
        }
        return next;
      }

      if (field === "totalTTC") {
        amountsManualRef.current.totalTTC = true;
        return next;
      }

      return next;
    });
  }

  function handleVatRateSelect(value) {
    if (value === VAT_RATE_CUSTOM) {
      setCustomVatRateMode(true);
      return;
    }

    setCustomVatRateMode(false);
    updateForm("vatRate", value);
  }

  function handleSupplierSelect(supplierId) {
    setForm((current) => {
      const next = { ...current, supplierId };
      if (supplierId) {
        const supplier = suppliers.find(
          (item) => String(item.id) === String(supplierId)
        );
        if (supplier) {
          next.supplierName = supplier.name;
          const suggestion = suggestExpenseVatClassification({ expense: next, supplier });
          return applyExpenseVatSuggestions(next, suggestion.suggestions, { overwrite: false });
        }
      }
      return next;
    });
  }

  function goToSupplier(supplierId) {
    if (!supplierId || !setPage) return;
    localStorage.setItem("crm_select_supplier_id", supplierId);
    setPage("suppliers");
  }

  function getFormSupplier(formValue = form) {
    return resolveSupplierForExpense(
      {
        supplierId: formValue.supplierId,
        supplierName: formValue.supplierName,
      },
      suppliers
    );
  }

  function applyVatSuggestion({ overwrite = false } = {}) {
    const supplier = getFormSupplier();
    const result = suggestExpenseVatClassification({ expense: form, supplier });
    const hasManualValues = [
      "vat_origin",
      "expense_tax_category",
      "eu_transaction_type",
      "vat_deductibility",
    ].some((key) => form[key] && form[key] !== NEW_EXPENSE_VAT_DEFAULTS[key]);

    if (
      hasManualValues &&
      !overwrite &&
      !window.confirm("Remplacer les valeurs TVA deja saisies par la proposition ?")
    ) {
      return;
    }

    setForm((current) =>
      applyExpenseVatSuggestions(current, result.suggestions, { overwrite: true })
    );

    const reason = result.reasons[0] || result.warnings[0] || "Classification proposee.";
    showToast(reason, result.warnings.length ? "warning" : "success");
  }

  function getVatValidationErrors() {
    return validateExpenseVatClassification(form, getFormSupplier()).errors;
  }

  function markVatReviewed() {
    const errors = getVatValidationErrors();
    if (errors.length > 0) {
      showToast(errors[0], "error");
      return;
    }
    setForm((current) => ({ ...current, vat_review_status: VAT_REVIEW_STATUS.REVIEWED }));
  }

  function handleExportCsv() {
    if (filteredExpenses.length === 0) {
      showToast("Aucune dépense à exporter.", "error");
      return;
    }

    exportExpensesCsv(
      filteredExpenses,
      `depenses-${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast(`${filteredExpenses.length} dépense(s) exportée(s).`, "success");
  }

  function openImportDialog() {
    importInputRef.current?.click();
  }

  function resetImportPreview() {
    setImportPreview(null);
    setImportFileName("");
    if (importInputRef.current) {
      importInputRef.current.value = "";
    }
  }

  function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const text = String(loadEvent.target?.result || "");
        const parsed = parseExpensesCsv(text, suppliers);

        if (parsed.fileErrors.length > 0) {
          showToast(parsed.fileErrors[0], "error");
          resetImportPreview();
          return;
        }

        if (parsed.rows.length === 0) {
          showToast("Le fichier CSV ne contient aucune ligne de dépense.", "error");
          resetImportPreview();
          return;
        }

        setImportFileName(file.name);
        setImportPreview(parsed);
        setShowForm(false);
      } catch (error) {
        console.error(error);
        showToast("Impossible de lire le fichier CSV.", "error");
        resetImportPreview();
      }
    };

    reader.onerror = () => {
      showToast("Erreur lors de la lecture du fichier.", "error");
      resetImportPreview();
    };

    reader.readAsText(file, "UTF-8");
  }

  function confirmImport() {
    if (!importPreview) return;

    const { validRows, invalidRows } = importPreview;
    if (validRows.length === 0) {
      showToast("Aucune ligne valide à importer.", "error");
      return;
    }

    const importedExpenses = buildExpensesFromImportRows(validRows, {
      uid,
      now: today(),
    });

    setData({
      ...data,
      expenses: [...importedExpenses, ...expenses],
    });

    logActivity?.(
      "Import CSV dépenses",
      `${validRows.length} facture(s) depuis ${importFileName || "CSV"}`
    );

    if (invalidRows.length > 0) {
      showToast(
        `${validRows.length} dépense(s) importée(s), ${invalidRows.length} ligne(s) ignorée(s).`,
        "success"
      );
    } else {
      showToast(`${validRows.length} dépense(s) importée(s).`, "success");
    }

    resetImportPreview();
  }

  function expenseSourceLabel(source) {
    if (source === "csv-import") return "CSV";
    if (source === "pdf-import") return "PDF";
    return "Manuel";
  }

  function openManualForm() {
    setEditingId(null);
    setForm(emptyExpenseForm);
    setCustomVatRateMode(false);
    resetAmountOverrides();
    setShowForm(true);
  }

  function editExpense(expense) {
    setEditingId(expense.id);
    setShowForm(true);
    resetAmountOverrides();
    setCustomVatRateMode(
      expense.vatRate != null &&
        expense.vatRate !== "" &&
        !isPresetVatRate(expense.vatRate)
    );
    setForm(normalizeExpenseVatFields({
      ...expense,
      supplierId: expense.supplierId || "",
      supplierName: expense.supplierName || "",
      invoiceNumber: expense.invoiceNumber || "",
      purchaseDate: expense.purchaseDate || "",
      amountHT: expense.amountHT != null ? String(expense.amountHT) : "",
      vatRate: expense.vatRate != null ? String(expense.vatRate) : "",
      vatAmount: expense.vatAmount != null ? String(expense.vatAmount) : "",
      totalTTC: expense.totalTTC != null ? String(expense.totalTTC) : "",
      category: expense.category || "",
      notes: expense.notes || "",
    }));
  }

  function submitExpense(e) {
    e.preventDefault();

    if (!form.supplierName.trim()) {
      showToast("Le nom du fournisseur est obligatoire.", "error");
      return;
    }

    let amountHT = parseNumberInput(form.amountHT);
    let vatRate = parseNumberInput(form.vatRate);
    let vatAmount = parseNumberInput(form.vatAmount);
    let totalTTC = parseNumberInput(form.totalTTC);

    const computed = computeVatFromHtAndRate(form.amountHT, form.vatRate);
    if (
      computed &&
      !amountsManualRef.current.vatAmount &&
      !amountsManualRef.current.totalTTC
    ) {
      vatAmount = computed.vatAmount;
      totalTTC = computed.totalTTC;
    } else {
      vatAmount = vatAmount != null ? roundMoney(vatAmount) : 0;
      totalTTC = totalTTC != null ? roundMoney(totalTTC) : 0;
    }

    amountHT = amountHT != null ? roundMoney(amountHT) : 0;
    vatRate = vatRate ?? 0;

    if (
      [amountHT, vatRate, vatAmount, totalTTC].some(
        (value) => value != null && value < 0
      )
    ) {
      showToast("Les montants ne peuvent pas être négatifs.", "error");
      return;
    }

    const vatErrors = getVatValidationErrors();
    if (form.vat_review_status === VAT_REVIEW_STATUS.REVIEWED && vatErrors.length > 0) {
      showToast(vatErrors[0], "error");
      return;
    }

    const payload = {
      supplierId: form.supplierId || null,
      supplierName: form.supplierName.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      purchaseDate: form.purchaseDate || "",
      amountHT: amountHT ?? 0,
      vatRate: vatRate ?? 0,
      vatAmount: vatAmount ?? 0,
      totalTTC: totalTTC ?? 0,
      category: form.category.trim(),
      notes: form.notes.trim(),
      source: "manual",
      vat_origin: form.vat_origin || null,
      expense_tax_category: form.expense_tax_category || null,
      eu_transaction_type: form.eu_transaction_type || EU_TRANSACTION_TYPE.NONE,
      vat_deductibility: form.vat_deductibility || null,
      deductible_percentage: Number(form.deductible_percentage || 100),
      vat_review_status: form.vat_review_status || VAT_REVIEW_STATUS.TO_REVIEW,
      reverse_charge_vat_rate: Number(form.reverse_charge_vat_rate || 17),
      reverse_charge_rate_status:
        form.reverse_charge_rate_status || REVERSE_CHARGE_RATE_STATUS.TO_REVIEW,
      is_fixed_asset: Boolean(form.is_fixed_asset),
      asset_name: String(form.asset_name || "").trim(),
      asset_purchase_date: form.asset_purchase_date || "",
      asset_value_ht:
        form.asset_value_ht === "" || form.asset_value_ht == null
          ? ""
          : Number(form.asset_value_ht || 0),
      asset_useful_life_years:
        form.asset_useful_life_years === "" || form.asset_useful_life_years == null
          ? ""
          : Number(form.asset_useful_life_years || 0),
      personalAccountPurchase: Boolean(form.personalAccountPurchase),
      paidByPerson: String(form.paidByPerson || "").trim(),
      paidByRole: String(form.paidByRole || "").trim(),
      companyReimbursementStatus: form.companyReimbursementStatus || "not_reimbursable",
      reimbursementDate: form.reimbursementDate || null,
      reimbursementMethod: String(form.reimbursementMethod || "").trim(),
      vatDeductionStatus: form.vatDeductionStatus || VAT_DEDUCTION_STATUS.ACCOUNTANT_REVIEW,
      invoiceInCompanyName: Boolean(form.invoiceInCompanyName),
      invoiceCustomerName: String(form.invoiceCustomerName || "").trim(),
      companyAddressOnInvoice: Boolean(form.companyAddressOnInvoice),
      companyVatNumberOnInvoice: Boolean(form.companyVatNumberOnInvoice),
    };

    if (vatErrors.length > 0) {
      showToast(vatErrors[0], "error");
      return;
    }

    if (editingId) {
      setData({
        ...data,
        expenses: expenses.map((expense) =>
          expense.id === editingId ? { ...expense, ...payload } : expense
        ),
      });
      logActivity?.("Modification dépense", payload.supplierName);
      showToast("Facture de dépense modifiée.", "success");
    } else {
      const expense = {
        id: uid(),
        createdAt: today(),
        ...payload,
      };

      setData({
        ...data,
        expenses: [expense, ...expenses],
      });
      logActivity?.("Ajout dépense", payload.supplierName);
      showToast("Facture de dépense enregistrée.", "success");
    }

    resetForm();
  }

  async function removeExpense(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    const expense = expenses.find((item) => item.id === id);
    if (
      !(await confirmAction({
        title: "Supprimer la dépense",
        message: `Supprimer la facture « ${expense?.invoiceNumber || expense?.supplierName || ""} » ?`,
        detail: "Cette dépense sera retirée des exports et statistiques.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) {
      return;
    }

    setData({
      ...data,
      expenses: expenses.filter((item) => item.id !== id),
    });

    if (editingId === id) {
      resetForm();
    }

    logActivity?.("Suppression dépense", expense?.supplierName || "");
    showToast("Facture de dépense supprimée.", "success");
  }

  const vatValidationErrors = showForm ? getVatValidationErrors() : [];
  const showFixedAssetFields =
    form.expense_tax_category === EXPENSE_TAX_CATEGORY.INVESTMENT ||
    Boolean(form.is_fixed_asset);

  return (
    <section className="expenses-page">
      <div className="page-header">
        <div>
          <h2>Factures de dépense</h2>
          <p>Saisis tes factures fournisseurs et suis HT / TVA / TTC.</p>
        </div>
      </div>

      <div
        className="card expenses-preview"
        data-testid="expenses-preview"
      >
        <div className="expenses-preview__head">
          <div>
            <h3>Aperçu</h3>
            <p className="muted">
              Synthèse des dépenses pour {selectedYear}
              {yearTotals.count > 0
                ? ` · ${yearTotals.count} facture(s)`
                : ""}
            </p>
          </div>
          <label
            className="expenses-preview__year"
            htmlFor="expenses-preview-year"
          >
            <span>Année</span>
            <select
              id="expenses-preview-year"
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setCurrentPage(1);
              }}
              data-testid="expenses-preview-year"
            >
              {yearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stats expenses-stats expenses-preview__stats">
          <div className="card">
            <strong>{yearTotals.count}</strong>
            <span>Facture(s)</span>
          </div>
          <div className="card">
            <strong>{money(yearTotals.ht)}</strong>
            <span>Total HT</span>
          </div>
          <div className="card">
            <strong>{money(yearTotals.vat)}</strong>
            <span>TVA payée</span>
          </div>
          <div className="card">
            <strong>{money(yearTotals.ttc)}</strong>
            <span>Total TTC</span>
          </div>
        </div>

        {monthsWithExpenses.length > 0 && (
          <div className="expenses-monthly-breakdown">
            <h4>Répartition mensuelle ({selectedYear})</h4>
            <div className="expenses-monthly-breakdown__table-wrap">
              <table className="expenses-table expenses-monthly-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Factures</th>
                    <th>HT</th>
                    <th>TVA</th>
                    <th>TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {monthsWithExpenses.map((entry) => (
                    <tr key={entry.month}>
                      <td>{entry.label}</td>
                      <td>{entry.count}</td>
                      <td>{money(entry.ht)}</td>
                      <td>{money(entry.vat)}</td>
                      <td>{money(entry.ttc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="expenses-toolbar">
        <div className="expenses-toolbar-actions">
          <button type="button" className="primary" onClick={openManualForm}>
            + Saisie manuelle
          </button>
          <button type="button" onClick={openImportDialog}>
            Importer CSV
          </button>
          <button type="button" onClick={handleExportCsv}>
            Exporter CSV
          </button>
          <MonthlyAccountingExport data={data} />
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="expenses-import-input"
            onChange={handleImportFileChange}
          />
        </div>

        <div className="expenses-toolbar-filters">
          {canAccessSuppliers && (
            <select
              className="expenses-supplier-filter"
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Tous les fournisseurs</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          )}

          <input
            className="search expenses-search"
            placeholder="Rechercher fournisseur, n° facture, catégorie..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {importPreview && (
        <div className="card expenses-import-panel">
          <div className="expenses-import-header">
            <div>
              <h3>Import CSV — aperçu</h3>
              <p className="muted">
                Fichier : {importFileName || "—"} ·{" "}
                {importPreview.validRows.length} ligne(s) valide(s),{" "}
                {importPreview.invalidRows.length} ignorée(s)
              </p>
            </div>
            <div className="expenses-import-actions">
              <button
                type="button"
                className="primary"
                onClick={confirmImport}
                disabled={importPreview.validRows.length === 0}
              >
                Confirmer l&apos;import ({importPreview.validRows.length})
              </button>
              <button type="button" onClick={resetImportPreview}>
                Annuler
              </button>
            </div>
          </div>

          <details className="expenses-import-format">
            <summary>Format CSV attendu</summary>
            <p>
              Séparateur <strong>;</strong> (recommandé, comme l&apos;export) ou{" "}
              <strong>,</strong>. Première ligne = en-têtes.
            </p>
            <ul>
              <li>
                <strong>date</strong> — JJ/MM/AAAA ou AAAA-MM-JJ (recommandé)
              </li>
              <li>
                <strong>fournisseur</strong> ou <strong>supplier</strong>{" "}
                (obligatoire)
              </li>
              <li>
                <strong>description</strong>, <strong>libellé</strong>{" "}
                (optionnel)
              </li>
              <li>
                <strong>montant_ht</strong> / <strong>HT</strong> (optionnel)
              </li>
              <li>
                <strong>tva</strong>, <strong>taux tva</strong> ou montant TVA
                (optionnel)
              </li>
              <li>
                <strong>montant_ttc</strong> / <strong>TTC</strong> (au moins
                un montant)
              </li>
              <li>
                <strong>n° facture</strong>, <strong>catégorie</strong>{" "}
                (optionnels)
              </li>
            </ul>
            <p className="muted">
              Exemple :{" "}
              <code>
                date;fournisseur;description;montant_ht;tva;montant_ttc
              </code>
            </p>
          </details>

          <div className="expenses-import-table-wrap">
            <table className="expenses-table expenses-import-table">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Date</th>
                  <th>Fournisseur</th>
                  <th>Libellé</th>
                  <th>HT</th>
                  <th>TVA</th>
                  <th>TTC</th>
                  <th>Fournisseur lié</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={row.valid ? "" : "expenses-import-row-error"}
                  >
                    <td>{row.rowIndex}</td>
                    <td>{row.purchaseDate ? formatDate(row.purchaseDate) : "—"}</td>
                    <td>{row.supplierName || "—"}</td>
                    <td>{row.notes || row.category || "—"}</td>
                    <td>{money(row.amountHT)}</td>
                    <td>{money(row.vatAmount)}</td>
                    <td>{money(row.totalTTC)}</td>
                    <td>
                      {row.supplierMatched ? (
                        <span className="expense-import-match">Oui</span>
                      ) : (
                        <span className="expense-import-unmatched">Texte seul</span>
                      )}
                    </td>
                    <td>
                      {row.valid ? (
                        <span className="expense-import-valid">OK</span>
                      ) : (
                        <span className="expense-import-invalid">
                          {row.errors.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card expenses-form-panel" onSubmit={submitExpense}>
          <h3>
            {editingId ? "Modifier la facture" : "Nouvelle facture de dépense"}
          </h3>

          {canAccessSuppliers && (
            <select
              value={form.supplierId}
              onChange={(e) => handleSupplierSelect(e.target.value)}
            >
              <option value="">Lier à un fournisseur (optionnel)</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          )}

          <input
            placeholder="Fournisseur *"
            value={form.supplierName}
            onChange={(e) => updateForm("supplierName", e.target.value)}
          />

          <input
            placeholder="N° facture"
            value={form.invoiceNumber}
            onChange={(e) => updateForm("invoiceNumber", e.target.value)}
          />

          <input
            type="date"
            value={form.purchaseDate}
            onChange={(e) => updateForm("purchaseDate", e.target.value)}
          />

          <input
            placeholder="Montant HT"
            value={form.amountHT}
            onChange={(e) => updateForm("amountHT", e.target.value)}
          />

          <div className="expenses-vat-rate-field">
            <select
              value={resolveVatRateSelectValue(form.vatRate, {
                customMode: customVatRateMode,
              })}
              onChange={(e) => handleVatRateSelect(e.target.value)}
            >
              <option value="">Taux TVA %</option>
              {LUXEMBOURG_VAT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} %
                </option>
              ))}
              <option value={VAT_RATE_CUSTOM}>Saisie manuelle</option>
            </select>
            {(customVatRateMode ||
              resolveVatRateSelectValue(form.vatRate) === VAT_RATE_CUSTOM) && (
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Taux personnalisé %"
                value={form.vatRate}
                onChange={(e) => updateForm("vatRate", e.target.value)}
              />
            )}
          </div>

          <input
            placeholder="Montant TVA €"
            value={form.vatAmount}
            onChange={(e) => updateForm("vatAmount", e.target.value)}
          />

          <input
            placeholder="Total TTC"
            value={form.totalTTC}
            onChange={(e) => updateForm("totalTTC", e.target.value)}
          />

          <input
            placeholder="Catégorie (matériel, consommables...)"
            value={form.category}
            onChange={(e) => updateForm("category", e.target.value)}
          />

          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
          />

          <label className="checkbox-line expenses-personal-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.personalAccountPurchase)}
              onChange={(e) => updateForm("personalAccountPurchase", e.target.checked)}
            />
            Achat effectue avec un compte personnel
          </label>

          {form.personalAccountPurchase ? (
            <details className="expenses-vat-classification expenses-personal-advance" open>
              <summary>Avance personnelle</summary>
              <div className="form-grid">
                <input
                  placeholder="Personne ayant paye"
                  value={form.paidByPerson || ""}
                  onChange={(e) => updateForm("paidByPerson", e.target.value)}
                />
                <input
                  placeholder="Fonction dans la societe"
                  value={form.paidByRole || ""}
                  onChange={(e) => updateForm("paidByRole", e.target.value)}
                />
                <select
                  value={form.companyReimbursementStatus || "not_reimbursable"}
                  onChange={(e) => updateForm("companyReimbursementStatus", e.target.value)}
                >
                  <option value="pending">Remboursable par la societe : oui</option>
                  <option value="not_reimbursable">Remboursable par la societe : non</option>
                  <option value="reimbursed">Deja rembourse</option>
                </select>
                {form.companyReimbursementStatus === "reimbursed" ? (
                  <>
                    <input
                      type="date"
                      value={form.reimbursementDate || ""}
                      onChange={(e) => updateForm("reimbursementDate", e.target.value)}
                    />
                    <select
                      value={form.reimbursementMethod || ""}
                      onChange={(e) => updateForm("reimbursementMethod", e.target.value)}
                    >
                      <option value="">Mode de remboursement</option>
                      <option value="Virement">Virement</option>
                      <option value="Especes">Especes</option>
                      <option value="Carte">Carte</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </>
                ) : null}
                <label className="checkbox-line"><input type="checkbox" checked={Boolean(form.invoiceInCompanyName)} onChange={(e) => updateForm("invoiceInCompanyName", e.target.checked)} />Facture au nom de la societe</label>
                <input placeholder="Nom indique sur la facture" value={form.invoiceCustomerName || ""} onChange={(e) => updateForm("invoiceCustomerName", e.target.value)} />
                <label className="checkbox-line"><input type="checkbox" checked={Boolean(form.companyAddressOnInvoice)} onChange={(e) => updateForm("companyAddressOnInvoice", e.target.checked)} />Adresse de la societe presente</label>
                <label className="checkbox-line"><input type="checkbox" checked={Boolean(form.companyVatNumberOnInvoice)} onChange={(e) => updateForm("companyVatNumberOnInvoice", e.target.checked)} />Numero de TVA de la societe present</label>
              </div>
              <p className="muted">TVA deductible : recuperable au Luxembourg. TVA non deductible : conservee dans le cout TTC. TVA etrangere : exclue de la TVA deductible LU. A verifier : controle comptable requis.</p>
              {!form.companyVatNumberOnInvoice ? <p className="warning">Le numero de TVA de la societe n'est pas present sur cette facture. Verifiez la deductibilite de la TVA.</p> : null}
            </details>
          ) : null}

          <details className="expenses-vat-classification" open>
            <summary>Classification TVA</summary>
            <div className="form-grid">
              <select
                value={form.vat_origin || ""}
                onChange={(e) => updateForm("vat_origin", e.target.value || null)}
              >
                <option value="">Origine TVA</option>
                <option value={VAT_ORIGIN.LU}>LU</option>
                <option value={VAT_ORIGIN.EU}>EU</option>
                <option value={VAT_ORIGIN.NON_EU}>NON_EU</option>
              </select>
              <select
                value={form.expense_tax_category || ""}
                onChange={(e) => updateForm("expense_tax_category", e.target.value || null)}
              >
                <option value="">Categorie fiscale</option>
                <option value={EXPENSE_TAX_CATEGORY.MERCHANDISE}>Marchandises</option>
                <option value={EXPENSE_TAX_CATEGORY.RAW_MATERIAL}>Matieres / consommables</option>
                <option value={EXPENSE_TAX_CATEGORY.INVESTMENT}>Immobilisation</option>
                <option value={EXPENSE_TAX_CATEGORY.GENERAL_EXPENSE}>Frais generaux</option>
                <option value={EXPENSE_TAX_CATEGORY.SERVICE}>Service</option>
                <option value={EXPENSE_TAX_CATEGORY.VEHICLE}>Vehicule</option>
                <option value={EXPENSE_TAX_CATEGORY.NON_DEDUCTIBLE}>Non deductible</option>
                <option value={EXPENSE_TAX_CATEGORY.OTHER}>Autre</option>
              </select>
              {form.vat_origin === VAT_ORIGIN.EU ? (
                <label>
                  <select
                    value={form.eu_transaction_type || EU_TRANSACTION_TYPE.NONE}
                    onChange={(e) => updateForm("eu_transaction_type", e.target.value || null)}
                  >
                    <option value={EU_TRANSACTION_TYPE.NONE}>Type UE: none</option>
                    <option value={EU_TRANSACTION_TYPE.GOODS}>Bien UE</option>
                    <option value={EU_TRANSACTION_TYPE.SERVICE}>Service UE</option>
                  </select>
                  <small className="muted">
                    {form.eu_transaction_type_source === "manual"
                      ? "Classification personnalisee."
                      : "Deduit automatiquement de la categorie."}
                  </small>
                </label>
              ) : null}
              <select
                value={form.vat_deductibility || ""}
                onChange={(e) => updateForm("vat_deductibility", e.target.value || null)}
              >
                <option value="">Deductibilite</option>
                <option value={VAT_DEDUCTIBILITY.FULLY}>100 % deductible</option>
                <option value={VAT_DEDUCTIBILITY.PARTIALLY}>Partielle</option>
                <option value={VAT_DEDUCTIBILITY.NONE}>Non deductible</option>
              </select>
              <select
                required
                value={form.vatDeductionStatus || VAT_DEDUCTION_STATUS.ACCOUNTANT_REVIEW}
                onChange={(e) => updateForm("vatDeductionStatus", e.target.value)}
              >
                <option value={VAT_DEDUCTION_STATUS.DEDUCTIBLE}>Traitement TVA : deductible</option>
                <option value={VAT_DEDUCTION_STATUS.NON_DEDUCTIBLE}>Traitement TVA : non deductible</option>
                <option value={VAT_DEDUCTION_STATUS.FOREIGN_VAT}>Traitement TVA : TVA etrangere</option>
                <option value={VAT_DEDUCTION_STATUS.ACCOUNTANT_REVIEW}>Traitement TVA : a verifier par le comptable</option>
              </select>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Pourcentage deductible"
                value={form.deductible_percentage ?? 100}
                onChange={(e) => updateForm("deductible_percentage", e.target.value)}
              />
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Taux autoliquidation"
                value={form.reverse_charge_vat_rate ?? 17}
                onChange={(e) => updateForm("reverse_charge_vat_rate", e.target.value)}
              />
              <select
                value={form.reverse_charge_rate_status || REVERSE_CHARGE_RATE_STATUS.SUGGESTED}
                onChange={(e) => updateForm("reverse_charge_rate_status", e.target.value)}
              >
                <option value={REVERSE_CHARGE_RATE_STATUS.CONFIRMED}>Taux confirme</option>
                <option value={REVERSE_CHARGE_RATE_STATUS.SUGGESTED}>Taux suggere</option>
                <option value={REVERSE_CHARGE_RATE_STATUS.TO_REVIEW}>Taux a verifier</option>
              </select>
              <select
                value={form.vat_review_status || VAT_REVIEW_STATUS.TO_REVIEW}
                onChange={(e) => updateForm("vat_review_status", e.target.value)}
              >
                <option value={VAT_REVIEW_STATUS.TO_REVIEW}>A verifier</option>
                <option value={VAT_REVIEW_STATUS.AUTO_SUGGESTED}>Suggestion auto</option>
                <option value={VAT_REVIEW_STATUS.REVIEWED}>Verifie</option>
              </select>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_fixed_asset)}
                  onChange={(e) => updateForm("is_fixed_asset", e.target.checked)}
                />
                Immobilisation
              </label>
            </div>

            {vatValidationErrors.length > 0 && (
              <div className="muted">
                {vatValidationErrors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}

            <div className="expenses-form-actions">
              <button type="button" onClick={() => applyVatSuggestion()}>
                Proposer la classification TVA
              </button>
              <button
                type="button"
                onClick={markVatReviewed}
                disabled={vatValidationErrors.length > 0}
              >
                Marquer comme verifie
              </button>
            </div>
          </details>

          {showFixedAssetFields && (
            <details className="expenses-vat-classification" open>
              <summary>Immobilisation</summary>
              <div className="form-grid">
                <input
                  placeholder="Nom de l'immobilisation"
                  value={form.asset_name || ""}
                  onChange={(e) => updateForm("asset_name", e.target.value)}
                />
                <input
                  type="date"
                  value={form.asset_purchase_date || ""}
                  onChange={(e) => updateForm("asset_purchase_date", e.target.value)}
                />
                <input
                  placeholder="Valeur HT"
                  value={form.asset_value_ht || ""}
                  onChange={(e) => updateForm("asset_value_ht", e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Duree utilisation estimee"
                  value={form.asset_useful_life_years || ""}
                  onChange={(e) => updateForm("asset_useful_life_years", e.target.value)}
                />
              </div>
            </details>
          )}

          <div className="expenses-form-actions">
            <button className="primary" type="submit">
              {editingId ? "Modifier" : "Enregistrer"}
            </button>
            <button type="button" onClick={resetForm}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="table card expenses-table-card">
        <p className="muted">
          {filteredExpenses.length} facture(s) trouvée(s) en {selectedYear}
        </p>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredExpenses.length}
          perPage={itemsPerPage}
        />

        <table className="expenses-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Fournisseur</th>
              <th>N° facture</th>
              <th>HT</th>
              <th>TVA %</th>
              <th>TVA €</th>
              <th>TTC</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedExpenses.length === 0 && (
              <tr>
                <td colSpan="9" className="muted">
                  Aucune facture de dépense pour le moment.
                </td>
              </tr>
            )}
            {paginatedExpenses.map((expense) => {
              const linkedSupplier = resolveSupplierForExpense(
                expense,
                suppliers
              );

              return (
              <tr key={expense.id}>
                <td>{formatDate(expense.purchaseDate || expense.createdAt)}</td>
                <td>
                  {linkedSupplier && setPage && canAccessSuppliers ? (
                    <button
                      type="button"
                      className="expense-supplier-link"
                      onClick={() => goToSupplier(linkedSupplier.id)}
                    >
                      {expense.supplierName || linkedSupplier.name}
                    </button>
                  ) : (
                    <strong>{expense.supplierName || "—"}</strong>
                  )}
                  {expense.category && (
                    <div className="expense-meta">{expense.category}</div>
                  )}
                  {expense.pdfFileName && (
                    <div className="expense-meta">{expense.pdfFileName}</div>
                  )}
                </td>
                <td>{expense.invoiceNumber || "—"}</td>
                <td>{money(expense.amountHT)}</td>
                <td>
                  {expense.vatRate != null && expense.vatRate !== ""
                    ? `${Number(expense.vatRate).toLocaleString("fr-FR")} %`
                    : "—"}
                </td>
                <td>{money(expense.vatAmount)}</td>
                <td>{money(expense.totalTTC)}</td>
                <td>
                  <span
                    className={`expense-source-badge ${
                      expense.source === "manual"
                        ? "manual"
                        : expense.source === "csv-import"
                          ? "csv"
                          : ""
                    }`}
                  >
                    {expenseSourceLabel(expense.source)}
                  </span>
                </td>
                <td>
                  <div className="expense-actions">
                    <button type="button" onClick={() => editExpense(expense)}>
                      Modifier
                    </button>
                    {canDeleteData(currentRole) && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => removeExpense(expense.id)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
