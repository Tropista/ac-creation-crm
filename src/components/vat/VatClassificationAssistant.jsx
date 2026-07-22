import { useEffect, useMemo, useState } from "react";
import {
  EU_TRANSACTION_TYPE,
  EXPENSE_TAX_CATEGORY,
  SALE_TAX_CATEGORY,
  VAT_DEDUCTIBILITY,
  VAT_ORIGIN,
} from "../../utils/vatDeclaration";
import {
  applyVatClassificationSelections,
  buildVatClassificationAssistantState,
  previewVatClassificationImpact,
} from "../../utils/vatClassificationAssistant";
import {
  createHistoricalInvoicePaymentsBatch,
  hasValidPaymentForInvoice,
  PAYMENT_METHODS,
} from "../../utils/payments";
import { centsMoney, money } from "./vatUiUtils";

const SALE_LABELS = {
  [SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT]: "Produit fabriqué / transformé",
  [SALE_TAX_CATEGORY.RESOLD_GOODS]: "Marchandise revendue",
  [SALE_TAX_CATEGORY.SERVICE]: "Prestation de service",
  [SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL]: "Cession d'immobilisation",
  [SALE_TAX_CATEGORY.TO_REVIEW]: "Autre / à vérifier",
};

function cloneSuggestions(state) {
  return {
    suppliers: state.suppliers.map((item) => ({ ...item, checked: false })),
    sales: state.sales.map((item) => ({ ...item })),
    expenses: state.expenses.map((item) => ({ ...item, suggestions: { ...item.suggestions } })),
  };
}

function ImpactCard({ label, before, after }) {
  return (
    <div className="card vat-impact-card">
      <span>{label}</span>
      <strong>{centsMoney(after)}</strong>
      <small className="muted">Avant {centsMoney(before)} - écart {centsMoney(after - before)}</small>
    </div>
  );
}

function normalizedStatus(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function reliablePaymentDate(invoice = {}) {
  return invoice.paymentDate || invoice.paidDate || invoice.datePaid || invoice.settledAt || invoice.paidAt || "";
}

function historicalPaidAmount(invoice = {}) {
  const paid = Number(invoice.paidAmount ?? invoice.amountPaid ?? 0);
  const status = normalizedStatus(invoice.status);
  if (paid > 0) return paid;
  if (!status.includes("non payee") && status.includes("payee")) return Number(invoice.totalTTC || 0);
  return 0;
}

function buildPaymentRows({ data = {}, report = {} }) {
  const clientsById = new Map((data.clients || []).map((client) => [String(client.id), client]));
  const invoiceIds = new Set(
    (report.anomalies || [])
      .filter((entry) => entry.code === "CASH_BASIS_PAYMENTS_INCOMPLETE")
      .map((entry) => String(entry.sourceId || "").replace(/^sale:/, ""))
      .filter(Boolean)
  );

  return (data.invoices || [])
    .filter((invoice) => {
      const ids = [invoice.id, invoice.number].filter(Boolean).map(String);
      return ids.some((id) => invoiceIds.has(id));
    })
    .filter((invoice) => {
      const status = normalizedStatus(invoice.status);
      return !status.includes("non payee") && status.includes("payee");
    })
    .filter((invoice) => !hasValidPaymentForInvoice(data.payments || [], invoice))
    .map((invoice) => {
      const amount = historicalPaidAmount(invoice);
      const date = reliablePaymentDate(invoice);
      const method = invoice.paymentMethod || invoice.paymentMode || invoice.method || "Virement";
      const reliable = amount > 0 && Boolean(date);
      const client = clientsById.get(String(invoice.clientId));
      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number || invoice.id,
        clientName: invoice.clientName || client?.name || "Client non renseigné",
        invoiceDate: invoice.date || "",
        totalTTC: Number(invoice.totalTTC || 0),
        historicalPaidAmount: amount,
        paymentDate: date,
        paymentMethod: PAYMENT_METHODS.includes(method) ? method : "Autre",
        checked: reliable,
        reliable,
      };
    });
}

