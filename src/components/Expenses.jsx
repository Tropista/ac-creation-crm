import { useMemo, useRef, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import {
  resolveSupplierForExpense,
} from "../utils/expenseSuppliers";
import { exportExpensesCsv } from "../utils/exportCsv";
import MonthlyAccountingExport from "./MonthlyAccountingExport";
import {
  buildExpensesFromImportRows,
  parseExpensesCsv,
} from "../utils/importExpensesCsv";
import { getPermissions } from "../utils/permissions";
import { showToast } from "../utils/toast";

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
};

const VAT_RATE_OPTIONS = ["", "3", "8", "14", "16", "17", "20"];

export default function Expenses({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  setPage,
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyExpenseForm);
  const [importPreview, setImportPreview] = useState(null);
  const [importFileName, setImportFileName] = useState("");
  const importInputRef = useRef(null);

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

  const totals = useMemo(() => {
    return expenses.reduce(
      (acc, expense) => {
        acc.count += 1;
        acc.ht += Number(expense.amountHT || 0);
        acc.vat += Number(expense.vatAmount || 0);
        acc.ttc += Number(expense.totalTTC || 0);
        return acc;
      },
      { count: 0, ht: 0, vat: 0, ttc: 0 }
    );
  }, [expenses]);

  const filteredExpenses = expenses
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

  function resetForm() {
    setEditingId(null);
    setForm(emptyExpenseForm);
    setShowForm(false);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
    setShowForm(true);
  }

  function editExpense(expense) {
    setEditingId(expense.id);
    setShowForm(true);
    setForm({
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
    });
  }

  function submitExpense(e) {
    e.preventDefault();

    if (!form.supplierName.trim()) {
      showToast("Le nom du fournisseur est obligatoire.", "error");
      return;
    }

    const amountHT = parseNumberInput(form.amountHT);
    const vatRate = parseNumberInput(form.vatRate);
    const vatAmount = parseNumberInput(form.vatAmount);
    const totalTTC = parseNumberInput(form.totalTTC);

    if (
      [amountHT, vatRate, vatAmount, totalTTC].some(
        (value) => value != null && value < 0
      )
    ) {
      showToast("Les montants ne peuvent pas être négatifs.", "error");
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
    };

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

  function removeExpense(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    const expense = expenses.find((item) => item.id === id);
    if (
      !confirm(
        `Supprimer la facture « ${expense?.invoiceNumber || expense?.supplierName || ""} » ?`
      )
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

  return (
    <section className="expenses-page">
      <div className="page-header">
        <div>
          <h2>Factures de dépense</h2>
          <p>Saisis tes factures fournisseurs et suis HT / TVA / TTC.</p>
        </div>
      </div>

      <div className="stats expenses-stats">
        <div className="card">
          <strong>{totals.count}</strong>
          <span>Facture(s)</span>
        </div>
        <div className="card">
          <strong>{money(totals.ht)}</strong>
          <span>Total HT</span>
        </div>
        <div className="card">
          <strong>{money(totals.vat)}</strong>
          <span>TVA payée</span>
        </div>
        <div className="card">
          <strong>{money(totals.ttc)}</strong>
          <span>Total TTC</span>
        </div>
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

          <select
            value={form.vatRate}
            onChange={(e) => updateForm("vatRate", e.target.value)}
          >
            <option value="">Taux TVA %</option>
            {VAT_RATE_OPTIONS.filter(Boolean).map((rate) => (
              <option key={rate} value={rate}>
                {rate} %
              </option>
            ))}
          </select>

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
        <p className="muted">{filteredExpenses.length} facture(s) trouvée(s)</p>

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
