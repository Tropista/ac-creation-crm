import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clientName, statusClass, createDeliveryNoteFromQuote, getDeliveryNoteForQuote, getQuoteDepositSummary, isQuoteDeliveryNoteEligible } from "../utils/documents";
import {
  ATELIER_PIPELINE_STATUSES,
  QUOTE_PRIORITY_OPTIONS,
  advanceProductionStatus,
  getAtelierBoard,
  getAtelierStatusBoard,
  isAtelierPipelineQuote,
  resolveProcessType,
} from "../utils/production";
import { syncQuoteProductionStock, countLowStockProducts } from "../utils/stock";
import { isQuoteDeliveryOverdue, getQuotesToLaunchToday } from "../utils/quoteDelivery";
import DeliveryUrgencyBadge from "./DeliveryUrgencyBadge";
import { summarizeQuoteProductionLines } from "../utils/quoteLines";
import {
  downloadProductionSheetPdf,
  isProductionSheetEligible,
} from "../utils/productionPdf";
import { pageToPath } from "../utils/routes";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";
import { canDeleteData } from "../services/authService";
import { useAtelierRealtime } from "../hooks/useAtelierRealtime";
import { openOrderReadyWhatsApp } from "../utils/quoteShare";
import {
  buildOperatorWeekPlanning,
  filterPlanningByOperator,
} from "../utils/atelierPlanning";
import AtelierGantt from "./AtelierGantt";
import { addDays, startOfWeekMonday } from "../utils/quoteDeliveryCalendar";
import AtelierProductionPanel from "./AtelierProductionPanel";

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

function atelierStatusBadgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("accept")) return "atelier-status-badge atelier-status-badge--accepted";
  if (normalized.includes("production")) return "atelier-status-badge atelier-status-badge--production";
  if (normalized.includes("pret") || normalized.includes("prêt")) return "atelier-status-badge atelier-status-badge--ready";
  if (normalized.includes("livre") || normalized.includes("livré")) return "atelier-status-badge atelier-status-badge--delivered";
  return `atelier-status-badge ${statusClass(status)}`;
}

function DepositBadge({ data, quote }) {
  const summary = getQuoteDepositSummary(data, quote);
  if (!summary.hasDeposits) return null;

  const percent = Number(quote.depositPercent || 0);
  const paid = summary.paidDeposit > 0.01;
  const invoiced = summary.invoicedDeposit > 0.01;

  let label = percent > 0 ? `Acompte ${percent}%` : "Acompte";
  if (paid) label = `Acompte payé (${summary.paidDeposit.toLocaleString("fr-FR")} €)`;
  else if (invoiced) label = `Acompte facturé (${summary.invoicedDeposit.toLocaleString("fr-FR")} €)`;

  return (
    <span
      className={`atelier-deposit-badge${paid ? " atelier-deposit-badge--paid" : ""}`}
      title={paid ? "Acompte encaissé" : invoiced ? "Facture d'acompte émise" : "Acompte prévu sur le devis"}
    >
      {label}
    </span>
  );
}

