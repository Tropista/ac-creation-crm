import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clientName, statusClass } from "../utils/documents";
import {
  ATELIER_PIPELINE_STATUSES,
  advanceProductionStatus,
  getAtelierBoard,
  getAtelierStatusBoard,
  inferProcessType,
} from "../utils/production";
import { pageToPath } from "../utils/routes";
import { showToast } from "../utils/toast";

const PROCESS_ICONS = {
  catalog: "📬",
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

function AtelierCard({ data, quote, onOpen, onAdvance, onStatusChange }) {
  const process = inferProcessType(quote);
  const nextLabel = advanceLabel(quote.status);

  return (
    <article
      className="atelier-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", String(quote.id));
        event.dataTransfer.effectAllowed = "move";
        event.currentTarget.classList.add("atelier-card--dragging");
      }}
      onDragEnd={(event) => {
        event.currentTarget.classList.remove("atelier-card--dragging");
      }}
    >
      <div className="atelier-card__top">
        <button
          type="button"
          className="atelier-card__number"
          onClick={() => onOpen(quote)}
          title="Ouvrir le devis"
        >
          {quote.number}
        </button>
        <span className={statusClass(quote.status)}>{quote.status}</span>
      </div>

      <p className="atelier-card__client">{clientName(data, quote.clientId)}</p>

      {quote.catalogSelectionTitle ? (
        <p className="atelier-card__catalog-title muted">
          {quote.catalogSelectionTitle}
        </p>
      ) : null}

      {quote.catalogShareUrl ? (
        <a
          className="atelier-card__catalog-link"
          href={quote.catalogShareUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          Voir la sélection catalogue
        </a>
      ) : null}

      <div className="atelier-card__meta">
        <span className="atelier-process-badge">
          {PROCESS_ICONS[process.key] || "📋"} {process.label}
        </span>
        <span className="muted atelier-card__date">{quote.date || "—"}</span>
      </div>

      <div className="atelier-card__actions">
        {nextLabel ? (
          <button
            type="button"
            className="atelier-advance-btn"
            onClick={() => onAdvance(quote)}
          >
            {nextLabel}
          </button>
        ) : (
          <span className="muted atelier-done">Livré</span>
        )}

        <select
          className="atelier-status-select"
          data-testid={`atelier-status-${quote.id}`}
          value={quote.status}
          onChange={(event) => onStatusChange(quote, event.target.value)}
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
}

export default function Atelier({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState("status");
  const [dragOverStatus, setDragOverStatus] = useState("");
  const quotes = data.quotes || [];
  const statusBoard = getAtelierStatusBoard(quotes);
  const processBoard = getAtelierBoard(quotes);
  const board = viewMode === "status" ? statusBoard : processBoard;

  const statusCounts = ATELIER_PIPELINE_STATUSES.reduce((acc, status) => {
    acc[status] = statusBoard.items.filter((quote) => quote.status === status).length;
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

  function handleDropOnStatus(event, status) {
    event.preventDefault();
    setDragOverStatus("");

    const quoteId = event.dataTransfer.getData("text/plain");
    const quote = quotes.find((entry) => String(entry.id) === String(quoteId));
    if (!quote) return;

    updateQuoteStatus(quote, status);
  }

  return (
    <section className="atelier-page" data-testid="atelier-page">
      <div className="page-header">
        <div>
          <h2>Atelier</h2>
          <p>
            Suivi de production par statut ou par processus — devis acceptés jusqu&apos;à livraison.
          </p>
        </div>

        <div className="atelier-view-toggle" role="tablist" aria-label="Vue atelier">
          <button
            type="button"
            className={viewMode === "status" ? "active" : ""}
            onClick={() => setViewMode("status")}
            role="tab"
            aria-selected={viewMode === "status"}
          >
            Par statut
          </button>
          <button
            type="button"
            className={viewMode === "process" ? "active" : ""}
            onClick={() => setViewMode("process")}
            role="tab"
            aria-selected={viewMode === "process"}
          >
            Par processus
          </button>
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
      ) : viewMode === "status" ? (
        <div className="atelier-board atelier-board--status">
          {statusBoard.byStatus.map((column) => (
            <div
              key={column.status}
              className={`atelier-column card atelier-status-column ${
                dragOverStatus === column.status ? "atelier-status-column--active" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverStatus(column.status);
              }}
              onDragLeave={() => {
                setDragOverStatus((current) =>
                  current === column.status ? "" : current
                );
              }}
              onDrop={(event) => handleDropOnStatus(event, column.status)}
            >
              <div className="atelier-column__header">
                <strong>{column.status}</strong>
                <span className="atelier-column__count">{column.items.length}</span>
              </div>

              {column.items.length === 0 ? (
                <p className="muted atelier-column__empty">Glisser un devis ici</p>
              ) : (
                <div className="atelier-cards">
                  {column.items.map((quote) => (
                    <AtelierCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onStatusChange={updateQuoteStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="atelier-board">
          {processBoard.byProcess.map((group) => (
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
                  {group.items.map((quote) => (
                    <AtelierCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onStatusChange={updateQuoteStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
