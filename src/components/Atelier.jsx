import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clientName, statusClass, createDeliveryNoteFromQuote, getDeliveryNoteForQuote, isQuoteDeliveryNoteEligible } from "../utils/documents";
import {
  ATELIER_PIPELINE_STATUSES,
  QUOTE_PRIORITY_OPTIONS,
  advanceProductionStatus,
  getAtelierBoard,
  getAtelierStatusBoard,
  resolveProcessType,
} from "../utils/production";
import { syncQuoteProductionStock } from "../utils/stock";
import { isQuoteDeliveryOverdue } from "../utils/quoteDelivery";
import { summarizeQuoteProductionLines } from "../utils/quoteLines";
import {
  downloadProductionSheetPdf,
  isProductionSheetEligible,
} from "../utils/productionPdf";
import { pageToPath } from "../utils/routes";
import { showToast } from "../utils/toast";
import { canDeleteData } from "../services/authService";
import { useAtelierRealtime } from "../hooks/useAtelierRealtime";

const PROCESS_ICONS = {
  laser: "🔥",
  dtf: "👕",
  uvdtf: "📱",
  print3d: "🧊",
  tshirt: "👔",
  other: "📋",
};

const MOBILE_ATELIER_QUERY = "(max-width: 900px)";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function advanceLabel(status) {
  const next = advanceProductionStatus(status);
  if (next === "En production") return "Lancer la production";
  if (next === "Prêt") return "Marquer prêt";
  if (next === "Livré") return "Marquer livré";
  return null;
}

function priorityLabel(priority) {
  return QUOTE_PRIORITY_OPTIONS.find((entry) => entry.value === priority)?.label || "Normale";
}