function AtelierMobileSimpleCard({
  data,
  quote,
  onAdvance,
  onDownloadProductionSheet,
  onOpen,
  onNotifyReady,
}) {
  const nextLabel = advanceLabel(quote.status);
  const productionSheetEligible = isProductionSheetEligible(quote);
  const process = resolveProcessType(quote);

  return (
    <article className="atelier-mobile-card" data-testid={`atelier-mobile-${quote.id}`}>
      <button type="button" className="atelier-mobile-card__number" onClick={() => onOpen(quote)}>
        {quote.number}
      </button>
      <p className="atelier-mobile-card__client">{clientName(data, quote.clientId)}</p>
      <div className="atelier-mobile-card__meta">
        <span className={atelierStatusBadgeClass(quote.status)}>{quote.status}</span>
        <span className="atelier-process-badge">
          {PROCESS_ICONS[process.key] || "📋"} {process.label}
        </span>
      </div>
      {quote.promisedDeliveryDate ? (
        <p className="atelier-mobile-card__delivery">
          Livraison : {quote.promisedDeliveryDate}
          <DeliveryUrgencyBadge quote={quote} />
        </p>
      ) : null}
      <div className="atelier-mobile-card__actions">
        {nextLabel ? (
          <button
            type="button"
            className="atelier-mobile-advance"
            data-testid={`atelier-advance-${quote.id}`}
            onClick={() => onAdvance(quote)}
          >
            {nextLabel}
          </button>
        ) : (
          <span className="muted atelier-done">Livré</span>
        )}
        {productionSheetEligible ? (
          <button
            type="button"
            className="atelier-mobile-fiche"
            data-testid={`atelier-fiche-${quote.id}`}
            onClick={() => onDownloadProductionSheet?.(quote)}
          >
            Fiche PDF
          </button>
        ) : null}
        {quote.status === "Prêt" ? (
          <button
            type="button"
            className="atelier-wa-btn"
            data-testid={`atelier-wa-${quote.id}`}
            onClick={() => onNotifyReady?.(quote)}
          >
            WhatsApp prêt
          </button>
        ) : null}
      </div>
    </article>
  );
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
  onUpdateProductionSheet,
  onNotifyReady,
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
  const urgencyClass = deliveryOverdue
    ? " atelier-card__delivery--overdue"
    : "";
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
          <span className={atelierStatusBadgeClass(quote.status)}>{quote.status}</span>
          <DepositBadge data={data} quote={quote} />
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
        <span className="atelier-card__key-date" title="Date du devis">
          Devis : {quote.date || "—"}
        </span>
        {quote.promisedDeliveryDate && (
          <span
            className={`atelier-card__delivery atelier-card__key-date${urgencyClass}`}
            title={
              deliveryOverdue
                ? "Date de livraison dépassée"
                : "Date de livraison prévue"
            }
          >
            Livraison : {quote.promisedDeliveryDate}
            <DeliveryUrgencyBadge quote={quote} />
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

      <AtelierProductionPanel
        quote={quote}
        data={data}
        onUpdate={onUpdateProductionSheet}
        onDownloadPdf={onDownloadProductionSheet}
      />

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

        {quote.status === "Prêt" && (
          <button
            type="button"
            className="atelier-wa-btn"
            data-testid={`atelier-wa-${quote.id}`}
            onClick={() => onNotifyReady?.(quote)}
            title="Prévenir le client par WhatsApp"
          >
            WhatsApp prêt
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
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [planningWeekOffset, setPlanningWeekOffset] = useState(0);
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [previewBl, setPreviewBl] = useState(null);
  const quotes = data.quotes || [];
  const settings = data.settings || {};
  const products = data.products || [];
  const lowStockCount = countLowStockProducts(products);
  const activeUsers = (data.users || []).filter(
    (user) => String(user?.status || "Actif") !== "Désactivé"
  );

  const assigneeFilteredQuotes = useMemo(() => {
    if (assigneeFilter === "all") return quotes;
    if (assigneeFilter === "unassigned") {
      return quotes.filter((quote) => !quote.assignedTo);
    }
    return quotes.filter(
      (quote) => String(quote.assignedTo || "") === String(assigneeFilter)
    );
  }, [assigneeFilter, quotes]);

  const launchTodayIds = useMemo(
    () => new Set(getQuotesToLaunchToday(assigneeFilteredQuotes).map((q) => String(q.id))),
    [assigneeFilteredQuotes]
  );

  const filteredQuotes = useMemo(() => {
    switch (priorityFilter) {
      case "today":
        return assigneeFilteredQuotes.filter((quote) =>
          launchTodayIds.has(String(quote.id))
        );
      case "overdue":
        return assigneeFilteredQuotes.filter(isQuoteDeliveryOverdue);
      case "production":
        return assigneeFilteredQuotes.filter((quote) => quote.status === "En production");
      case "waiting":
        return assigneeFilteredQuotes.filter((quote) => quote.status === "Accepté");
      default:
        return assigneeFilteredQuotes;
    }
  }, [assigneeFilteredQuotes, priorityFilter, launchTodayIds]);

  const statusBoard = getAtelierStatusBoard(filteredQuotes);
  const processBoard = getAtelierBoard(filteredQuotes);
  const board = viewMode === "status" ? statusBoard : processBoard;
  const showListLayout = isCompact && layoutMode === "list";
  const overdueDeliveries = filteredQuotes.filter(isQuoteDeliveryOverdue);
  const quotesToLaunchToday = getQuotesToLaunchToday(filteredQuotes);
  const planningWeekStart = useMemo(
    () => addDays(startOfWeekMonday(new Date()), planningWeekOffset * 7),
    [planningWeekOffset]
  );
  const operatorPlanning = useMemo(() => {
    const planning = buildOperatorWeekPlanning(filteredQuotes, activeUsers, planningWeekStart);
    return filterPlanningByOperator(planning, assigneeFilter);
  }, [filteredQuotes, activeUsers, planningWeekStart, assigneeFilter]);

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

  function updateProductionSheet(quote, nextQuote) {
    const nextQuotes = quotes.map((entry) =>
      String(entry.id) === String(quote.id) ? nextQuote : entry
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

  async function handleDelete(quote) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (
      !(await confirmAction({
        title: "Supprimer la commande atelier",
        message: `Supprimer la commande « ${quote.number} » de l'atelier ?`,
        detail: "Cette action supprime définitivement le devis.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
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

  async function handleDownloadProductionSheet(quote) {
    try {
      await downloadProductionSheetPdf({ quote, data });
      logActivity?.("Fiche atelier PDF", quote.number);
      showToast(`Fiche atelier ${quote.number} téléchargée.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de générer la fiche atelier.", "error");
    }
  }

  function handleNotifyReady(quote) {
    const client =
      (data.clients || []).find((entry) => entry.id === quote.clientId) || null;
    const result = openOrderReadyWhatsApp(quote, settings, client);
    logActivity?.("WhatsApp commande prête", quote.number);
    showToast(
      result.hasPhone
        ? `WhatsApp ouvert pour ${quote.number}.`
        : `Message prêt pour ${quote.number} — ajoutez le numéro client.`,
      "success"
    );
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
            <button
              type="button"
              className={viewMode === "planning" ? "active" : ""}
              onClick={() => setViewMode("planning")}
              role="tab"
              aria-selected={viewMode === "planning"}
              data-testid="atelier-view-planning"
            >
              Planning
            </button>
            <button
              type="button"
              className={viewMode === "gantt" ? "active" : ""}
              onClick={() => setViewMode("gantt")}
              role="tab"
              aria-selected={viewMode === "gantt"}
            >
              Gantt
            </button>
          </div>

          <label className="atelier-assignee-filter">
            <span className="muted">Assigné à</span>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              aria-label="Filtrer par assignation"
              data-testid="atelier-assignee-filter"
            >
              <option value="all">Toutes</option>
              <option value="unassigned">Non assignées</option>
              {activeUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="atelier-priority-bar" role="tablist" aria-label="Filtres priorité atelier">
        {[
          { id: "all", label: "Toutes", count: assigneeFilteredQuotes.filter(isAtelierPipelineQuote).length },
          { id: "today", label: "Aujourd'hui", count: launchTodayIds.size },
          { id: "overdue", label: "En retard", count: assigneeFilteredQuotes.filter(isQuoteDeliveryOverdue).length },
          { id: "production", label: "En production", count: assigneeFilteredQuotes.filter((q) => q.status === "En production").length },
          { id: "waiting", label: "En attente", count: assigneeFilteredQuotes.filter((q) => q.status === "Accepté").length },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={priorityFilter === entry.id}
            className={`atelier-priority-chip${priorityFilter === entry.id ? " active" : ""}${
              entry.id === "overdue" && entry.count > 0 ? " atelier-priority-chip--alert" : ""
            }`}
            onClick={() => setPriorityFilter(entry.id)}
            data-testid={`atelier-filter-${entry.id}`}
          >
            {entry.label}
            {entry.count > 0 ? <span className="atelier-priority-chip__count">{entry.count}</span> : null}
          </button>
        ))}
      </div>

      {lowStockCount > 0 ? (
        <div className="card atelier-stock-alert" data-testid="atelier-stock-alert">
          <strong>{lowStockCount} produit(s) en stock faible</strong>
          <span className="muted">Vérifiez les consommables avant de lancer la production.</span>
          <button
            type="button"
            className="compact"
            onClick={() => {
              localStorage.setItem("crm_products_stock_filter", "low");
              navigate(pageToPath("products"));
            }}
          >
            Voir produits →
          </button>
        </div>
      ) : null}

      {quotesToLaunchToday.length > 0 && priorityFilter !== "today" ? (
        <div className="card atelier-launch-today" data-testid="atelier-launch-today">
          <div className="atelier-launch-today__header">
            <strong>À lancer aujourd&apos;hui ({quotesToLaunchToday.length})</strong>
            <span className="muted">
              Devis acceptés à démarrer — triés par urgence et priorité
            </span>
          </div>
          <ul className="atelier-launch-today__list">
            {quotesToLaunchToday.map((quote) => (
              <li key={quote.id} className="atelier-launch-today__item">
                <button type="button" className="atelier-card__number" onClick={() => openQuote(quote)}>
                  {quote.number}
                </button>
                <span>{clientName(data, quote.clientId)}</span>
                <em>{quote.promisedDeliveryDate || "—"}</em>
                <DeliveryUrgencyBadge quote={quote} />
                {quote.priority && quote.priority !== "normal" && (
                  <span className={`atelier-priority atelier-priority--${quote.priority}`}>
                    {priorityLabel(quote.priority)}
                  </span>
                )}
                <button
                  type="button"
                  className="primary compact"
                  onClick={() => handleAdvance(quote)}
                >
                  Lancer →
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {overdueDeliveries.length > 0 && priorityFilter !== "overdue" ? (
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
                <DeliveryUrgencyBadge quote={quote} />
                <span className={atelierStatusBadgeClass(quote.status)}>{quote.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

      {viewMode === "planning" ? (
        <div className="card atelier-planning" data-testid="atelier-planning">
          <div className="atelier-planning__head">
            <div>
              <h3>Planning atelier</h3>
              <p className="muted">Semaine du {operatorPlanning.weekLabel}</p>
            </div>
            <div className="atelier-planning__nav">
              <button type="button" className="ghost" onClick={() => setPlanningWeekOffset((v) => v - 1)}>
                ←
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setPlanningWeekOffset(0)}
                disabled={planningWeekOffset === 0}
              >
                Cette semaine
              </button>
              <button type="button" className="ghost" onClick={() => setPlanningWeekOffset((v) => v + 1)}>
                →
              </button>
            </div>
          </div>
          <div className="atelier-planning__grid">
            <div className="atelier-planning__row atelier-planning__row--head">
              <div className="atelier-planning__operator">Opérateur</div>
              {operatorPlanning.days.map((day) => (
                <div key={day.toISOString()} className="atelier-planning__day-head">
                  {day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                </div>
              ))}
            </div>
            {[...operatorPlanning.operators, operatorPlanning.unassigned].map((row) => (
              <div key={row.user?.id || "unassigned"} className="atelier-planning__row">
                <div className="atelier-planning__operator">
                  {row.user?.name || row.user?.email || row.label}
                </div>
                {row.days.map((day) => (
                  <div key={day.date.toISOString()} className="atelier-planning__cell">
                    {day.quotes.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      day.quotes.map((quote) => (
                        <button
                          key={quote.id}
                          type="button"
                          className="atelier-planning__quote"
                          onClick={() => openQuote(quote)}
                        >
                          {quote.number}
                        </button>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : viewMode === "gantt" ? (
        <AtelierGantt
          quotes={filteredQuotes}
          data={data}
          onQuoteClick={(q) => openQuote(q)}
        />
      ) : board.total === 0 ? (
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
                    <AtelierMobileSimpleCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onNotifyReady={handleNotifyReady}
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
                    <AtelierMobileSimpleCard
                      key={quote.id}
                      data={data}
                      quote={quote}
                      onOpen={openQuote}
                      onAdvance={handleAdvance}
                      onDownloadProductionSheet={handleDownloadProductionSheet}
                      onNotifyReady={handleNotifyReady}
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
                      onUpdateProductionSheet={updateProductionSheet}
                      onNotifyReady={handleNotifyReady}
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
                      onUpdateProductionSheet={updateProductionSheet}
                      onNotifyReady={handleNotifyReady}
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
