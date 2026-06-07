import { useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import { clientName, statusClass } from "../utils/documents";
import {
  CREDIT_NOTE_STATUSES,
  computeCreditNoteCaImpact,
  createCreditNoteFromInvoice,
  downloadCreditNotePdf,
  normalizeCreditNote,
} from "../utils/creditNotes";
import { money } from "../utils/money";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

const emptyForm = {
  reason: "",
  partialTTC: "",
  status: "brouillon",
};

export default function CreditNotes({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sourceInvoiceId, setSourceInvoiceId] = useState("");

  const itemsPerPage = 20;
  const creditNotes = data.creditNotes || [];
  const invoices = data.invoices || [];

  const caImpact = useMemo(
    () => computeCreditNoteCaImpact(creditNotes, { year: new Date().getFullYear() }),
    [creditNotes]
  );

  const filtered = useMemo(() => {
    return creditNotes
      .filter((note) => {
        const haystack = [
          note.number,
          note.reason,
          note.sourceInvoiceNumber,
          clientName(data, note.clientId),
        ]
          .join(" ")
          .toLowerCase();
        if (search && !haystack.includes(search.trim().toLowerCase())) return false;
        if (statusFilter && note.status !== statusFilter) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0) -
          new Date(a.updatedAt || a.createdAt || 0)
      );
  }, [creditNotes, data, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  function updateNote(noteId, patch) {
    setData({
      ...data,
      creditNotes: creditNotes.map((note) =>
        String(note.id) === String(noteId)
          ? normalizeCreditNote({ ...note, ...patch, updatedAt: new Date().toISOString() })
          : note
      ),
    });
  }

  async function removeNote(noteId) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }
    if (
      !(await confirmAction({
        title: "Supprimer l'avoir",
        message: "Cet avoir sera supprimé définitivement.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) return;
    const removed = creditNotes.find((n) => n.id === noteId);
    setData({
      ...data,
      creditNotes: creditNotes.filter((n) => n.id !== noteId),
    });
    logActivity?.("Suppression avoir", removed?.number || noteId);
  }

  function handleCreate(e) {
    e.preventDefault();
    const invoice = invoices.find((entry) => String(entry.id) === String(sourceInvoiceId));
    if (!invoice) {
      showToast("Sélectionnez une facture source.", "error");
      return;
    }

    try {
      const partial =
        form.partialTTC !== "" ? Number(String(form.partialTTC).replace(",", ".")) : null;
      const result = createCreditNoteFromInvoice(data, invoice, {
        partialTTC: partial,
        reason: form.reason,
        status: form.status,
      });
      setData(result);
      logActivity?.("Création avoir", result.creditNote.number, invoice.number);
      showToast(`Avoir ${result.creditNote.number} créé.`, "success");
      setShowCreate(false);
      setForm(emptyForm);
      setSourceInvoiceId("");
    } catch (error) {
      showToast(error.message || "Impossible de créer l'avoir.", "error");
    }
  }

  return (
    <div className="credit-notes-page">
      <div className="credit-notes-header">
        <div>
          <h1>Avoirs</h1>
          <p className="muted">Création depuis facture · impact CA · historique client</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}>
          + Nouvel avoir
        </button>
      </div>

      <div className="credit-notes-stats">
        <div className="card stat">
          <span>Total avoirs</span>
          <strong>{creditNotes.length}</strong>
        </div>
        <div className="card stat">
          <span>Impact CA HT ({new Date().getFullYear()})</span>
          <strong>− {money(caImpact)}</strong>
        </div>
        <div className="card stat">
          <span>Émis</span>
          <strong>{creditNotes.filter((n) => n.status === "émis").length}</strong>
        </div>
      </div>

      <div className="card">
        <div className="credit-notes-toolbar">
          <input
            className="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Tous statuts</option>
            {CREDIT_NOTE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="credit-notes-empty">Aucun avoir pour le moment.</p>
        ) : (
          <>
            <table className="credit-notes-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Facture source</th>
                  <th>Motif</th>
                  <th>TTC</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((note) => (
                  <tr key={note.id}>
                    <td>{note.number}</td>
                    <td>{clientName(data, note.clientId)}</td>
                    <td>{note.sourceInvoiceNumber || "—"}</td>
                    <td>{note.reason || "—"}</td>
                    <td>{money(note.totalTTC)}</td>
                    <td>
                      <span className={statusClass(note.status)}>{note.status}</span>
                    </td>
                    <td>
                      <div className="credit-notes-actions">
                        <button
                          type="button"
                          onClick={() =>
                            downloadCreditNotePdf({
                              note,
                              data,
                              settings: data.settings,
                            })
                          }
                        >
                          PDF
                        </button>
                        {note.status === "brouillon" && (
                          <button
                            type="button"
                            onClick={() => updateNote(note.id, { status: "émis" })}
                          >
                            Émettre
                          </button>
                        )}
                        {note.status === "émis" && (
                          <button
                            type="button"
                            onClick={() => updateNote(note.id, { status: "remboursé" })}
                          >
                            Remboursé
                          </button>
                        )}
                        <button type="button" className="danger" onClick={() => removeNote(note.id)}>
                          Suppr.
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filtered.length}
              perPage={itemsPerPage}
            />
          </>
        )}
      </div>

      {showCreate && (
        <div className="credit-notes-modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="credit-notes-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Créer un avoir</h3>
            <form className="credit-notes-form" onSubmit={handleCreate}>
              <label>
                Facture source
                <select
                  required
                  value={sourceInvoiceId}
                  onChange={(e) => setSourceInvoiceId(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} — {clientName(data, invoice.clientId)} ({money(invoice.totalTTC)})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Montant TTC partiel (vide = total)
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.partialTTC}
                  onChange={(e) => setForm({ ...form, partialTTC: e.target.value })}
                  placeholder="Ex. 50,00"
                />
              </label>
              <label>
                Motif
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Retour, erreur, geste commercial…"
                />
              </label>
              <label>
                Statut initial
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {CREDIT_NOTE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="credit-notes-actions">
                <button type="submit">Créer</button>
                <button type="button" onClick={() => setShowCreate(false)}>
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
