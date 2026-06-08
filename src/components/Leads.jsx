import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildLeadMailtoHref,
  buildLeadTelHref,
  compareLeadsForPipeline,
  convertLeadToClientAndQuote,
  countActiveLeads,
  countUnreadLeads,
  getLeadFollowUpState,
  LEAD_PIPELINE_STAGES,
  LEAD_STATUS,
  loadLocalPublicLeads,
  markLeadRead,
  mergePublicLeadsIntoData,
  normalizeLeadCommercialFields,
  PUBLIC_LEADS_UPDATED_EVENT,
  updateLeadCommercialFields,
} from "../services/leadsService";
import { openQuoteFromCalculator } from "../utils/quoteDraft";
import { showToast } from "../utils/toast";
import { getPermissions } from "../utils/permissions";
import { pageToPath } from "../utils/routes";

const STATUS_FILTERS = [
  { value: "all", label: "Tous" },
  { value: LEAD_STATUS.NEW, label: "Nouveau" },
  { value: LEAD_STATUS.READ, label: "Lu" },
  { value: LEAD_STATUS.CONVERTED, label: "Converti" },
];

const FOLLOW_UP_FILTERS = [
  { value: "all", label: "Toutes relances" },
  { value: "overdue", label: "En retard" },
  { value: "today", label: "Aujourd'hui" },
  { value: "upcoming", label: "A venir" },
  { value: "none", label: "Sans relance" },
];

function formatLeadDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString("fr-FR");
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} EUR`;
}

export default function Leads({ data, setData, logActivity, currentRole = "Admin" }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const permissions = getPermissions(currentRole);
  const canConvertLeads =
    permissions.pages.includes("quotes") && permissions.pages.includes("clients");

  useEffect(() => {
    function syncPendingLeads() {
      if (!loadLocalPublicLeads().length || typeof setData !== "function") return;
      setData((current) => mergePublicLeadsIntoData(current));
    }

    syncPendingLeads();
    window.addEventListener("focus", syncPendingLeads);
    window.addEventListener(PUBLIC_LEADS_UPDATED_EVENT, syncPendingLeads);
    return () => {
      window.removeEventListener("focus", syncPendingLeads);
      window.removeEventListener(PUBLIC_LEADS_UPDATED_EVENT, syncPendingLeads);
    };
  }, [setData]);

  const leads = (data.leads || []).map(normalizeLeadCommercialFields);
  const filteredLeads = useMemo(() => {
    const sorted = [...leads].sort((a, b) => compareLeadsForPipeline(a, b));
    return sorted.filter((lead) => {
      if (statusFilter !== "all" && String(lead.status || LEAD_STATUS.NEW) !== statusFilter) {
        return false;
      }
      if (followUpFilter === "all") return true;
      return getLeadFollowUpState(lead).key === followUpFilter;
    });
  }, [leads, statusFilter, followUpFilter]);

  const unreadCount = countUnreadLeads(leads);
  const activeCount = countActiveLeads(leads);
  const estimatedPipelineTotal = filteredLeads.reduce(
    (sum, lead) => sum + Number(lead.estimatedAmount || 0),
    0
  );
  const weightedPipelineTotal = filteredLeads.reduce(
    (sum, lead) =>
      sum + (Number(lead.estimatedAmount || 0) * Number(lead.probability || 0)) / 100,
    0
  );
  const followUpStats = leads.reduce(
    (acc, lead) => {
      const key = getLeadFollowUpState(lead).key;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { overdue: 0, today: 0, upcoming: 0, none: 0 }
  );

  const leadsByStage = useMemo(() => {
    const groups = new Map(LEAD_PIPELINE_STAGES.map((stage) => [stage.value, []]));
    for (const lead of filteredLeads) {
      const stage = lead.pipelineStage || "new";
      const target = groups.has(stage) ? stage : "new";
      groups.get(target).push(lead);
    }
    return groups;
  }, [filteredLeads]);

  function handleConvertLead(lead) {
    try {
      const result = convertLeadToClientAndQuote(data, lead.id);
      setData(result.data);
      logActivity?.(
        result.isNewClient
          ? "Conversion lead -> client + devis"
          : "Conversion lead -> devis (client existant)",
        lead.email
      );
      openQuoteFromCalculator(navigate, result.draft);
      showToast(
        result.isNewClient
          ? "Client cree et devis pre-rempli."
          : "Devis pre-rempli pour le client existant.",
        "success"
      );
    } catch (error) {
      showToast(error.message || "Conversion impossible.", "error");
    }
  }

  function handleMarkLeadRead(leadId) {
    setData((current) => ({
      ...current,
      leads: markLeadRead(current.leads || [], leadId),
    }));
    showToast("Lead marque comme lu.", "success");
  }

  function updateLead(leadId, patch) {
    setData((current) => ({
      ...current,
      leads: updateLeadCommercialFields(current.leads || [], leadId, patch),
    }));
  }

  return (
    <section data-testid="leads-page">
      <div className="page-header">
        <div>
          <h2>Leads</h2>
          <p>
            Contacts laisses via les configurateurs - {activeCount} actif(s)
            {unreadCount > 0 ? ` · ${unreadCount} nouveau(x)` : ""}.
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(pageToPath("dashboard"))}>
          Tableau de bord
        </button>
      </div>

      <div className="leads-filters card">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={statusFilter === filter.value ? "active" : ""}
            onClick={() => setStatusFilter(filter.value)}
            data-testid={`leads-filter-${filter.value}`}
          >
            {filter.label}
          </button>
        ))}
        <span className="leads-filter-separator" aria-hidden="true" />
        {FOLLOW_UP_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={followUpFilter === filter.value ? "active" : ""}
            onClick={() => setFollowUpFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="leads-pipeline-summary">
        <div className="card leads-kpi">
          <span>Pipeline estime</span>
          <strong>{money(estimatedPipelineTotal)}</strong>
        </div>
        <div className="card leads-kpi">
          <span>Pondere</span>
          <strong>{money(weightedPipelineTotal)}</strong>
        </div>
        <div className="card leads-kpi">
          <span>Leads actifs</span>
          <strong>{activeCount}</strong>
        </div>
        <div className={`card leads-kpi${followUpStats.overdue > 0 ? " leads-kpi--danger" : ""}`}>
          <span>Relances en retard</span>
          <strong>{followUpStats.overdue}</strong>
        </div>
        <div className="card leads-kpi">
          <span>Relances aujourd'hui</span>
          <strong>{followUpStats.today}</strong>
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="card leads-empty">
          <p className="muted">
            {statusFilter === "all"
              ? "Aucun lead enregistre pour le moment."
              : `Aucun lead avec le statut "${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}".`}
          </p>
        </div>
      ) : (
        <div className="leads-kanban" data-testid="leads-kanban">
          {LEAD_PIPELINE_STAGES.map((stage) => {
            const stageLeads = leadsByStage.get(stage.value) || [];
            const stageTotal = stageLeads.reduce(
              (sum, lead) => sum + Number(lead.estimatedAmount || 0),
              0
            );

            return (
              <section className="leads-kanban-column card" key={stage.value}>
                <div className="leads-kanban-column__header">
                  <div>
                    <h3>{stage.label}</h3>
                    <span>
                      {stageLeads.length} lead(s) · {money(stageTotal)}
                    </span>
                  </div>
                </div>

                <div className="leads-kanban-cards">
                  {stageLeads.length === 0 ? (
                    <p className="muted leads-kanban-empty">Aucun lead.</p>
                  ) : (
                    stageLeads.map((lead) => {
                      const mailtoHref = buildLeadMailtoHref(lead);
                      const telHref = buildLeadTelHref(lead);
                      const projectName = String(lead.metadata?.projectName || "").trim();
                      const status = String(lead.status || LEAD_STATUS.NEW);
                      const isConverted = status === LEAD_STATUS.CONVERTED;
                      const followUpState = getLeadFollowUpState(lead);

                      return (
                        <article className="lead-card" key={lead.id} data-testid={`lead-row-${lead.id}`}>
                          <div className="lead-card__top">
                            <div>
                              <strong>{projectName || lead.email || "Lead"}</strong>
                              <span>{formatLeadDate(lead.createdAt)}</span>
                            </div>
                            <div className="lead-card__badges">
                              <span className={`leads-status leads-status--${status}`}>{status}</span>
                              {followUpState.key !== "none" ? (
                                <span className={`leads-followup leads-followup--${followUpState.key}`}>
                                  {followUpState.label}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="lead-card__contacts">
                            {mailtoHref ? <a href={mailtoHref}>{lead.email}</a> : <span>{lead.email}</span>}
                            {telHref ? <a href={telHref}>{lead.phone}</a> : <span>{lead.phone || "-"}</span>}
                          </div>

                          <div className="lead-card__meta">
                            <label>
                              Source
                              <input
                                value={lead.source || ""}
                                onChange={(event) => updateLead(lead.id, { source: event.target.value })}
                                placeholder="Source"
                              />
                            </label>
                            <label>
                              Etape
                              <select
                                value={lead.pipelineStage}
                                onChange={(event) => updateLead(lead.id, { pipelineStage: event.target.value })}
                                disabled={isConverted}
                              >
                                {LEAD_PIPELINE_STAGES.map((entry) => (
                                  <option key={entry.value} value={entry.value}>
                                    {entry.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Relance
                              <input
                                type="date"
                                value={String(lead.nextFollowUpAt || "").slice(0, 10)}
                                onChange={(event) => updateLead(lead.id, { nextFollowUpAt: event.target.value })}
                              />
                            </label>
                            <label>
                              Probabilite
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={lead.probability}
                                onChange={(event) => updateLead(lead.id, { probability: event.target.value })}
                              />
                            </label>
                            <label>
                              Montant estime
                              <input
                                type="number"
                                min="0"
                                step="10"
                                value={lead.estimatedAmount}
                                onChange={(event) => updateLead(lead.id, { estimatedAmount: event.target.value })}
                              />
                            </label>
                            <label className="lead-card__notes">
                              Notes commerciales
                              <textarea
                                value={lead.commercialNotes || ""}
                                onChange={(event) => updateLead(lead.id, { commercialNotes: event.target.value })}
                                placeholder="Besoin, objection, prochain message..."
                              />
                            </label>
                          </div>

                          <div className="lead-card__score">
                            <span>{lead.probability}%</span>
                            <strong>{money(lead.estimatedAmount)}</strong>
                            {lead.nextFollowUpAt ? <em>Relance {formatShortDate(lead.nextFollowUpAt)}</em> : null}
                          </div>

                          <div className="leads-row-actions">
                            {canConvertLeads && !isConverted ? (
                              <button
                                type="button"
                                className="compact primary"
                                onClick={() => handleConvertLead(lead)}
                              >
                                Creer client + devis
                              </button>
                            ) : null}
                            {status === LEAD_STATUS.NEW ? (
                              <button
                                type="button"
                                className="compact"
                                onClick={() => handleMarkLeadRead(lead.id)}
                              >
                                Marquer lu
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
