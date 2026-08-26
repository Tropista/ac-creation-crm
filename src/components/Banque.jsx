import { useEffect, useMemo, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { clientName, statusClass } from "../utils/documents";
import {
  buildPaidInvoiceUpdate,
  buildUnpaidInvoiceRevert,
  findInvoiceByReference,
  getAutoExpenseReconciliationCandidates,
  getAutoReconciliationCandidates,
  getBankTransactionStats,
  getExpenseAmount,
  getReconcilableInvoices,
  getTransactionReconciliationState,
  suggestExpenseMatches,
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
  reconcileExpensePatchVariants,
  removeLocalBankTransaction,
  unlinkPatchVariants,
} from "../utils/bankTransactionSync";
import { isPaidInvoice } from "../utils/invoices";
import { money } from "../utils/money";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";
import {
  disconnectBank,
  fetchBankLinkUrl,
  fetchBankStatus,
  fetchTinkTransactions,
  getBankApiUrl,
} from "../utils/bankApi";
import {
  buildManualBankTransactionPayload,
  buildSyncedBankTransactionPayload,
  createEmptyManualBankForm,
  isManualBankTransaction,
  manualBankTransactionToForm,
} from "../utils/manualBankTransactions";

export default function Banque({ data, setData, logActivity }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [selectedInvoiceByTx, setSelectedInvoiceByTx] = useState({});
  const [selectedExpenseByTx, setSelectedExpenseByTx] = useState({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(createEmptyManualBankForm);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState("");
  const [search, setSearch] = useState("");
  const [workingTxId, setWorkingTxId] = useState(null);
  const [bankStatus, setBankStatus] = useState(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [tinkSyncing, setTinkSyncing] = useState(false);

  const invoices = data?.invoices || [];
  const expenses = data?.expenses || [];
  const reconcilableInvoices = useMemo(
    () => getReconcilableInvoices(invoices),
    [invoices]
  );
  const reconcilableExpenses = useMemo(() => {
    const linkedIds = new Set(
      transactions.filter((transaction) => transaction.matched).map((transaction) => String(transaction.matched_expense_id || "")).filter(Boolean)
    );
    return expenses.filter((expense) => !linkedIds.has(String(expense.id)));
  }, [expenses, transactions]);
  const autoCandidates = useMemo(() => [
    ...getAutoReconciliationCandidates(transactions, invoices, data).map((item) => ({ ...item, type: "invoice" })),
    ...getAutoExpenseReconciliationCandidates(transactions, reconcilableExpenses).map((item) => ({ ...item, type: "expense" })),
  ], [transactions, invoices, reconcilableExpenses, data]);

  useEffect(() => {
    if (isSupabaseConfigured) {
      loadTransactions();
    }
    loadBankStatus();
  }, []);

  async function loadBankStatus() {
    setBankLoading(true);
    try {
      const status = await fetchBankStatus();
      setBankStatus(status);
    } catch (error) {
      console.error(error);
      setBankStatus({
        ok: false,
        configured: false,
        connected: false,
        manualFallback: true,
        message: `API banque indisponible (${getBankApiUrl()}). Utilisez la saisie manuelle.`,
      });
    } finally {
      setBankLoading(false);
    }
  }

  async function connectTink() {
    try {
      const { url } = await fetchBankLinkUrl();
      window.open(url, "_blank", "noopener,noreferrer");
      showToast("Fenêtre Tink ouverte — revenez ici après la connexion.", "info", 6000);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Connexion Tink impossible", "error");
    }
  }

  async function handleDisconnectTink() {
    try {
      await disconnectBank();
      await loadBankStatus();
      showToast("Connexion Tink supprimée.", "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de déconnecter Tink", "error");
    }
  }

  async function syncTinkTransactions() {
    if (!isSupabaseConfigured) {
      showToast("Supabase requis pour enregistrer les transactions.", "error");
      return;
    }

    setTinkSyncing(true);
    try {
      const incoming = await fetchTinkTransactions(100);
      if (!incoming.length) {
        showToast("Aucune transaction Tink à importer.", "info");
        return;
      }

      const freshRows = incoming.filter((tx) => tx.external_id);

      if (!freshRows.length) {
        showToast("Transactions déjà synchronisées.", "info");
        await loadTransactions();
        return;
      }

      const supabase = await getSupabase();
      const { error } = await supabase
        .from("bank_transactions")
        .upsert(freshRows.map(buildSyncedBankTransactionPayload), {
          onConflict: "external_id",
          ignoreDuplicates: true,
        });

      if (error) {
        throw error;
      }

      showToast(`${freshRows.length} transaction(s) Tink importée(s).`, "success");
      await loadTransactions();
      await logActivity?.("Sync Tink", `${freshRows.length} transaction(s)`);
    } catch (error) {
      console.error(error);
      showToast(
        error.message ||
          "Sync Tink impossible — vérifiez la connexion ou utilisez la saisie manuelle.",
        "error",
        7000
      );
    } finally {
      setTinkSyncing(false);
    }
  }

  async function loadTransactions() {
    if (!isSupabaseConfigured) return;

    setLoading(true);

    try {
      const supabase = await getSupabase();
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
    } catch (error) {
      console.error(error);
      showToast("Impossible de charger les transactions bancaires", "error");
    } finally {
      setLoading(false);
    }
  }

  async function addManualTransaction(event) {
    event.preventDefault();
    setManualError("");
    setSavingManual(true);
    try {
      const payload = buildManualBankTransactionPayload(manualForm);
      const supabase = await getSupabase();
      const query = editingTransaction
        ? supabase
            .from("bank_transactions")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", editingTransaction.id)
            .eq("source", "manual")
        : supabase.from("bank_transactions").insert([
            { ...payload, status: "non rapprochée", matched: false },
          ]);
      const { error } = await query;

      if (error) throw error;

      showToast(editingTransaction ? "Transaction modifiée" : "Transaction ajoutée", "success");
      setManualForm(createEmptyManualBankForm());
      setEditingTransaction(null);
      setShowManualForm(false);
      await loadTransactions();
      await logActivity?.(
        editingTransaction ? "Transaction bancaire modifiée" : "Transaction bancaire ajoutée",
        `${payload.description} — ${money(payload.amount)}`
      );
    } catch (error) {
      console.error(error);
      const message = error.message || "Impossible d'enregistrer la transaction";
      setManualError(message);
      showToast(message, "error");
    } finally {
      setSavingManual(false);
    }
  }

  function openManualForm(transaction = null) {
    setEditingTransaction(transaction);
    setManualForm(
      transaction ? manualBankTransactionToForm(transaction) : createEmptyManualBankForm()
    );
    setManualError("");
    setShowManualForm(true);
  }

  function closeManualForm() {
    if (savingManual) return;
    setShowManualForm(false);
    setEditingTransaction(null);
    setManualError("");
  }

  async function reconcileTransaction(transaction, invoice) {
    if (!invoice) {
      showToast("Sélectionnez une facture", "error");
      return;
    }

    setWorkingTxId(transaction.id);

    const supabase = await getSupabase();
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
      !(await confirmAction({
        title: "Ignorer la transaction",
        message: "Marquer cette transaction comme rapprochée sans facture associée ?",
        detail: "Elle ne sera plus proposée dans les rapprochements à traiter.",
        confirmLabel: "Marquer rapprochée",
      }))
    ) {
      return;
    }

    setWorkingTxId(transaction.id);

    const supabase = await getSupabase();
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

  async function autoReconcileTransactions() {
    if (!autoCandidates.length) {
      showToast("Aucun rapprochement automatique fiable trouvé.", "info");
      return;
    }

    if (
      !(await confirmAction({
        title: "Rapprochement automatique",
        message: `Rapprocher automatiquement ${autoCandidates.length} transaction(s) avec leur document ?`,
        detail: "Seules les correspondances fortes et non ambiguës seront validées.",
        confirmLabel: "Rapprocher",
      }))
    ) {
      return;
    }

    setWorkingTxId("auto");

    const supabase = await getSupabase();
    let nextTransactions = transactions;
    let nextInvoices = invoices;
    let reconciledCount = 0;
    let localOnlyCount = 0;

    for (const candidate of autoCandidates) {
      const { transaction, invoice, expense, type } = candidate;
      const variants = type === "expense"
        ? reconcileExpensePatchVariants(expense)
        : reconcilePatchVariants(invoice);
      const bankResult = await patchBankTransaction(
        supabase,
        transaction.id,
        variants
      );
      const patch = bankResult.patch || variants.at(-1);

      if (!bankResult.ok) {
        localOnlyCount += 1;
        logBankTransactionError("rapprochement automatique", bankResult.error);
      }

      nextTransactions = applyLocalBankTransactionPatch(
        nextTransactions,
        transaction.id,
        patch
      );
      if (type === "invoice") {
        nextInvoices = nextInvoices.map((entry) =>
          String(entry.id) === String(invoice.id)
            ? buildPaidInvoiceUpdate(entry, transaction)
            : entry
        );
      }
      reconciledCount += 1;
      await logActivity?.(
        "Rapprochement bancaire auto",
        `${invoice?.number || expense?.invoiceNumber || expense?.supplierName || "Dépense"} — ${money(transaction.amount)}`
      );
    }

    await setData({
      ...data,
      invoices: nextInvoices,
    });
    setTransactions(nextTransactions);
    setSelectedInvoiceByTx({});
    setSelectedExpenseByTx({});

    showToast(
      localOnlyCount
        ? `${reconciledCount} rapprochement(s), dont ${localOnlyCount} localement seulement.`
        : `${reconciledCount} rapprochement(s) automatique(s) enregistré(s).`,
      localOnlyCount ? "info" : "success",
      7000
    );

    await loadTransactions();
    setWorkingTxId(null);
  }

  async function reconcileExpense(transaction, expense) {
    if (!expense) {
      showToast("Sélectionnez une dépense", "error");
      return;
    }
    setWorkingTxId(transaction.id);
    try {
      const supabase = await getSupabase();
      const result = await patchBankTransaction(
        supabase,
        transaction.id,
        reconcileExpensePatchVariants(expense)
      );
      if (!result.ok) throw result.error;
      showToast(`Dépense ${expense.invoiceNumber || expense.supplierName || expense.id} rapprochée`, "success");
      await logActivity?.(
        "Rapprochement bancaire dépense",
        `${expense.supplierName || "Dépense"} — ${money(getExpenseAmount(expense))}`
      );
      setSelectedExpenseByTx((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
      await loadTransactions();
    } catch (error) {
      logBankTransactionError("rapprochement dépense", error);
      showToast("Impossible de rapprocher la dépense." + bankTransactionErrorHint(error), "error", 7000);
    } finally {
      setWorkingTxId(null);
    }
  }

  async function unlinkTransaction(transaction) {
    const reconciliation = getTransactionReconciliationState(transaction, invoices, expenses);
    if (!(await confirmAction({
      title: "Retirer le rapprochement",
      message: "Retirer le lien entre cette transaction et son document ?",
      detail: reconciliation.invoice ? "La facture repassera en statut non payée." : "La dépense elle-même ne sera pas modifiée.",
      confirmLabel: "Retirer",
      danger: true,
    }))) return;

    setWorkingTxId(transaction.id);
    try {
      const supabase = await getSupabase();
      const result = await patchBankTransaction(supabase, transaction.id, unlinkPatchVariants());
      if (!result.ok) throw result.error;
      if (reconciliation.invoice) {
        await setData({
          ...data,
          invoices: invoices.map((invoice) =>
            String(invoice.id) === String(reconciliation.invoice.id)
              ? buildUnpaidInvoiceRevert(invoice)
              : invoice
          ),
        });
      }
      showToast("Rapprochement retiré", "success");
      await loadTransactions();
    } catch (error) {
      logBankTransactionError("retrait rapprochement", error);
      showToast("Impossible de retirer le rapprochement." + bankTransactionErrorHint(error), "error", 7000);
    } finally {
      setWorkingTxId(null);
    }
  }

  async function deleteTransaction(transaction) {
    if (!isManualBankTransaction(transaction)) {
      showToast("Une transaction synchronisée ne peut pas être supprimée.", "error");
      return;
    }
    const reconciliation = getTransactionReconciliationState(
      transaction,
      invoices,
      expenses
    );
    const linkedInvoice = reconciliation.invoice;

    const confirmMessage = linkedInvoice
      ? `Cette transaction est rapprochée avec la facture ${linkedInvoice.number}. La supprimer remettra la facture en « Non payée ». Confirmer ?`
      : "Supprimer cette transaction bancaire ?";

    if (!(await confirmAction({
      title: linkedInvoice ? "Supprimer le rapprochement" : "Supprimer la transaction",
      message: confirmMessage.replace(" Confirmer ?", ""),
      detail: linkedInvoice ? "La facture liée repassera en statut non payé." : "",
      confirmLabel: "Supprimer",
      danger: true,
    }))) {
      return;
    }

    setWorkingTxId(transaction.id);

    const supabase = await getSupabase();
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
    return getBankTransactionStats(transactions);
  }, [transactions]);

  const visibleTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filter === "pending" && tx.matched) return false;
      if (filter === "matched" && !tx.matched) return false;
      if (filter === "entries" && Number(tx.amount) <= 0) return false;
      if (filter === "exits" && Number(tx.amount) >= 0) return false;
      if (!needle) return true;
      return [tx.description, tx.category, tx.reference, tx.payment_method, tx.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [transactions, filter, search]);

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
            Actualiser
          </button>
          <button onClick={loadBankStatus} disabled={bankLoading}>
            Statut Tink
          </button>
          {bankStatus?.configured && !bankStatus?.connected && (
            <button className="primary" onClick={connectTink}>
              Connecter Tink
            </button>
          )}
          {bankStatus?.connected && (
            <>
              <button className="primary" onClick={syncTinkTransactions} disabled={tinkSyncing}>
                {tinkSyncing ? "Sync…" : "Sync Tink → Supabase"}
              </button>
              <button onClick={handleDisconnectTink}>Déconnecter Tink</button>
            </>
          )}
          <button
            className="primary"
            onClick={() => openManualForm()}
          >
            + Ajouter une transaction
          </button>
          <button
            onClick={autoReconcileTransactions}
            disabled={!autoCandidates.length || workingTxId === "auto"}
            title="Rapproche les virements reconnus avec un score élevé et sans ambiguïté"
          >
            {workingTxId === "auto"
              ? "Rapprochement..."
              : `Rapprocher auto (${autoCandidates.length})`}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <h3>Connexion bancaire</h3>
        <p className="muted" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          <strong>Sécurité :</strong> API locale uniquement (<code>127.0.0.1</code>) — Electron
          ou <code>npm run bank</code>. Ne pas déployer ce backend en cloud public.
        </p>
        <p className="muted">
          {bankStatus?.message ||
            "Chargement du statut banque…"}
        </p>
        <p className="muted">
          API : <code>{getBankApiUrl()}</code>
          {bankStatus?.connectedAt
            ? ` · Connecté le ${new Date(bankStatus.connectedAt).toLocaleString("fr-FR")}`
            : ""}
        </p>
        {bankStatus?.manualFallback && (
          <p className="muted">
            Mode manuel actif : ajoutez les virements reçus ci-dessous en attendant Tink.
          </p>
        )}
      </div>

      {showManualForm && (
        <div className="bank-modal-backdrop" onClick={closeManualForm}>
        <form className="bank-modal" onSubmit={addManualTransaction} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bank-modal-title">
          <h3 id="bank-modal-title">{editingTransaction ? "Modifier la transaction" : "Ajouter une transaction manuelle"}</h3>
          <p className="muted">Cette opération bancaire n'est ni une facture, ni un avoir, ni une écriture automatique de CA ou de TVA.</p>
          {manualError && <p className="bank-form-error" role="alert">{manualError}</p>}
          <div className="form-grid bank-form-grid">
            <label>
              Date de transaction
              <input
                type="date"
                required
                value={manualForm.date}
                onChange={(event) =>
                  setManualForm({ ...manualForm, date: event.target.value })
                }
              />
            </label>

            <label>
              Type
              <select value={manualForm.type} onChange={(event) => setManualForm({ ...manualForm, type: event.target.value })}>
                <option value="credit">Entrée</option>
                <option value="debit">Sortie</option>
              </select>
            </label>

            <label>
              Montant positif (€)
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={manualForm.amount}
                onChange={(event) =>
                  setManualForm({ ...manualForm, amount: event.target.value })
                }
                placeholder="120.00"
              />
            </label>

            <label>
              Catégorie
              <input value={manualForm.category} onChange={(event) => setManualForm({ ...manualForm, category: event.target.value })} placeholder="Frais bancaires, apport…" />
            </label>

            <label className="bank-field-wide">
              Libellé
              <input
                type="text"
                required
                value={manualForm.description}
                onChange={(event) =>
                  setManualForm({
                    ...manualForm,
                    description: event.target.value,
                  })
                }
                placeholder="PAIEMENT FAC-2026-0063 Client Dupont"
              />
            </label>

            <label>
              Référence / communication
              <input value={manualForm.reference} onChange={(event) => setManualForm({ ...manualForm, reference: event.target.value })} />
            </label>

            <label>
              Mode de paiement
              <select value={manualForm.paymentMethod} onChange={(event) => setManualForm({ ...manualForm, paymentMethod: event.target.value })}>
                <option value="">Non précisé</option>
                <option value="Virement">Virement</option>
                <option value="Carte">Carte</option>
                <option value="Espèces">Espèces</option>
                <option value="Prélèvement">Prélèvement</option>
                <option value="Chèque">Chèque</option>
                <option value="Autre">Autre</option>
              </select>
            </label>

            <label className="bank-field-wide">
              Notes
              <textarea rows="3" value={manualForm.notes} onChange={(event) => setManualForm({ ...manualForm, notes: event.target.value })} />
            </label>
          </div>

          <div className="bank-modal-actions">
            <button type="button" onClick={closeManualForm} disabled={savingManual}>
              Annuler
            </button>
            <button type="submit" className="primary" disabled={savingManual}>
              {savingManual ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card">
          <h3>Transactions</h3>
          <p className="kpi-value">{stats.total}</p>
        </div>
        <div className="card">
          <h3>Entrées</h3>
          <p className="kpi-value">{money(stats.entriesTotal)}</p>
        </div>
        <div className="card">
          <h3>Sorties</h3>
          <p className="kpi-value">{money(stats.exitsTotal)}</p>
        </div>
        <div className="card">
          <h3>Solde</h3>
          <p className="kpi-value">{money(stats.balance)}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <input className="bank-search" type="search" placeholder="Rechercher une transaction…" value={search} onChange={(event) => setSearch(event.target.value)} />
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
          <button className={filter === "entries" ? "primary" : ""} onClick={() => setFilter("entries")}>Entrées</button>
          <button className={filter === "exits" ? "primary" : ""} onClick={() => setFilter("exits")}>Sorties</button>
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
          Auto-match fiable : {autoCandidates.length} transaction(s). Le CRM valide seulement les
          cas avec référence/montant/client très cohérents.
        </p>
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
                  invoices,
                  expenses
                );
                const invoiceSuggestions = suggestInvoiceMatches(
                  transaction,
                  invoices,
                  data,
                  { limit: 3 }
                );
                const expenseSuggestions = suggestExpenseMatches(transaction, reconcilableExpenses, { limit: 3 });
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
                const selectedExpenseId = selectedExpenseByTx[transaction.id] ??
                  (expenseSuggestions[0] ? String(expenseSuggestions[0].expense.id) : "");
                const selectedExpense = expenses.find(
                  (expense) => String(expense.id) === String(selectedExpenseId)
                ) || null;
                const isEntry = Number(transaction.amount) > 0;
                const isWorking = workingTxId === transaction.id;

                return (
                  <tr key={transaction.id}>
                    <td>{transaction.transaction_date || "—"}</td>
                    <td>
                      <div>{transaction.description || "—"}</div>
                      <div className="bank-transaction-meta">
                        {isManualBankTransaction(transaction) && <span className="badge bank-manual-badge">Saisie manuelle</span>}
                        {transaction.category && <span>{transaction.category}</span>}
                        {transaction.reference && <span>Réf. {transaction.reference}</span>}
                      </div>
                    </td>
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

                      {reconciliation.status === "matched" && reconciliation.expense && (
                        <div>
                          <strong>Dépense {reconciliation.expense.supplierName || "—"} — {money(getExpenseAmount(reconciliation.expense))}</strong>
                          <div className="muted">{reconciliation.expense.invoiceNumber || "Sans référence"}</div>
                        </div>
                      )}

                      {reconciliation.status === "orphan" && (
                        <div>
                          <span className="badge warning">Document introuvable</span>
                          <div className="muted">
                            Réf. {transaction.matched_invoice || transaction.matched_expense_reference || transaction.matched_expense_id}
                          </div>
                        </div>
                      )}

                      {reconciliation.status === "ignored" && (
                        <span className="muted">Sans document</span>
                      )}

                      {reconciliation.status === "categorized" && <span>{transaction.category}</span>}

                      {(reconciliation.status === "pending" || reconciliation.status === "categorized") && (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {isEntry && invoiceSuggestions.length > 0 && (
                            <div className="muted">
                              Suggestion :{" "}
                              <strong>{invoiceSuggestions[0].invoice.number}</strong>
                            </div>
                          )}
                          {!isEntry && expenseSuggestions.length > 0 && (
                            <div className="muted">Suggestion : <strong>Dépense {expenseSuggestions[0].expense.supplierName || "—"} — {money(getExpenseAmount(expenseSuggestions[0].expense))}</strong></div>
                          )}
                          {((isEntry && invoiceSuggestions.length === 0) || (!isEntry && expenseSuggestions.length === 0)) && (
                            <div className="muted">Aucune suggestion fiable</div>
                          )}
                          {isEntry ? <select
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
                          : <select
                              value={selectedExpenseId}
                              onChange={(event) => setSelectedExpenseByTx({ ...selectedExpenseByTx, [transaction.id]: event.target.value })}
                            >
                              <option value="">Choisir une dépense</option>
                              {reconcilableExpenses.map((expense) => (
                                <option key={expense.id} value={expense.id}>
                                  {expense.supplierName || "Dépense"} — {money(getExpenseAmount(expense))} {expense.invoiceNumber ? `— ${expense.invoiceNumber}` : ""}
                                </option>
                              ))}
                            </select>}
                        </div>
                      )}
                    </td>
                    <td>
                      {transaction.matched ? (
                        <span className="badge payee">Rapprochée</span>
                      ) : transaction.category ? (
                        <span className="badge">Catégorisée</span>
                      ) : (
                        <span className="badge non-payee">À rapprocher</span>
                      )}
                    </td>
                    <td>
                      {!transaction.matched && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {isEntry ? <button
                            className="primary"
                            disabled={!selectedInvoice || isWorking}
                            onClick={() =>
                              reconcileTransaction(transaction, selectedInvoice)
                            }
                          >
                            Rapprocher avec facture
                          </button> : <button
                            className="primary"
                            disabled={!selectedExpense || isWorking}
                            onClick={() => reconcileExpense(transaction, selectedExpense)}
                          >
                            Rapprocher avec dépense
                          </button>}
                          <button
                            disabled={isWorking}
                            onClick={() => ignoreTransaction(transaction)}
                          >
                            Ignorer
                          </button>
                          {isManualBankTransaction(transaction) && (
                            <>
                              <button disabled={isWorking} onClick={() => openManualForm(transaction)}>Modifier</button>
                              <button className="danger" disabled={isWorking} onClick={() => deleteTransaction(transaction)}>Supprimer</button>
                            </>
                          )}
                        </div>
                      )}

                      {transaction.matched && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                          {reconciliation.invoice && (
                            <span className={statusClass(reconciliation.invoice.status)}>
                              {reconciliation.invoice.status}
                            </span>
                          )}
                          {isManualBankTransaction(transaction) && (
                            <>
                              <button disabled={isWorking} onClick={() => openManualForm(transaction)}>Modifier</button>
                              <button className="danger" disabled={isWorking} onClick={() => deleteTransaction(transaction)}>Supprimer</button>
                            </>
                          )}
                          <button disabled={isWorking} onClick={() => unlinkTransaction(transaction)}>Retirer le rapprochement</button>
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
