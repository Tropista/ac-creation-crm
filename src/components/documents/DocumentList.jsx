import { clientName, isQuoteConvertible, quoteAlreadyConverted, statusClass } from "../../utils/documents";
import { isInvoiceOverdue } from "../../utils/invoices";
import { money } from "../../utils/money";
import { QUOTE_STATUSES } from "../../utils/production";

export default function DocumentList({
  isQuote,
  data,
  sortedDocuments,
  paginatedDocuments,
  stats,
  overdueOnly,
  sortBy,
  documentPage,
  documentTotalPages,
  onExportCsv,
  onToggleOverdueOnly,
  onSortChange,
  onPageChange,
  onPreview,
  onEdit,
  onRemove,
  onUpdateStatus,
  onSendReminder,
  onConvertQuote,
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
            {overdueOnly && !isQuote
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
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDocuments.map((d) => {
                const overdue = !isQuote && isInvoiceOverdue(d);
                const convertible = isQuote && isQuoteConvertible(data, d);
                const converted = isQuote && quoteAlreadyConverted(data, d);

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
                    </td>
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
                              <option>Payée</option>
                              <option>En retard</option>
                              <option>Annulée</option>
                            </>
                          )}
                        </select>
                      </div>
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
                      {!isQuote && overdue && (
                        <button
                          type="button"
                          className="compact documents-remind-btn"
                          onClick={() => onSendReminder(d)}
                          title={
                            d.lastReminderDate
                              ? `Dernière relance : ${d.lastReminderDate}`
                              : "Préparer un email de relance"
                          }
                        >
                          Relancer
                        </button>
                      )}
                      <button type="button" className="danger compact" onClick={() => onRemove(d.id)}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination documents-pagination">
        <button
          type="button"
          disabled={documentPage <= 1}
          onClick={() => onPageChange(documentPage - 1)}
        >
          Précédent
        </button>

        <span>
          Page {documentPage} / {documentTotalPages}
        </span>

        <button
          type="button"
          disabled={documentPage >= documentTotalPages}
          onClick={() => onPageChange(documentPage + 1)}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