export default function VatClassificationAssistant({
  data,
  report,
  taxYear,
  periodStart,
  periodEnd,
  initialTab = "suppliers",
  onClose,
  onSave,
  onSavePayments,
  logActivity,
}) {
  const initial = useMemo(
    () => buildVatClassificationAssistantState({ data, taxYear, periodStart, periodEnd }),
    [data, taxYear, periodStart, periodEnd]
  );
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(() => cloneSuggestions(initial));
  const initialPaymentRows = useMemo(
    () => buildPaymentRows({ data, report }),
    [data, report]
  );
  const [paymentRows, setPaymentRows] = useState(initialPaymentRows);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkMethod, setBulkMethod] = useState("Virement");
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    setPaymentRows(initialPaymentRows);
  }, [initialPaymentRows]);

  const selections = useMemo(() => ({
    suppliers: draft.suppliers.filter((item) => item.checked),
    sales: draft.sales.filter((item) => item.checked),
    expenses: draft.expenses.filter((item) => item.checked),
  }), [draft]);

  const impact = useMemo(
    () => previewVatClassificationImpact({ data, selections, taxYear, periodStart, periodEnd }),
    [data, selections, taxYear, periodStart, periodEnd]
  );

  const beforeBoxes = Object.fromEntries((impact.before.ecdfBoxes || []).map((box) => [box.box, box.amountCents]));
  const afterBoxes = Object.fromEntries((impact.after.ecdfBoxes || []).map((box) => [box.box, box.amountCents]));

  function updateSupplier(index, patch) {
    setDraft((current) => ({
      ...current,
      suppliers: current.suppliers.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function updateSale(index, patch) {
    setDraft((current) => ({
      ...current,
      sales: current.sales.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function updateExpense(index, patch) {
    setDraft((current) => ({
      ...current,
      expenses: current.expenses.map((item, i) =>
        i === index ? { ...item, suggestions: { ...item.suggestions, ...patch }, checked: true } : item
      ),
    }));
  }

  function acceptHighConfidenceSales() {
    setDraft((current) => ({
      ...current,
      sales: current.sales.map((item) => item.confidence === "high" ? { ...item, checked: true } : item),
    }));
  }

  function markAllExpensesChecked() {
    setDraft((current) => ({
      ...current,
      expenses: current.expenses.map((item) => ({ ...item, checked: true })),
    }));
  }

  function updatePaymentRow(index, patch) {
    setPaymentRows((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function applyDateToSelected() {
    if (!bulkDate) return;
    setPaymentRows((current) =>
      current.map((item) => (item.checked ? { ...item, paymentDate: bulkDate } : item))
    );
  }

  function applyMethodToSelected() {
    setPaymentRows((current) =>
      current.map((item) => (item.checked ? { ...item, paymentMethod: bulkMethod } : item))
    );
  }

  async function createSelectedPayments() {
    const selected = paymentRows.filter((item) => item.checked);
    const ready = selected.filter((item) => item.historicalPaidAmount > 0 && item.paymentDate);
    const missing = selected.length - ready.length;
    if (!ready.length) {
      setSummary({ payments: { created: 0, skipped: 0, needsReview: paymentRows.length } });
      return;
    }
    const total = ready.reduce((sum, item) => sum + Number(item.historicalPaidAmount || 0), 0);
    if (
      !window.confirm(
        `Vous allez créer ${ready.length} paiement${ready.length > 1 ? "s" : ""} historique${ready.length > 1 ? "s" : ""} pour ${money(total)}. ${missing} facture${missing > 1 ? "s" : ""} sélectionnée${missing > 1 ? "s" : ""} rester${missing > 1 ? "ont" : "a"} à vérifier.`
      )
    ) {
      return;
    }

    const result = createHistoricalInvoicePaymentsBatch(
      data,
      ready.map((item) => ({
        invoiceId: item.invoiceId,
        invoiceNumber: item.invoiceNumber,
        amount: item.historicalPaidAmount,
        date: item.paymentDate,
        method: item.paymentMethod,
      }))
    );
    if (onSavePayments) {
      await onSavePayments(result.data, result);
    } else {
      await onSave?.(result.data);
    }
    logActivity?.({
      action: "Paiements historiques TVA",
      target: "Declaration TVA",
      details: `crees=${result.created}; ignores=${result.skipped}; a_verifier=${result.needsReview + missing}`,
    });
    setPaymentRows(buildPaymentRows({ data: result.data, report }));
    setSummary({ payments: { ...result, needsReview: result.needsReview + missing } });
  }

  async function saveSelections() {
    const counts = {
      suppliers: selections.suppliers.length,
      sales: selections.sales.length,
      expenses: selections.expenses.length,
    };
    if (!window.confirm(`Vous allez mettre à jour ${counts.suppliers} fournisseurs, ${counts.sales} ventes et ${counts.expenses} dépenses. Continuer ?`)) {
      return;
    }
    const nextData = applyVatClassificationSelections(data, selections);
    await onSave?.(nextData);
    logActivity?.({
      action: "Classification TVA",
      target: "Declaration TVA",
      details: `fournisseurs=${counts.suppliers}; ventes=${counts.sales}; dépenses=${counts.expenses}`,
    });
    setSummary(counts);
  }

  return (
    <div className="modal-backdrop vat-assistant-backdrop">
      <div className="modal vat-assistant-modal" role="dialog" aria-modal="true" aria-label="Assistant de classification TVA">
        <div className="section-title">
          <div>
            <h2>Assistant de classification TVA</h2>
            <p className="muted">Aucune donnée n'est modifiée tant que tu ne confirmes pas l'enregistrement.</p>
          </div>
          <button type="button" onClick={onClose}>Fermer</button>
        </div>

        <div className="stats vat-impact-grid">
          <ImpactCard label="TVA déductible LU" before={impact.before.totals?.deductibleVatCents || 0} after={impact.after.totals?.deductibleVatCents || 0} />
          <ImpactCard label="Acquisitions UE biens" before={beforeBoxes["711"] || 0} after={afterBoxes["711"] || 0} />
          <ImpactCard label="Services UE" before={beforeBoxes["741"] || 0} after={afterBoxes["741"] || 0} />
          <ImpactCard label="TVA étrangère" before={impact.before.totals?.foreignVatNonDeductibleCents || 0} after={impact.after.totals?.foreignVatNonDeductibleCents || 0} />
          <ImpactCard label="Solde provisoire" before={impact.before.totals?.balanceCents || 0} after={impact.after.totals?.balanceCents || 0} />
        </div>
        <p className="muted">Aperçu basé sur les propositions non encore enregistrées.</p>

        <div className="tabs vat-tabs assistant-tabs">
          <button type="button" className={tab === "suppliers" ? "active" : ""} onClick={() => setTab("suppliers")}>Fournisseurs ({draft.suppliers.length})</button>
          <button type="button" className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>Ventes ({draft.sales.length})</button>
          <button type="button" className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")}>Dépenses ({draft.expenses.length})</button>
          <button type="button" className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>Paiements ({paymentRows.length})</button>
        </div>

        {tab === "suppliers" && (
          <div className="table card">
            <table>
              <thead>
                <tr>
                  <th>Choix</th><th>Fournisseur</th><th>Dépenses</th><th>Total HT</th><th>Taux</th><th>Pays proposé</th><th>TVA</th><th>Origine</th><th>Type UE</th><th>Confiance</th><th>Raisons</th>
                </tr>
              </thead>
              <tbody>
                {draft.suppliers.map((item, index) => (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={item.checked} onChange={(event) => updateSupplier(index, { checked: event.target.checked })} /></td>
                    <td>{item.supplierName}</td>
                    <td>{item.expenseCount}</td>
                    <td>{money(item.totalHT)}</td>
                    <td>{item.rates.join(", ")}</td>
                    <td><input value={item.proposed_country_code} onChange={(event) => updateSupplier(index, { proposed_country_code: event.target.value.toUpperCase(), checked: true })} /></td>
                    <td><input value={item.vat_number} onChange={(event) => updateSupplier(index, { vat_number: event.target.value, checked: true })} /></td>
                    <td>
                      <select value={item.proposed_vat_origin} onChange={(event) => updateSupplier(index, { proposed_vat_origin: event.target.value, checked: true })}>
                        <option value={VAT_ORIGIN.LU}>LU</option>
                        <option value={VAT_ORIGIN.EU}>UE</option>
                        <option value={VAT_ORIGIN.NON_EU}>Hors UE</option>
                      </select>
                    </td>
                    <td>
                      <select value={item.proposed_transaction_type} onChange={(event) => updateSupplier(index, { proposed_transaction_type: event.target.value, checked: true })}>
                        <option value={EU_TRANSACTION_TYPE.NONE}>Aucun</option>
                        <option value={EU_TRANSACTION_TYPE.GOODS}>Bien UE</option>
                        <option value={EU_TRANSACTION_TYPE.SERVICE}>Service UE</option>
                      </select>
                    </td>
                    <td>{item.confidence}</td>
                    <td>{item.reasons.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "sales" && (
          <div className="table card">
            <div className="section-title-row">
              <button type="button" onClick={acceptHighConfidenceSales}>Accepter toutes les propositions à confiance élevée</button>
            </div>
            <table>
              <thead>
                <tr><th>Choix</th><th>Facture</th><th>Client</th><th>Date</th><th>Description</th><th>HT</th><th>Proposition</th><th>Confiance</th><th>Raison</th><th>Catégorie choisie</th></tr>
              </thead>
              <tbody>
                {draft.sales.map((item, index) => (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={item.checked} onChange={(event) => updateSale(index, { checked: event.target.checked })} /></td>
                    <td>{item.number}</td>
                    <td>{item.client}</td>
                    <td>{item.date}</td>
                    <td>{item.description}</td>
                    <td>{money(item.totalHT)}</td>
                    <td>{SALE_LABELS[item.proposed_category] || item.proposed_category}</td>
                    <td>{item.confidence}</td>
                    <td>{item.reason}</td>
                    <td>
                      <select value={item.selected_category} onChange={(event) => updateSale(index, { selected_category: event.target.value, checked: true })}>
                        {Object.entries(SALE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "expenses" && (
          <div className="table card">
            <div className="section-title-row">
              <button type="button" onClick={markAllExpensesChecked}>Marquer toutes les dépenses affichées</button>
            </div>
            <table>
              <thead>
                <tr><th>Choix</th><th>Date</th><th>Fournisseur</th><th>Description</th><th>HT</th><th>Taux</th><th>TVA</th><th>TTC</th><th>Pays</th><th>Origine</th><th>Catégorie</th><th>Type UE</th><th>Déductibilité</th><th>Immo</th><th>Taux auto.</th><th>Confiance</th><th>Anomalies</th></tr>
              </thead>
              <tbody>
                {draft.expenses.map((item, index) => (
                  <tr key={item.id}>
                    <td><input type="checkbox" checked={item.checked} onChange={(event) => setDraft((current) => ({ ...current, expenses: current.expenses.map((row, i) => i === index ? { ...row, checked: event.target.checked } : row) }))} /></td>
                    <td>{item.date}</td>
                    <td>{item.supplierName}</td>
                    <td>{item.description}</td>
                    <td>{money(item.amountHT)}</td>
                    <td>{item.vatRate}</td>
                    <td>{money(item.vatAmount)}</td>
                    <td>{money(item.totalTTC)}</td>
                    <td>{item.country}</td>
                    <td>
                      <select value={item.suggestions.vat_origin || ""} onChange={(event) => updateExpense(index, { vat_origin: event.target.value })}>
                        <option value="">À définir</option>
                        <option value={VAT_ORIGIN.LU}>LU</option>
                        <option value={VAT_ORIGIN.EU}>UE</option>
                        <option value={VAT_ORIGIN.NON_EU}>Hors UE</option>
                      </select>
                    </td>
                    <td>
                      <select value={item.suggestions.expense_tax_category || ""} onChange={(event) => updateExpense(index, { expense_tax_category: event.target.value })}>
                        <option value="">À définir</option>
                        {Object.values(EXPENSE_TAX_CATEGORY).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={item.suggestions.eu_transaction_type || EU_TRANSACTION_TYPE.NONE} onChange={(event) => updateExpense(index, { eu_transaction_type: event.target.value })}>
                        <option value={EU_TRANSACTION_TYPE.NONE}>Aucun</option>
                        <option value={EU_TRANSACTION_TYPE.GOODS}>Bien UE</option>
                        <option value={EU_TRANSACTION_TYPE.SERVICE}>Service UE</option>
                      </select>
                    </td>
                    <td>
                      <select value={item.suggestions.vat_deductibility || VAT_DEDUCTIBILITY.FULLY} onChange={(event) => updateExpense(index, { vat_deductibility: event.target.value })}>
                        <option value={VAT_DEDUCTIBILITY.FULLY}>Totale</option>
                        <option value={VAT_DEDUCTIBILITY.PARTIALLY}>Partielle</option>
                        <option value={VAT_DEDUCTIBILITY.NONE}>Non déductible</option>
                      </select>
                    </td>
                    <td><input type="checkbox" checked={Boolean(item.suggestions.is_fixed_asset)} onChange={(event) => updateExpense(index, { is_fixed_asset: event.target.checked })} /></td>
                    <td><input type="number" value={item.suggestions.reverse_charge_vat_rate || 17} onChange={(event) => updateExpense(index, { reverse_charge_vat_rate: Number(event.target.value) })} /></td>
                    <td>{item.confidence}</td>
                    <td>{[...item.warnings, ...item.reasons].join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payments" && (
          <div className="table card">
            <div className="section-title-row">
              <label>
                <span>Date d'encaissement</span>
                <input type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} />
              </label>
              <button type="button" onClick={applyDateToSelected} disabled={!bulkDate}>
                Appliquer la date sélectionnée aux factures choisies
              </button>
              <label>
                <span>Mode de paiement</span>
                <select value={bulkMethod} onChange={(event) => setBulkMethod(event.target.value)}>
                  {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <button type="button" onClick={applyMethodToSelected}>Appliquer le mode de paiement sélectionné</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Choix</th>
                  <th>Facture</th>
                  <th>Client</th>
                  <th>Date facture</th>
                  <th>TTC</th>
                  <th>Payé historique</th>
                  <th>Date encaiss.</th>
                  <th>Mode</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((item, index) => (
                  <tr key={item.invoiceId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(event) => updatePaymentRow(index, { checked: event.target.checked })}
                      />
                    </td>
                    <td>{item.invoiceNumber}</td>
                    <td>{item.clientName}</td>
                    <td>{item.invoiceDate}</td>
                    <td>{money(item.totalTTC)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.historicalPaidAmount || ""}
                        onChange={(event) => updatePaymentRow(index, { historicalPaidAmount: Number(event.target.value || 0), checked: true })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={item.paymentDate || ""}
                        onChange={(event) => updatePaymentRow(index, { paymentDate: event.target.value, checked: true })}
                      />
                    </td>
                    <td>
                      <select
                        value={item.paymentMethod}
                        onChange={(event) => updatePaymentRow(index, { paymentMethod: event.target.value, checked: true })}
                      >
                        {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                    </td>
                    <td>{item.reliable ? "Prêt" : "Date à saisir"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paymentRows.length === 0 ? <p className="muted">Aucune facture payée sans paiement valide.</p> : null}
          </div>
        )}

        <div className="modal-actions">
          {tab === "payments" ? (
            <button type="button" className="primary" onClick={createSelectedPayments}>
              Créer les paiements historiques sélectionnés
            </button>
          ) : (
            <button type="button" className="primary" onClick={saveSelections}>Enregistrer les classifications</button>
          )}
          <button type="button" onClick={onClose}>Fermer</button>
        </div>
        {summary ? (
          <p className="success">
            {summary.payments
              ? `${summary.payments.created} paiement${summary.payments.created > 1 ? "s" : ""} créé${summary.payments.created > 1 ? "s" : ""} ; ${summary.payments.skipped} ignoré${summary.payments.skipped > 1 ? "s" : ""} ; ${summary.payments.errors.length} erreur${summary.payments.errors.length > 1 ? "s" : ""} ; ${summary.payments.needsReview} restant à vérifier.`
              : `Mis à jour : ${summary.suppliers} fournisseurs, ${summary.sales} ventes et ${summary.expenses} dépenses.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
