import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabase";
import { clientName, statusClass } from "../utils/documents";
import {
  buildPaidInvoiceUpdate,
  buildUnpaidInvoiceRevert,
  findInvoiceByReference,
  getReconcilableInvoices,
  getTransactionReconciliationState,
  suggestInvoiceMatches,
} from "../utils/bankReconciliation";
import {
  applyLocalBankTransactionPatch,
  bankTransactionErrorHint,
  deleteBankTransaction,
  ignorePatchVariants,
  logBankTransactionError,
  patchBankTransaction,
  reconcilePatchVariants,
  removeLocalBankTransaction,
} from "../utils/bankTransactionSync";
import { isPaidInvoice } from "../utils/invoices";
import { money } from "../utils/money";
import { showToast } from "../utils/toast";

const EMPTY_MANUAL_FORM = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  amount: "",
};

export default function Banque({ data, setData, logActivity }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [selectedInvoiceByTx, setSelectedInvoiceByTx] = useState({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [workingTxId, setWorkingTxId] = useState(null);

  const invoices = data?.invoices || [];
  const reconcilableInvoices = useMemo(
    () => getReconcilableInvoices(invoices),
    [invoices]
  );

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadTransactions();
    }
  }, []);

  async function loadTransactions() {
    if (!isSupabaseConfigured) return;

    setLoading(true);

    const { data: rows, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });

    if (error) {
      console.error(error);
      showToast("Impossible de charger les transactions bancaires", "error");
    } else {
      setTransactions(rows || []);
    }

    setLoading(false);
  }

  async function addManualTransaction(event) {
    event.preventDefault();

    const amount = Number(manualForm.amount);
    if (!manualForm.description.trim()) {
      showToast("Indiquez une description", "error");
      return;
    }
    if (Number.isNaN(amount) || amount === 0) {
      showToast("Indiquez un montant valide", "error");
      return;
    }

    const { error } = await supabase.from("bank_transactions").insert([
      {
        transaction_date: manualForm.date,
        description: manualForm.description.trim(),
        amount,
        currency: "EUR",
        status: "non rapprochée",
        matched: false,
      },
    ]);

    if (error) {
      console.error(error);
      showToast("Impossible d'ajouter la transaction", "error");
      return;
    }

    showToast("Transaction ajoutée", "success");
    setManualForm(EMPTY_MANUAL_FORM);
    setShowManualForm(false);
    await loadTransactions();
    await logActivity?.(
      "Transaction bancaire ajoutée",
      `${manualForm.description.trim()} — ${money(amount)}`
    );
  }

  async function reconcileTransaction(transaction, invoice) {
    if (!invoice) {
      showToast("Sélectionnez une facture", "error");
      return;
    }

    setWorkingTxId(transaction.id);

    const bankResult = await patchBankTransaction(
      supabase,
      transaction.id,
      reconcilePatchVariants(invoice)
    );

    if (!bankResult.ok) {
      logBankTransactionError("rapprochement", bankResult.error);
      setTransactions((current) =>
        applyLocalBankTransactionPatch(
          current,
          transaction.id,
          bankResult.patch || reconcilePatchVariants(invoice).at(-1)
        )
      );
      showToast(
        "Rapprochement enregistré localement ; Supabase non mis à jour." +
          bankTransactionErrorHint(bankResult.error),
        "error",
        7000
      );
    }

    const nextInvoices = invoices.map((entry) =>
      String(entry.id) === String(invoice.id)
        ? buildPaidInvoiceUpdate(entry, transaction)
        : entry
    );

    await setData({
      ...data,
      invoices: nextInvoices,
    });

    showToast(
      bankResult.ok
        ? `Facture ${invoice.number} rapprochée`
        : `Facture ${invoice.number} marquée payée (banque locale uniquement)`,
      bankResult.ok ? "success" : "info"
    );
    await logActivity?.(
      "Rapprochement bancaire",
      `${invoice.number} — ${money(transaction.amount)}`
    );

    setSelectedInvoiceByTx((current) => {
      const next = { ...current };
      delete next[transaction.id];
      return next;
    });

    if (bankResult.ok) {
      await loadTransactions();
    }
    setWorkingTxId(null);
  }

  async function ignoreTransaction(transaction) {
    if (
      !confirm(
        "Marquer cette transaction comme rapprochée sans facture associée ?"
      )
    ) {
      return;
    }

    setWorkingTxId(transaction.id);

    const bankResult = await patchBankTransaction(
      supabase,
      transaction.id,
      ignorePatchVariants()
    );

    if (!bankResult.ok) {
      logBankTransactionError("ignorer", bankResult.error);
      const localPatch =
        bankResult.patch || ignorePatchVariants().at(-1);
      setTransactions((current) =>
        applyLocalBankTransactionPatch(
          current,
          transaction.id,
          localPatch
        )
      );
      showToast(
        "Transaction marquée localement ; Supabase non mis à jour." +
          bankTransactionErrorHint(bankResult.error),
        "error",
        7000
      );
      setWorkingTxId(null);
      return;
    }

    showToast("Transaction marquée comme rapprochée", "success");
    await logActivity?.(
      "Transaction bancaire ignorée",
      transaction.description || transaction.id
    );
    await loadTransactions();
    setWorkingTxId(null);
  }

  async function deleteTransaction(transaction) {
    const reconciliation = getTransactionReconciliationState(
      transaction,
      invoices
    );
    const linkedInvoice = reconciliation.invoice;

    const confirmMessage = linkedInvoice
      ? `Cette transaction est rapprochée avec la facture ${linkedInvoice.number}. La supprimer remettra la facture en « Non payée ». Confirmer ?`
      : "Supprimer cette transaction bancaire ?";

    if (!confirm(confirmMessage)) {
      return;
    }

    setWorkingTxId(transaction.id);

    const deleteResult = await deleteBankTransaction(supabase, transaction.id);

    if (!deleteResult.ok) {
      logBankTransactionError("suppression", deleteResult.error);
      showToast(
        "Impossible de supprimer la transaction." +
          bankTransactionErrorHint(deleteResult.error),
        "error",
        7000
      );
      setWorkingTxId(null);
      return;
    }

    setTransactions((current) =>
      removeLocalBankTransaction(current, transaction.id)
    );

    if (linkedInvoice) {
      const nextInvoices = invoices.map((entry) =>
        String(entry.id) === String(linkedInvoice.id)
          ? buildUnpaidInvoiceRevert(entry)
          : entry
      );

      await setData({
        ...data,
        invoices: nextInvoices,
      });
    }

    setSelectedInvoiceByTx((current) => {
      const next = { ...current };
      delete next[transaction.id];
      return next;
    });

    showToast(
      linkedInvoice
        ? `Transaction supprimée — facture ${linkedInvoice.number} remise en non payée`
        : "Transaction supprimée",
      "success"
    );
    await logActivity?.(
      "Transaction bancaire supprimée",
      transaction.description || transaction.id
    );
    setWorkingTxId(null);
  }

  const stats = useMemo(() => {
    const credits = transactions.filter((tx) => Number(tx.amount) > 0);
    const debits = transactions.filter((tx) => Number(tx.amount) < 0);

    return {
      total: transactions.length,
      pending: transactions.filter((tx) => !tx.matched).length,
      matched: transactions.filter((tx) => tx.matched).length,
      creditsTotal: credits.reduce((sum, tx) => sum + Number(tx.amount), 0),
      debitsTotal: debits.reduce((sum, tx) => sum + Number(tx.amount), 0),
      balance: transactions.reduce((sum, tx) => sum + Number(tx.amount), 0),
    };
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    if (filter === "pending") {
      return transactions.filter((tx) => !tx.matched);
    }
    if (filter === "matched") {
      return transactions.filter((tx) => tx.matched);
    }
    return transactions;
  }, [transactions, filter]);

  function defaultInvoiceId(transaction) {
    const suggestions = suggestInvoiceMatches(transaction, invoices, data, {
      limit: 1,
    });
    if (suggestions[0]) return String(suggestions[0].invoice.id);

    const fromDescription = findInvoiceByReference(
      invoices,
      transaction.description
    );
    if (fromDescription) return String(fromDescription.id);

    return "";
  }

  function renderInvoiceOption(invoice) {
    return `${invoice.number} — ${clientName(data, invoice.clientId)} — ${money(
      invoice.totalTTC
    )}`;
  }

  if (!isSupabaseConfigured) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h2>Banque</h2>
            <p>Rapprochement bancaire des factures CRM.</p>
          </div>
        </div>

        <div className="card">
          <h3>Supabase requis</h3>
          <p className="muted">
            Les transactions bancaires sont stockées dans Supabase
            (<code>bank_transactions</code>). Configurez{" "}
            <code>VITE_SUPABASE_URL</code> et{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> pour activer le rapprochement.
          </p>
          <p className="muted">
            Factures CRM disponibles localement : {invoices.length}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Banque</h2>
          <p>
            Rapprochez les mouvements bancaires avec les factures du CRM.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={loadTransactions} disabled={loading}>
            Synchroniser
          </button>
          <button
            className="primary"
            onClick={() => setShowManualForm((value) => !value)}
          >
            Ajouter une transaction
          </button>
        </div>
      </div>

      {showManualForm && (
        <form className="card" onSubmit={addManualTransaction}>
          <h3>Ajouter une transaction manuelle</h3>
          <p className="muted">
            Utile en attendant la connexion Tink ou pour saisir un virement reçu.
          </p>

          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={manualForm.date}
                onChange={(event) =>
                  setManualForm({ ...manualForm, date: event.target.value })
                }
              />
            </label>

            <label>
              Montant (€)
              <input
                type="number"
                step="0.01"
                value={manualForm.amount}
                onChange={(event) =>
                  setManualForm({ ...manualForm, amount: event.target.value })
                }
                placeholder="120.00"
              />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <input
                type="text"
                value={manualForm.description}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    description: event.target.value,
                  })
                }
                placeholder="PAIEMENT FAC-2025-0063 Client Dupont"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button type="submit" className="primary">
              Enregistrer
            </button>
            <button type="button" onClick={() => setShowManualForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="dashboard-grid">
        <div className="card">
          <h3>Transactions</h3>
          <p className="kpi-value">{stats.total}</p>
        </div>
        <div className="card">
          <h3>À rapprocher</h3>
          <p className="kpi-value">{stats.pending}</p>
        </div>
        <div className="card">
          <h3>Entrées</h3>
          <p>{money(stats.creditsTotal)}</p>
        </div>
        <div className="card">
          <h3>Solde affiché</h3>
          <p>{money(stats.balance)}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            className={filter === "pending" ? "primary" : ""}
            onClick={() => setFilter("pending")}
          >
            À rapprocher ({stats.pending})
          </button>
          <button
            className={filter === "matched" ? "primary" : ""}
            onClick={() => setFilter("matched")}
          >
            Rapprochées ({stats.matched})
          </button>
          <button
            className={filter === "all" ? "primary" : ""}
            onClick={() => setFilter("all")}
          >
            Toutes
          </button>
        </div>
      </div>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Montant</th>
              <th>Facture / suggestion</th>
              <th>Statut</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6">Chargement...</td>
              </tr>
            )}

            {!loading && visibleTransactions.length === 0 && (
              <tr>
                <td colSpan="6">Aucune transaction pour ce filtre.</td>
              </tr>
            )}

            {!loading &&
              visibleTransactions.map((transaction) => {
                const reconciliation = getTransactionReconciliationState(
                  transaction,
                  invoices
                );
                const suggestions = suggestInvoiceMatches(
                  transaction,
                  invoices,
                  data,
                  { limit: 3 }
                );
                const selectedInvoiceId =
                  selectedInvoiceByTx[transaction.id] ??
                  defaultInvoiceId(transaction);
                const selectedInvoice =
                  reconcilableInvoices.find(
                    (invoice) => String(invoice.id) === String(selectedInvoiceId)
                  ) ||
                  invoices.find(
                    (invoice) => String(invoice.id) === String(selectedInvoiceId)
                  ) ||
                  null;
                const isWorking = workingTxId === transaction.id;

                return (
                  <tr key={transaction.id}>
                    <td>{transaction.transaction_date || "—"}</td>
                    <td>{transaction.description || "—"}</td>
                    <td>{money(transaction.amount)}</td>
                    <td>
                      {reconciliation.status === "matched" && reconciliation.invoice && (
                        <div>
                          <strong>{reconciliation.invoice.number}</strong>
                          <div className="muted">
                            {clientName(data, reconciliation.invoice.clientId)}
                          </div>
                        </div>
                      )}

                      {reconciliation.status === "orphan" && (
                        <div>
                          <span className="badge warning">Facture introuvable</span>
                          <div className="muted">
                            Réf. {transaction.matched_invoice}
                          </div>
                        </div>
                      )}

                      {reconciliation.status === "ignored" && (
                        <span className="muted">Sans facture</span>
                      )}

                      {reconciliation.status === "pending" && (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {suggestions.length > 0 && (
                            <div className="muted">
                              Suggestion :{" "}
                              <strong>{suggestions[0].invoice.number}</strong>{" "}
                              ({suggestions[0].reasons.join(", ")})
                            </div>
                          )}

                          <select
                            value={selectedInvoiceId}
                            onChange={(event) =>
                              setSelectedInvoiceByTx({
                                ...selectedInvoiceByTx,
                                [transaction.id]: event.target.value,
                              })
                            }
                          >
                            <option value="">Choisir une facture</option>
                            {reconcilableInvoices.map((invoice) => (
                              <option key={invoice.id} value={invoice.id}>
                                {renderInvoiceOption(invoice)}
                              </option>
                            ))}
                            {selectedInvoice &&
                              isPaidInvoice(selectedInvoice) &&
                              !reconcilableInvoices.some(
                                (invoice) =>
                                  String(invoice.id) === String(selectedInvoice.id)
                              ) && (
                                <option value={selectedInvoice.id}>
                                  {renderInvoiceOption(selectedInvoice)} (déjà payée)
                                </option>
                              )}
                          </select>
                        </div>
                      )}
                    </td>
                    <td>
                      {transaction.matched ? (
                        <span className="badge payee">Rapprochée</span>
                      ) : (
                        <span className="badge non-payee">En attente</span>
                      )}
                    </td>
                    <td>
                      {!transaction.matched && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            className="primary"
                            disabled={!selectedInvoice || isWorking}
                            onClick={() =>
                              reconcileTransaction(transaction, selectedInvoice)
                            }
                          >
                            Rapprocher
                          </button>
                          <button
                            disabled={isWorking}
                            onClick={() => ignoreTransaction(transaction)}
                          >
                            Ignorer
                          </button>
                          <button
                            className="danger"
                            disabled={isWorking}
                            onClick={() => deleteTransaction(transaction)}
                          >
                            Supprimer
                          </button>
                        </div>
                      )}

                      {transaction.matched && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          {reconciliation.invoice && (
                            <span className={statusClass(reconciliation.invoice.status)}>
                              {reconciliation.invoice.status}
                            </span>
                          )}
                          <button
                            className="danger"
                            disabled={isWorking}
                            onClick={() => deleteTransaction(transaction)}
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
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
