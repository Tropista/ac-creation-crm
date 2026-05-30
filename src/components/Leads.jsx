import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildLeadMailtoHref,
  buildLeadTelHref,
  convertLeadToClientAndQuote,
  countActiveLeads,
  countUnreadLeads,
  LEAD_STATUS,
  loadLocalPublicLeads,
  markLeadRead,
  mergePublicLeadsIntoData,
  PUBLIC_LEADS_UPDATED_EVENT,
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

function formatLeadDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleString("fr-FR");
}

export default function Leads({ data, setData, logActivity, currentRole = "Admin" }) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
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

  const leads = data.leads || [];
  const filteredLeads = useMemo(() => {
    const sorted = [...leads].sort(
      (a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || ""))
    );
    if (statusFilter === "all") return sorted;
    return sorted.filter(
      (lead) => String(lead.status || LEAD_STATUS.NEW) === statusFilter
    );
  }, [leads, statusFilter]);

  const unreadCount = countUnreadLeads(leads);
  const activeCount = countActiveLeads(leads);

  function handleConvertLead(lead) {
    try {
      const result = convertLeadToClientAndQuote(data, lead.id);
      setData(result.data);
      logActivity?.(
        result.isNewClient
          ? "Conversion lead → client + devis"
          : "Conversion lead → devis (client existant)",
        lead.email
      );
      openQuoteFromCalculator(navigate, result.draft);
      showToast(
        result.isNewClient
          ? "Client créé et devis pré-rempli."
          : "Devis pré-rempli pour le client existant.",
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
    showToast("Lead marqué comme lu.", "success");
  }

  return (
    <section data-testid="leads-page">
      <div className="page-header">
        <div>
          <h2>Leads</h2>
          <p>
            Contacts laissés via les configurateurs — {activeCount} actif(s)
            {unreadCount > 0 ? ` · ${unreadCount} nouveau(x)` : ""}.
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => navigate(pageToPath("dashboard"))}>
          Tableau de bord →
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
      </div>

      {filteredLeads.length === 0 ? (
        <div className="card leads-empty">
          <p className="muted">
            {statusFilter === "all"
              ? "Aucun lead enregistré pour le moment."
              : `Aucun lead avec le statut « ${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label} ».`}
          </p>
        </div>
      ) : (
        <div className="table compact-table card">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Projet</th>
                <th>Source</th>
                <th>Statut</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const mailtoHref = buildLeadMailtoHref(lead);
                const telHref = buildLeadTelHref(lead);
                const projectName = String(lead.metadata?.projectName || "").trim();
                const status = String(lead.status || LEAD_STATUS.NEW);
                const isConverted = status === LEAD_STATUS.CONVERTED;

                return (
                  <tr key={lead.id} data-testid={`lead-row-${lead.id}`}>
                    <td>
                      {mailtoHref ? (
                        <a href={mailtoHref}>{lead.email}</a>
                      ) : (
                        lead.email
                      )}
                    </td>
                    <td>
                      {telHref ? <a href={telHref}>{lead.phone}</a> : lead.phone || "—"}
                    </td>
                    <td>{projectName || "—"}</td>
                    <td>{lead.source || "configurateur"}</td>
                    <td>
                      <span className={`leads-status leads-status--${status}`}>
                        {status}
                      </span>
                    </td>
                    <td className="muted">{formatLeadDate(lead.createdAt)}</td>
                    <td>
                      <div className="leads-row-actions">
                        {canConvertLeads && !isConverted ? (
                          <button
                            type="button"
                            className="compact primary"
                            onClick={() => handleConvertLead(lead)}
                          >
                            Créer client + devis
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
