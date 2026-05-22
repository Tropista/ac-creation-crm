import { useMemo, useRef, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import { showToast } from "../utils/toast";
import { parseExpenseFromPdf } from "../utils/expensePdfExtract";

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
  supplierName: "",
  invoiceNumber: "",
  purchaseDate: "",
  amountHT: "",
  vatRate: "",
  vatAmount: "",
  totalTTC: "",
  category: "",
  notes: "",
  pdfFileName: "",
  source: "manual",
};

const VAT_RATE_OPTIONS = ["", "3", "8", "14", "16", "17", "20"];

export default function Expenses({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyExpenseForm);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const itemsPerPage = 25;
  const expenses = data.expenses || [];

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
    .filter((expense) =>
      [
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
        .includes(search.trim().toLowerCase())
    )
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
      supplierName: expense.supplierName || "",
      invoiceNumber: expense.invoiceNumber || "",
      purchaseDate: expense.purchaseDate || "",
      amountHT: expense.amountHT != null ? String(expense.amountHT) : "",
      vatRate: expense.vatRate != null ? String(expense.vatRate) : "",
      vatAmount: expense.vatAmount != null ? String(expense.vatAmount) : "",
      totalTTC: expense.totalTTC != null ? String(expense.totalTTC) : "",
      category: expense.category || "",
      notes: expense.notes || "",
      pdfFileName: expense.pdfFileName || "",
      source: expense.source || "manual",
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
      supplierName: form.supplierName.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      purchaseDate: form.purchaseDate || "",
      amountHT: amountHT ?? 0,
      vatRate: vatRate ?? 0,
      vatAmount: vatAmount ?? 0,
      totalTTC: totalTTC ?? 0,
      category: form.category.trim(),
      notes: form.notes.trim(),
      pdfFileName: form.pdfFileName.trim(),
      source: form.source || "manual",
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

  async function handlePdfImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Seuls les fichiers PDF sont acceptés.", "error");
      event.target.value = "";
      return;
    }

    setImporting(true);

    try {
      const parsed = await parseExpenseFromPdf(file);

      setEditingId(null);
      setForm({
        supplierName: parsed.supplierName || "",
        invoiceNumber: parsed.invoiceNumber || "",
        purchaseDate: parsed.purchaseDate || "",
        amountHT: parsed.amountHT !== "" ? String(parsed.amountHT) : "",
        vatRate: parsed.vatRate !== "" ? String(parsed.vatRate) : "",
        vatAmount: parsed.vatAmount !== "" ? String(parsed.vatAmount) : "",
        totalTTC: parsed.totalTTC !== "" ? String(parsed.totalTTC) : "",
        category: "",
        notes: "",
        pdfFileName: file.name,
        source: "pdf-import",
      });
      setShowForm(true);

      if (parsed.extractionSuccess) {
        showToast(
          "PDF analysé — vérifie les champs avant d'enregistrer.",
          "success"
        );
      } else {
        showToast(
          "Extraction partielle — complète les champs manuellement.",
          "error"
        );
      }
    } catch (error) {
      console.error(error);
      setEditingId(null);
      setForm({
        ...emptyExpenseForm,
        pdfFileName: file.name,
        source: "pdf-import",
      });
      setShowForm(true);
      showToast(
        "Impossible de lire le PDF — saisis la facture manuellement.",
        "error"
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  return (
    <section className="expenses-page">
      <div className="page-header">
        <div>
          <h2>Factures de dépense</h2>
          <p>
            Importe des factures PDF, extrais HT / TVA / TTC et garde une
            liste comptable.
          </p>
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
          <label className="primary expenses-import-label">
            {importing ? "Analyse du PDF..." : "Importer PDF"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              disabled={importing}
              onChange={handlePdfImport}
            />
          </label>
          <button type="button" className="primary" onClick={openManualForm}>
            + Saisie manuelle
          </button>
        </div>

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

      {showForm && (
        <form className="card expenses-form-panel" onSubmit={submitExpense}>
          <h3>
            {editingId
              ? "Modifier la facture"
              : form.source === "pdf-import"
                ? "Vérifier l'import PDF"
                : "Nouvelle facture de dépense"}
          </h3>

          {form.source === "pdf-import" && form.pdfFileName && (
            <p className="expenses-preview-note">
              Fichier : <strong>{form.pdfFileName}</strong> — corrige les
              montants si nécessaire avant enregistrement.
            </p>
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
            <button className="primary" type="submit" disabled={importing}>
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
            {paginatedExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>{formatDate(expense.purchaseDate || expense.createdAt)}</td>
                <td>
                  <strong>{expense.supplierName || "—"}</strong>
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
                      expense.source === "manual" ? "manual" : ""
                    }`}
                  >
                    {expense.source === "pdf-import" ? "PDF" : "Manuel"}
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
