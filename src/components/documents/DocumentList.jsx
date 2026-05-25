import { clientName, isQuoteConvertible, quoteIsFullyInvoiced, statusClass, isQuoteDeliveryNoteEligible, quoteHasDeliveryNote, getQuoteDepositSummary } from "../../utils/documents";
import { isInvoiceOverdue, getInvoicePaidAmount, getInvoiceRemaining, isPartiallyPaidInvoice } from "../../utils/invoices";
import { money } from "../../utils/money";
import { QUOTE_STATUSES } from "../../utils/production";
import { formatTrackingDate } from "../../utils/documentTracking";

export default function DocumentList({
  isQuote,
  data,
  sortedDocuments,
  paginatedDocuments,
  stats,
  search = "",
  onSearchChange,
  canDelete = true,
  overdueOnly,
  sortBy,
  onExportCsv,
  onToggleOverdueOnly,
  onSortChange,
  onPreview,
  onEdit,
  onRemove,
  onUpdateStatus,
  onSendReminder,
  onConvertQuote,
  onGenerateDeliveryNote,
  onPreviewDeliveryNote,
  onCreateDeposit,
  onCreateBalance,
  onRecordPayment,
  depositPresets = [30, 50, 70],
}) {
  return (
    <div className="card documents-list-card">
      <div className="documents-toolbar">
        <div className="documents-toolbar-title">
          <span className="filters-icon">{isQuote ? "📂" : "💼"}</span>
          <div>
            <strong>Liste des {isQuote ? "devis" : "factures"}</strong>
            <span>
              {sortedDocuments.length} document{sortedDocuments.length > 1 ? "s" : ""}
              {overdueOnly && !isQuote ? " · filtre en retard actif" : ""}
            </span>
          </div>
        </div>

        <div className="documents-toolbar-controls">
          <input
            className="search documents-search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            aria-label={`Rechercher ${isQuote ? "un devis" : "une facture"}`}
          />
          {!isQuote && (
            <button type="button" onClick={onExportCsv}>
              Exporter CSV
            </button>
          )}
          {!isQuote && (
            <button
              type="button"
              className={`documents-filter-btn${overdueOnly ? " is-active" : ""}`}
              onClick={onToggleOverdueOnly}
            >
              En retard uniquement
              {stats.overdueCount > 0 && ` (${stats.overdueCount})`}
            </button>
          )}
          <label className="documents-field documents-field--sort">
            <span>Trier par</span>
            <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
              <option value="dateDesc">Date : plus récent</option>
              <option value="dateAsc">Date : plus ancien</option>
              <option value="numberDesc">N° : décroissant</option>
              <option value="numberAsc">N° : croissant</option>
              <option value="clientAsc">Client : A → Z</option>
              <option value="clientDesc">Client : Z → A</option>
              <option value="totalDesc">Total : plus élevé</option>
              <option value="totalAsc">Total : plus bas</option>
              <option value="statusAsc">Statut : A → Z</option>
              <option value="statusDesc">Statut : Z → A</option>
            </select>
          </label>
        </div>
      </div>

      {paginatedDocuments.length === 0 ? (
        <div className="documents-empty">
          <strong>Aucun {isQuote ? "devis" : "facture"} à afficher</strong>
          <p>
            {search.trim()
              ? `Aucun résultat pour « ${search.trim()} ».`
              : overdueOnly && !isQuote
                ? "Aucune facture en retard ne correspond à ce filtre."
                : `Créez votre premier ${isQuote ? "devis" : "facture"} avec le formulaire ci-dessus.`}
          </p>
        </div>
      ) : (
        <div className="table documents-table-wrap">
          <table className="documents-table compact-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Client</th>
                <th>Lignes</th>
                <th>Total TTC</th>
                {!isQuote && <th>Paiement</th>}
                <th>Statut</th>
                <th>Suivi</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDocuments.map((d) => {
                const overdue = !isQuote && isInvoiceOverdue(d);
                const depositSummary = isQuote ? getQuoteDepositSummary(data, d) : null;
                const convertible = isQuote && isQuoteConvertible(data, d) && !depositSummary?.hasDeposits;
                const converted = isQuote && quoteIsFullyInvoiced(data, d);
                const depositFlow = isQuote && depositSummary?.hasDeposits;
                const blEligible = isQuote && isQuoteDeliveryNoteEligible(d);
                const hasBl = isQuote && quoteHasDeliveryNote(data, d);
                const paid = !isQuote ? getInvoicePaidAmount(d) : 0;
                const remaining = !isQuote ? getInvoiceRemaining(d) : 0;
                const partial = !isQuote && isPartiallyPaidInvoice(d);
                const depositEligible =
                  isQuote &&
                  ["Accepté", "En production", "Prêt", "Livré"].includes(d.status);

                return (
                  <tr
                    key={`${d.id || d.number}-${d.number || ""}`}
                    className={overdue ? "documents-row--overdue" : ""}
                  >
                    <td>
                      <strong className="documents-number">{d.number}</strong>
                    </td>
                    <td>{d.date}</td>
                    <td>{clientName(data, d.clientId)}</td>
                    <td>
                      <span className="documents-lines-badge">{d.lines?.length || 1}</span>
                    </td>
                    <td>
                      <strong>{money(d.totalTTC)}</strong>
                      {!isQuote && d.invoiceType === "acompte" && (
                        <span className="documents-deposit-tag">Acompte</span>
                      )}
                      {!isQuote && d.invoiceType === "solde" && (
                        <span className="documents-deposit-tag">Solde</span>
                      )}
                      {isQuote && depositSummary?.hasDeposits && (
                        <span className="documents-deposit-summary muted">
                          Acompte facturé : {money(depositSummary.invoicedDeposit)} / Reste :{" "}
                          {money(depositSummary.remainingBalance)}
                        </span>
                      )}
                    </td>
                    {!isQuote && (
                      <td className="documents-payment-cell">
                        {d.status === "Payée" ? (
                          <span className="documents-paid-full">Payé</span>
                        ) : partial || paid > 0 ? (
                          <div className="documents-payment-stack">
                            <span className="documents-paid-partial">{money(paid)}</span>
                            <span className="muted documents-remaining">Reste {money(remaining)}</span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    <td>
                      <div className="documents-status-cell">
                        <span className={statusClass(d.status)}>{d.status}</span>
                        <select
                          className="documents-status-select"
                          value={d.status}
                          onChange={(e) => onUpdateStatus(d.id, e.target.value)}
                          aria-label={`Statut ${d.number}`}
                        >
                          {isQuote ? (
                            QUOTE_STATUSES.map((status) => (
                              <option key={status}>{status}</option>
                            ))
                          ) : (
                            <>
                              <option>Non payée</option>
                              <option>Partiellement payée</option>
                              <option>Payée</option>
                              <option>En retard</option>
                              <option>Annulée</option>
                            </>
                          )}
                        </select>
                      </div>
                    </td>
                    <td className="documents-tracking-cell">
                      {d.sentAt ? (
                        <span className="muted" title={`Envoyé le ${formatTrackingDate(d.sentAt)}`}>
                          Envoyé {formatTrackingDate(d.sentAt)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {!isQuote && Number(d.reminderCount || 0) > 0 && (
                        <span className="documents-reminder-count" title={`Dernière relance : ${formatTrackingDate(d.lastReminderAt || d.lastReminderDate)}`}>
                          Relances : {d.reminderCount}
                        </span>
                      )}
                    </td>
                    <td className="actions documents-actions">
                      <button type="button" className="compact" onClick={() => onPreview(d)}>
                        Voir
                      </button>
                      <button type="button" className="compact" onClick={() => onEdit(d)}>
                        Modifier
                      </button>
                      {isQuote &&
                        (converted ? (
                          <span className="documents-converted-tag">Facturé</span>
                        ) : depositFlow ? (
                          <>
                            {depositSummary?.canCreateBalance && (
                              <button
                                type="button"
                                className="compact documents-balance-btn primary"
                                onClick={() => onCreateBalance(d)}
                                title="Créer la facture de solde (TTC − acomptes payés)"
                              >
                                Facture de solde
                              </button>
                            )}
                            <button
                              type="button"
                              className="compact documents-convert-btn"
                              disabled
                              title="Utilisez le flux acompte puis facture de solde"
                            >
                              Convertir
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={`compact documents-convert-btn${convertible ? " primary" : ""}`}
                            onClick={() => onConvertQuote(d)}
                            title={
                              convertible
                                ? "Convertir ce devis accepté en facture"
                                : "Convertir en facture (devis non accepté)"
                            }
                          >
                            Convertir
                          </button>
                        ))}
                      {blEligible && (
                        <>
                          <button
                            type="button"
                            className="compact documents-bl-btn"
                            onClick={() => onGenerateDeliveryNote(d)}
                            title="Générer ou mettre à jour le bon de livraison"
                          >
                            {hasBl ? "BL ↻" : "BL"}
                          </button>
                          {hasBl && (
                            <button
                              type="button"
                              className="compact"
                              onClick={() => onPreviewDeliveryNote(d)}
                              title="Voir le bon de livraison"
                            >
                              Voir BL
                            </button>
                          )}
                        </>
                      )}
                      {depositEligible &&
                        depositPresets.map((percent) => (
                          <button
                            key={percent}
                            type="button"
                            className="compact documents-deposit-btn"
                            onClick={() => onCreateDeposit(d, percent)}
                            title={`Créer une facture d'acompte de ${percent}%`}
                          >
                            {percent}%
                          </button>
                        ))}
                      {!isQuote && d.status !== "Payée" && d.status !== "Annulée" && (
                        <button
                          type="button"
                          className="compact documents-payment-btn"
                          onClick={() => onRecordPayment(d)}
                          title="Enregistrer un paiement partiel ou total"
                        >
                          Paiement
                        </button>
                      )}
                      {!isQuote && overdue && (
                        <button
                          type="button"
                          className="compact documents-remind-btn"
                          onClick={() => onSendReminder(d)}
                          title={
                            d.lastReminderAt || d.lastReminderDate
                              ? `Dernière relance : ${formatTrackingDate(d.lastReminderAt || d.lastReminderDate)} (${d.reminderCount || 0})`
                              : "Préparer un email de relance"
                          }
                        >
                          Relancer
                        </button>
                      )}
                      {canDelete && (
                        <button type="button" className="danger compact" onClick={() => onRemove(d.id)}>
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
