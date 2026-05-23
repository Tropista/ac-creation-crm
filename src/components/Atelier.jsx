import { useNavigate } from "react-router-dom";
import { clientName, statusClass } from "../utils/documents";
import {
  ATELIER_PIPELINE_STATUSES,
  advanceProductionStatus,
  getAtelierBoard,
} from "../utils/production";
import { pageToPath } from "../utils/routes";
import { showToast } from "../utils/toast";

const PROCESS_ICONS = {
  laser: "🔥",
  dtf: "👕",
  uvdtf: "📱",
  print3d: "🧊",
  tshirt: "👔",
  other: "📋",
};

function advanceLabel(status) {
  const next = advanceProductionStatus(status);
  if (next === "En production") return "Lancer la production";
  if (next === "Prêt") return "Marquer prêt";
  if (next === "Livré") return "Marquer livré";
  return null;
}

export default function Atelier({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const quotes = data.quotes || [];
  const board = getAtelierBoard(quotes);

  const statusCounts = ATELIER_PIPELINE_STATUSES.reduce((acc, status) => {
    acc[status] = board.items.filter((quote) => quote.status === status).length;
    return acc;
  }, {});

  function openQuote(quote) {
    localStorage.setItem("crm_open_document_id", quote.id);
    localStorage.setItem("crm_open_document_type", "quote");
    navigate(pageToPath("quotes"));
  }

  function updateQuoteStatus(quote, status) {
    if (!ATELIER_PIPELINE_STATUSES.includes(status)) return;
    if (quote.status === status) return;

    const nextQuotes = quotes.map((entry) =>
      String(entry.id) === String(quote.id) ? { ...entry, status } : entry
    );

    setData({ ...data, quotes: nextQuotes });
    logActivity?.("Changement statut devis", quote.number, status);
    showToast(`${quote.number} : ${status}`, "success");
  }

  function handleAdvance(quote) {
    const nextStatus = advanceProductionStatus(quote.status);
    if (!nextStatus) {
      showToast("Ce devis est déjà livré.", "info");
      return;
    }
    updateQuoteStatus(quote, nextStatus);
  }

  return (
    <section className="atelier-page">
      <div className="page-header">
        <div>
          <h2>Atelier</h2>
          <p>
            File de production par processus — devis acceptés jusqu&apos;à livraison.
          </p>
        </div>
      </div>

      <div className="atelier-stats">
        {ATELIER_PIPELINE_STATUSES.map((status) => (
          <div key={status} className="card stat atelier-stat">
            <span>{status}</span>
            <strong>{statusCounts[status] || 0}</strong>
          </div>
        ))}
        <div className="card stat atelier-stat atelier-stat--total">
          <span>Total en cours</span>
          <strong>{board.total}</strong>
        </div>
      </div>

      {board.total === 0 ? (
        <div className="card atelier-empty">
          <h3>Aucune commande en file</h3>
          <p className="muted">
            Les devis au statut Accepté, En production, Prêt ou Livré apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="atelier-board">
          {board.byProcess.map((group) => (
            <div key={group.key} className="atelier-column card">
              <div className="atelier-column__header">
                <strong>
                  <span>{PROCESS_ICONS[group.key] || "📋"}</span>
                  {group.label}
                </strong>
                <span className="atelier-column__count">{group.items.length}</span>
              </div>

              {group.items.length === 0 ? (
                <p className="muted atelier-column__empty">Aucune commande</p>
              ) : (
                <div className="atelier-cards">
                  {group.items.map((quote) => {
                    const nextLabel = advanceLabel(quote.status);

                    return (
                      <article key={quote.id} className="atelier-card">
                        <div className="atelier-card__top">
                          <button
                            type="button"
                            className="atelier-card__number"
                            onClick={() => openQuote(quote)}
                            title="Ouvrir le devis"
                          >
                            {quote.number}
                          </button>
                          <span className={statusClass(quote.status)}>
                            {quote.status}
                          </span>
                        </div>

                        <p className="atelier-card__client">
                          {clientName(data, quote.clientId)}
                        </p>
                        <p className="atelier-card__date muted">
                          {quote.date || "—"}
                        </p>

                        <div className="atelier-card__actions">
                          {nextLabel ? (
                            <button
                              type="button"
                              className="atelier-advance-btn"
                              onClick={() => handleAdvance(quote)}
                            >
                              {nextLabel}
                            </button>
                          ) : (
                            <span className="muted atelier-done">Livré</span>
                          )}

                          <select
                            className="atelier-status-select"
                            value={quote.status}
                            onChange={(event) =>
                              updateQuoteStatus(quote, event.target.value)
                            }
                            aria-label={`Statut pour ${quote.number}`}
                          >
                            {ATELIER_PIPELINE_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