function AtelierCard({
  data,
  quote,
  onOpen,
  onAdvance,
  onStatusChange,
  onDelete,
  onGenerateBl,
  onPreviewBl,
  onDownloadProductionSheet,
  onUpdateQuote,
  canDelete = true,
  variant = "kanban",
}) {
  const process = resolveProcessType(quote);
  const nextLabel = advanceLabel(quote.status);
  const isList = variant === "list";
  const blEligible = isQuoteDeliveryNoteEligible(quote);
  const hasBl = Boolean(getDeliveryNoteForQuote(data, quote));
  const productionLines = summarizeQuoteProductionLines(quote.lines);
  const deliveryOverdue = isQuoteDeliveryOverdue(quote);
  const productionSheetEligible = isProductionSheetEligible(quote);
  const assignee = (data.users || []).find(
    (user) => String(user.id) === String(quote.assignedTo)
  );

  return (
    <article
      className={`atelier-card${isList ? " atelier-card--list" : ""}`}
      draggable={!isList}
      onDragStart={
        isList
          ? undefined
          : (event) => {
              event.dataTransfer.setData("text/plain", String(quote.id));
              event.dataTransfer.effectAllowed = "move";
              event.currentTarget.classList.add("atelier-card--dragging");
            }
      }
      onDragEnd={
        isList
          ? undefined
          : (event) => {
              event.currentTarget.classList.remove("atelier-card--dragging");
            }
      }
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
        <div className="atelier-card__top-actions">
          <span className={statusClass(quote.status)}>{quote.status}</span>
          {canDelete && (
            <button
              type="button"
              className="atelier-delete-btn"
              data-testid={`atelier-delete-${quote.id}`}
              onClick={() => onDelete(quote)}
              title="Supprimer la commande"
              aria-label={`Supprimer ${quote.number}`}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="atelier-card__client">{clientName(data, quote.clientId)}</p>

      <div className="atelier-card__assignment">
        {assignee ? (
          <span className="atelier-card__assignee" title="Opérateur assigné">
            👤 {assignee.name || assignee.email}
          </span>
        ) : (
          <span className="muted">Non assigné</span>
        )}
        {quote.priority && quote.priority !== "normal" && (
          <span className={`atelier-priority atelier-priority--${quote.priority}`}>
            {priorityLabel(quote.priority)}
          </span>
        )}
      </div>

      <div className="atelier-card__meta">
        <span className="atelier-process-badge">
          {PROCESS_ICONS[process.key] || "📋"} {process.label}
        </span>
        <span className="muted atelier-card__date">{quote.date || "—"}</span>
        {quote.promisedDeliveryDate && (
          <span
            className={`atelier-card__delivery${deliveryOverdue ? " atelier-card__delivery--overdue" : ""}`}
            title={
              deliveryOverdue
                ? "Date de livraison dépassée"
                : "Date de livraison prévue"
            }
          >
            Livraison : {quote.promisedDeliveryDate}
            {deliveryOverdue ? " · en retard" : ""}
          </span>
        )}
      </div>

      {quote.atelierNotes ? (
        <p className="atelier-card__notes" title={quote.atelierNotes}>
          {quote.atelierNotes}
        </p>
      ) : null}

      <div className="atelier-card__inline-fields">
        <select
          className="atelier-inline-select"
          value={quote.assignedTo || ""}
          onChange={(event) =>
            onUpdateQuote?.(quote, { assignedTo: event.target.value })
          }
          aria-label={`Assignation ${quote.number}`}
        >
          <option value="">Assigner…</option>
          {(data.users || [])
            .filter((user) => String(user?.status || "Actif") !== "Désactivé")
            .map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email}
              </option>
            ))}
        </select>
        <select
          className="atelier-inline-select"
          value={quote.priority || "normal"}
          onChange={(event) =>
            onUpdateQuote?.(quote, { priority: event.target.value })
          }
          aria-label={`Priorité ${quote.number}`}
        >
          {QUOTE_PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {productionLines.length > 0 && (
        <ul className="atelier-card__lines">
          {productionLines.slice(0, 3).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
          {productionLines.length > 3 && (
            <li className="muted">+ {productionLines.length - 3} ligne(s)</li>
          )}
        </ul>
      )}

      <div className={`atelier-card__actions${isList ? " atelier-card__actions--list" : ""}`}>
        {nextLabel ? (
          <button
            type="button"
            className={`atelier-advance-btn${isList ? " atelier-advance-btn--list" : ""}`}
            data-testid={`atelier-advance-${quote.id}`}
            onClick={() => onAdvance(quote)}
          >
            {nextLabel}
            {isList ? ` → ${advanceProductionStatus(quote.status)}` : null}
          </button>
        ) : (
          <span className="muted atelier-done">Livré</span>
        )}

        <select
          className={`atelier-status-select${isList ? " atelier-status-select--list" : ""}`}
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

        {productionSheetEligible && (
          <button
            type="button"
            className="atelier-fiche-btn"
            data-testid={`atelier-fiche-${quote.id}`}
            onClick={() => onDownloadProductionSheet?.(quote)}
            title="Télécharger la fiche atelier PDF"
          >
            Fiche PDF
          </button>
        )}

        {blEligible && (
          <>
            <button
              type="button"
              className="atelier-bl-btn"
              data-testid={`atelier-bl-${quote.id}`}
              onClick={() => onGenerateBl(quote)}
              title="Générer le bon de livraison"
            >
              {hasBl ? "BL ↻" : "BL"}
            </button>
            {hasBl && (
              <button
                type="button"
                className="atelier-bl-preview-btn"
                onClick={() => onPreviewBl(quote)}
                title="Voir le bon de livraison"
              >
                Voir BL
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function AtelierListSection({ title, count, icon, children, testId }) {
  return (
    <section className="atelier-list-section card" data-testid={testId}>
      <header className="atelier-list-section__header">
        <strong>
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          {title}
        </strong>
        <span className="atelier-column__count">{count}</span>
      </header>
      {count === 0 ? (
        <p className="muted atelier-list-section__empty">Aucune commande</p>
      ) : (
        <div className="atelier-list-section__cards">{children}</div>
      )}
    </section>
  );
}

import DocumentPreview from "./DocumentPreview";

export default function Atelier({
  data,
  setData,
  logActivity,
  currentRole = "Admin",
  onCloudResync,
  cloudAvailable = false,
}) {
  const navigate = useNavigate();
  const isCompact = useMediaQuery(MOBILE_ATELIER_QUERY);
  const [viewMode, setViewMode] = useState("status");
  const [layoutMode, setLayoutMode] = useState("list");
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [previewBl, setPreviewBl] = useState(null);
  const quotes = data.quotes || [];
  const statusBoard = getAtelierStatusBoard(quotes);
  const processBoard = getAtelierBoard(quotes);
  const board = viewMode === "status" ? statusBoard : processBoard;
  const showListLayout = isCompact && layoutMode === "list";
  const overdueDeliveries = quotes.filter(isQuoteDeliveryOverdue);

  useAtelierRealtime({
    enabled: cloudAvailable && typeof onCloudResync === "function",
    onRefresh: onCloudResync,
  });

  useEffect(() => {
    if (isCompact) {
      setLayoutMode("list");
    }
  }, [isCompact]);

  const statusCounts = ATELIER_PIPELINE_STATUSES.reduce((acc, status) => {
    acc[status] = statusBoard.items.filter((quote) => quote.status === status).length;
    return acc;
  }, {});

  function openQuote(quote) {
    localStorage.setItem("crm_open_document_id", quote.id);
    localStorage.setItem("crm_open_document_type", "quote");
    navigate(pageToPath("quotes"));
  }

  function patchQuote(quote, changes) {
    const nextQuotes = quotes.map((entry) =>
      String(entry.id) === String(quote.id) ? { ...entry, ...changes } : entry
    );
    setData({ ...data, quotes: nextQuotes });
  }

  function updateQuoteStatus(quote, status) {
    if (!ATELIER_PIPELINE_STATUSES.includes(status)) return;
    if (quote.status === status) return;

    const updatedQuote = { ...quote, status };
    const stockSync = syncQuoteProductionStock(
      data.products || [],
      quote,
      updatedQuote,
      { user: currentRole }
    );

    const nextQuotes = quotes.map((entry) =>
      String(entry.id) === String(quote.id)
        ? { ...updatedQuote, productionStockAdjusted: stockSync.productionStockAdjusted }
        : entry
    );

    setData({ ...data, quotes: nextQuotes, products: stockSync.products });
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

  function handleDelete(quote) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (
      !confirm(
        `Supprimer la commande « ${quote.number} » de l'atelier ?\n\nCette action supprime définitivement le devis.`
      )
    ) {
      return;
    }

    const nextQuotes = quotes.filter(
      (entry) => String(entry.id) !== String(quote.id)
    );

    const nextProducts = quote.productionStockAdjusted
      ? syncQuoteProductionStock(
          data.products || [],
          quote,
          { ...quote, status: "Accepté" },
          { user: currentRole }
        ).products
      : data.products || [];

    setData({ ...data, quotes: nextQuotes, products: nextProducts });
    logActivity?.("Suppression devis atelier", quote.number, quote.status);
    showToast(`${quote.number} supprimé de l'atelier`, "success");
  }

  function handleGenerateBl(quote) {
    try {
      const deliveryInfo = window.prompt(
        "Informations de livraison (optionnel) :",
        getDeliveryNoteForQuote(data, quote)?.deliveryInfo || ""
      );
      if (deliveryInfo === null) return;

      const result = createDeliveryNoteFromQuote(data, quote, {
        deliveryInfo: deliveryInfo.trim(),
      });
      setData(result);
      logActivity?.(
        result.created ? "Création bon de livraison" : "Mise à jour bon de livraison",
        result.deliveryNote.number,
        quote.number
      );
      showToast(
        result.created
          ? `Bon de livraison ${result.deliveryNote.number} créé.`
          : `Bon de livraison ${result.deliveryNote.number} mis à jour.`,
        "success"
      );
      setPreviewBl(result.deliveryNote);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Impossible de générer le bon de livraison.", "error");
    }
  }

  function handlePreviewBl(quote) {
    const note = getDeliveryNoteForQuote(data, quote);
    if (!note) {
      showToast("Aucun bon de livraison. Cliquez sur BL pour en créer un.", "info");
      return;
    }
    setPreviewBl(note);
  }

  function handleDownloadProductionSheet(quote) {
    try {
      downloadProductionSheetPdf({ quote, data });
      logActivity?.("Fiche atelier PDF", quote.number);
      showToast(`Fiche atelier ${quote.number} téléchargée.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de générer la fiche atelier.", "error");
    }
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

        <div className="atelier-header-actions">
          {isCompact ? (
            <div
              className="atelier-layout-toggle"
              role="tablist"
              aria-label="Disposition atelier"
            >
              <button
                type="button"
                className={layoutMode === "list" ? "active" : ""}
                onClick={() => setLayoutMode("list")}
                role="tab"
                aria-selected={layoutMode === "list"}
                data-testid="atelier-layout-list"
              >
                Liste
              </button>
              <button
                type="button"
                className={layoutMode === "kanban" ? "active" : ""}
                onClick={() => setLayoutMode("kanban")}
                role="tab"
                aria-selected={layoutMode === "kanban"}
                data-testid="atelier-layout-kanban"
              >
                Kanban
              </button>
            </div>
          ) : null}

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
      </div>

      {overdueDeliveries.length > 0 && (
        <div className="card atelier-overdue-alert" data-testid="atelier-overdue-alert">
          <strong>Livraisons en retard ({overdueDeliveries.length})</strong>
          <ul>
            {overdueDeliveries.slice(0, 6).map((quote) => (
              <li key={quote.id}>
                <button type="button" className="atelier-card__number" onClick={() => openQuote(quote)}>
                  {quote.number}
                </button>
                <span>{clientName(data, quote.clientId)}</span>
                <em>{quote.promisedDeliveryDate}</em>
                <span className={statusClass(quote.status)}>{quote.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
      ) : showListLayout ? (
        <div className="atelier-list" data-testid="atelier-list-view">
          {viewMode === "status"
            ? statusBoard.byStatus.map((column) => (
                <AtelierListSection
                  key={column.status}
                  title={column.status}
                  count={column.items.length}
                  testId={`atelier-list-status-${column.status.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {column.items.map((quote) => (
                    <AtelierCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      variant="list"
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onStatusChange={updateQuoteStatus}
                      onDelete={handleDelete}
                      onGenerateBl={handleGenerateBl}
                      onPreviewBl={handlePreviewBl}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onUpdateQuote={patchQuote}
                      canDelete={canDeleteData(currentRole)}
                    />
                  ))}
                </AtelierListSection>
              ))
            : processBoard.byProcess.map((group) => (
                <AtelierListSection
                  key={group.key}
                  title={group.label}
                  icon={PROCESS_ICONS[group.key] || "📋"}
                  count={group.items.length}
                  testId={`atelier-list-process-${group.key}`}
                >
                  {group.items.map((quote) => (
                    <AtelierCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      variant="list"
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onStatusChange={updateQuoteStatus}
                      onDelete={handleDelete}
                      onGenerateBl={handleGenerateBl}
                      onPreviewBl={handlePreviewBl}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onUpdateQuote={patchQuote}
                      canDelete={canDeleteData(currentRole)}
                    />
                  ))}
                </AtelierListSection>
              ))}
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
                      onDelete={handleDelete}
                      onGenerateBl={handleGenerateBl}
                      onPreviewBl={handlePreviewBl}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onUpdateQuote={patchQuote}
                      canDelete={canDeleteData(currentRole)}
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
                      onDelete={handleDelete}
                      onGenerateBl={handleGenerateBl}
                      onPreviewBl={handlePreviewBl}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onUpdateQuote={patchQuote}
                      canDelete={canDeleteData(currentRole)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewBl && (
        <DocumentPreview
          doc={previewBl}
          type="delivery"
          data={data}
          onClose={() => setPreviewBl(null)}
        />
      )}
    </section>
  );
}
