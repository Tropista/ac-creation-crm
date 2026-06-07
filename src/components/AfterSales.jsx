import { useMemo, useState } from "react";
import { canDeleteData } from "../services/authService";
import { clientName } from "../utils/documents";
import {
  AFTER_SALES_SOLUTIONS,
  AFTER_SALES_STATUSES,
  AFTER_SALES_TYPES,
  normalizeAfterSalesCase,
} from "../utils/afterSales";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

const emptyForm = {
  clientId: "",
  invoiceId: "",
  quoteId: "",
  type: "Défaut produit",
  status: "Ouvert",
  solution: "",
  subject: "",
  description: "",
  internalNotes: "",
  assignedTo: "",
};

export default function AfterSales({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const cases = data.afterSalesCases || [];

  const filtered = useMemo(() => {
    return cases
      .filter((entry) => {
        const haystack = [
          entry.subject,
          entry.type,
          entry.description,
          clientName(data, entry.clientId),
          entry.invoiceNumber,
          entry.quoteNumber,
        ]
          .join(" ")
          .toLowerCase();
        if (search && !haystack.includes(search.trim().toLowerCase())) return false;
        if (statusFilter && entry.status !== statusFilter) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.openedAt || 0) -
          new Date(a.updatedAt || a.openedAt || 0)
      );
  }, [cases, data, search, statusFilter]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      clientId: entry.clientId || "",
      invoiceId: entry.invoiceId || "",
      quoteId: entry.quoteId || "",
      type: entry.type,
      status: entry.status,
      solution: entry.solution || "",
      subject: entry.subject || "",
      description: entry.description || "",
      internalNotes: entry.internalNotes || "",
      assignedTo: entry.assignedTo || "",
    });
    setShowForm(true);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId) {
      showToast("Le client est obligatoire.", "error");
      return;
    }

    const invoice = (data.invoices || []).find((i) => String(i.id) === String(form.invoiceId));
    const quote = (data.quotes || []).find((q) => String(q.id) === String(form.quoteId));

    const payload = normalizeAfterSalesCase({
      ...form,
      invoiceNumber: invoice?.number || "",
      quoteNumber: quote?.number || "",
      updatedAt: new Date().toISOString(),
      resolvedAt:
        ["Résolu", "Clôturé"].includes(form.status) && !editingId
          ? new Date().toISOString().slice(0, 10)
          : undefined,
    });

    if (editingId) {
      setData({
        ...data,
        afterSalesCases: cases.map((entry) =>
          String(entry.id) === String(editingId)
            ? normalizeAfterSalesCase({
                ...entry,
                ...payload,
                id: entry.id,
                resolvedAt:
                  ["Résolu", "Clôturé"].includes(form.status)
                    ? entry.resolvedAt || new Date().toISOString().slice(0, 10)
                    : "",
              })
            : entry
        ),
      });
      logActivity?.("Modification SAV", payload.subject || payload.type);
      showToast("Dossier SAV mis à jour.", "success");
    } else {
      const entry = normalizeAfterSalesCase(payload);
      setData({
        ...data,
        afterSalesCases: [...cases, entry],
      });
      logActivity?.("Création SAV", entry.subject || entry.type);
      showToast("Dossier SAV créé.", "success");
    }

    resetForm();
  }

  async function removeCase(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }
    if (
      !(await confirmAction({
        title: "Supprimer le dossier SAV",
        message: "Ce dossier SAV sera supprimé définitivement.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) return;
    setData({
      ...data,
      afterSalesCases: cases.filter((entry) => entry.id !== id),
    });
  }

  return (
    <div className="after-sales-page">
      <div className="after-sales-header">
        <div>
          <h1>Service après-vente</h1>
          <p className="muted">Lié client · facture · commande atelier</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)}>
          + Nouveau dossier
        </button>
      </div>

      <div className="card">
        <div className="after-sales-filters">
          <input
            className="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous statuts</option>
            {AFTER_SALES_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="after-sales-empty">Aucun dossier SAV.</p>
        ) : (
          <div className="after-sales-grid">
            {filtered.map((entry) => (
              <article key={entry.id} className="after-sales-card">
                <div className="after-sales-card__top">
                  <div>
                    <p className="after-sales-card__subject">{entry.subject || entry.type}</p>
                    <p className="after-sales-card__meta">{clientName(data, entry.clientId)}</p>
                  </div>
                  <span
                    className={
                      ["Résolu", "Clôturé"].includes(entry.status)
                        ? "after-sales-status-resolved"
                        : "after-sales-status-open"
                    }
                  >
                    {entry.status}
                  </span>
                </div>
                <p className="after-sales-card__meta">
                  {entry.type}
                  {entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ""}
                  {entry.quoteNumber ? ` · ${entry.quoteNumber}` : ""}
                </p>
                <p className="after-sales-card__meta">
                  {entry.assignedTo
                    ? `👤 ${(data.users || []).find((u) => u.id === entry.assignedTo)?.name || entry.assignedTo}`
                    : <span className="after-sales-unassigned">⚠️ Non assigné</span>}
                </p>
                {entry.description ? <p>{entry.description}</p> : null}
                {entry.internalNotes ? (
                  <p className="muted">
                    <em>Notes : {entry.internalNotes}</em>
                  </p>
                ) : null}
                <div className="after-sales-card__actions">
                  <button type="button" onClick={() => startEdit(entry)}>
                    Modifier
                  </button>
                  <button type="button" className="danger" onClick={() => removeCase(entry.id)}>
                    Suppr.
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="after-sales-modal-backdrop" onClick={resetForm}>
          <div className="after-sales-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Modifier le dossier" : "Nouveau dossier SAV"}</h3>
            <form className="after-sales-form" onSubmit={submit}>
              <label>
                Client *
                <select
                  required
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                >
                  <option value="">Choisir…</option>
                  {(data.clients || []).map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Facture liée
                <select
                  value={form.invoiceId}
                  onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}
                >
                  <option value="">—</option>
                  {(data.invoices || [])
                    .filter((inv) => !form.clientId || String(inv.clientId) === form.clientId)
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Commande atelier (devis)
                <select
                  value={form.quoteId}
                  onChange={(e) => setForm({ ...form, quoteId: e.target.value })}
                >
                  <option value="">—</option>
                  {(data.quotes || [])
                    .filter((q) => !form.clientId || String(q.clientId) === form.clientId)
                    .map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.number}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Type
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {AFTER_SALES_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Statut
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {AFTER_SALES_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Solution
                <select
                  value={form.solution}
                  onChange={(e) => setForm({ ...form, solution: e.target.value })}
                >
                  <option value="">—</option>
                  {AFTER_SALES_SOLUTIONS.map((solution) => (
                    <option key={solution} value={solution}>
                      {solution}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsable
                <select
                  value={form.assignedTo}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                >
                  <option value="">— Non assigné</option>
                  {(data.users || []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Objet
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label>
                Notes internes
                <textarea
                  rows={2}
                  value={form.internalNotes}
                  onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                />
              </label>
              <div className="after-sales-card__actions">
                <button type="submit">{editingId ? "Enregistrer" : "Créer"}</button>
                <button type="button" onClick={resetForm}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
