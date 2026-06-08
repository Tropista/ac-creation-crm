import { getSupabase, isSupabaseConfigured } from "../supabase";
import { buildCalculatorQuoteLine } from "../utils/quoteDraft";

export const PUBLIC_LEADS_KEY = "crm_public_leads_v1";
export const PUBLIC_LEADS_UPDATED_EVENT = "crm:public-leads-updated";

export const LEAD_STATUS = {
  NEW: "nouveau",
  READ: "lu",
  CONVERTED: "converti",
};

export const LEAD_PIPELINE_STAGES = [
  { value: "new", label: "Nouveau", defaultProbability: 10 },
  { value: "qualified", label: "Qualifie", defaultProbability: 30 },
  { value: "follow-up", label: "Relance", defaultProbability: 55 },
  { value: "quote-ready", label: "Devis a preparer", defaultProbability: 75 },
  { value: "converted", label: "Converti", defaultProbability: 100 },
];

const PIPELINE_STAGE_VALUES = new Set(LEAD_PIPELINE_STAGES.map((stage) => stage.value));

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

export function loadLocalPublicLeads() {
  try {
    const raw = localStorage.getItem(PUBLIC_LEADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPublicLeads(leads) {
  localStorage.setItem(PUBLIC_LEADS_KEY, JSON.stringify(leads));
}

export function notifyPublicLeadsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PUBLIC_LEADS_UPDATED_EVENT));
}

export function mergePublicLeadsIntoData(data = {}) {
  const pending = loadLocalPublicLeads();
  if (!pending.length) return data;

  const existingIds = new Set((data.leads || []).map((lead) => String(lead.id)));
  const merged = [...(data.leads || [])];
  let added = 0;

  for (const lead of pending) {
    if (!lead?.id || existingIds.has(String(lead.id))) continue;
    merged.push(lead);
    existingIds.add(String(lead.id));
    added += 1;
  }

  if (added > 0) {
    saveLocalPublicLeads([]);
  }

  return { ...data, leads: merged };
}

export async function submitPublicLead({ email, phone = "", source = "configurateur-tshirt", metadata = {} } = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Adresse email invalide.");
  }

  const lead = {
    id: uid(),
    email: normalizedEmail,
    phone: String(phone || "").trim(),
    source,
    metadata,
    status: LEAD_STATUS.NEW,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const localLeads = loadLocalPublicLeads();
  localLeads.push(lead);
  saveLocalPublicLeads(localLeads);
  notifyPublicLeadsUpdated();

  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from("leads").insert({
        id: lead.id,
        data: lead,
      });
      if (!error) {
        return { lead, storage: "supabase" };
      }
      console.warn("Insertion lead Supabase échouée — fallback local.", error);
    } catch (error) {
      console.warn("Lead Supabase indisponible — fallback local.", error);
    }
  }

  return { lead, storage: "local" };
}

export function isActiveLead(lead) {
  return String(lead?.status || LEAD_STATUS.NEW) !== LEAD_STATUS.CONVERTED;
}

export function countUnreadLeads(leads = []) {
  return (leads || []).filter((lead) => String(lead?.status || LEAD_STATUS.NEW) === LEAD_STATUS.NEW).length;
}

export function countActiveLeads(leads = []) {
  return (leads || []).filter(isActiveLead).length;
}

export function getActiveLeads(leads = []) {
  return (leads || []).filter(isActiveLead);
}

export function getLeadPipelineStage(lead = {}) {
  if (PIPELINE_STAGE_VALUES.has(String(lead.pipelineStage || ""))) {
    return String(lead.pipelineStage);
  }

  if (String(lead.status || "") === LEAD_STATUS.CONVERTED) return "converted";
  if (String(lead.status || "") === LEAD_STATUS.READ) return "qualified";
  return "new";
}

export function getLeadProbability(lead = {}) {
  const explicit = lead.probability ?? lead.metadata?.probability;
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return Math.min(100, Math.max(0, Math.round(Number(explicit) || 0)));
  }

  const stage = LEAD_PIPELINE_STAGES.find((entry) => entry.value === getLeadPipelineStage(lead));
  return stage?.defaultProbability || 0;
}

export function getLeadEstimatedAmount(lead = {}) {
  const value = lead.estimatedAmount ?? lead.metadata?.estimatedAmount ?? lead.metadata?.budget;
  return Math.max(0, Math.round(Number(value || 0) * 100) / 100);
}

export function normalizeLeadCommercialFields(lead = {}) {
  return {
    ...lead,
    pipelineStage: getLeadPipelineStage(lead),
    probability: getLeadProbability(lead),
    estimatedAmount: getLeadEstimatedAmount(lead),
    nextFollowUpAt: lead.nextFollowUpAt || "",
  };
}

export function updateLeadCommercialFields(leads = [], leadId, patch = {}) {
  return (leads || []).map((lead) => {
    if (String(lead.id) !== String(leadId)) return lead;

    const next = { ...lead, ...patch };
    if (patch.pipelineStage && !PIPELINE_STAGE_VALUES.has(String(patch.pipelineStage))) {
      next.pipelineStage = getLeadPipelineStage(lead);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "probability")) {
      next.probability = Math.min(100, Math.max(0, Math.round(Number(patch.probability) || 0)));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "estimatedAmount")) {
      next.estimatedAmount = Math.max(0, Math.round(Number(patch.estimatedAmount || 0) * 100) / 100);
    }

    return { ...next, updatedAt: nowIso() };
  });
}

export function markLeadRead(leads = [], leadId) {
  return (leads || []).map((lead) =>
    String(lead.id) === String(leadId)
      ? { ...lead, status: LEAD_STATUS.READ, updatedAt: nowIso() }
      : lead
  );
}

export function markLeadConverted(leads = [], leadId, { clientId = "" } = {}) {
  return (leads || []).map((lead) =>
    String(lead.id) === String(leadId)
      ? {
          ...lead,
          status: LEAD_STATUS.CONVERTED,
          pipelineStage: "converted",
          probability: 100,
          convertedAt: nowIso(),
          clientId: clientId || lead.clientId || "",
          updatedAt: nowIso(),
        }
      : lead
  );
}

export function findClientByEmail(clients = [], email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  return (
    (clients || []).find(
      (client) => String(client?.email || "").trim().toLowerCase() === normalized
    ) || null
  );
}

export function deriveClientNameFromLead(lead = {}) {
  const metadata = lead.metadata || {};
  const explicitName = String(metadata.contactName || metadata.name || "").trim();
  if (explicitName) return explicitName;

  const emailLocal = String(lead.email || "").split("@")[0] || "";
  if (!emailLocal) return "Prospect configurateur";

  return emailLocal
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function buildLeadClientNotes(lead = {}) {
  const metadata = lead.metadata || {};
  const parts = [`Lead ${lead.source || "configurateur"} (${lead.createdAt || ""})`];
  if (metadata.projectName) parts.push(`Projet : ${metadata.projectName}`);
  return parts.join("\n");
}

export function buildClientFromLead(lead = {}) {
  return {
    id: uid(),
    createdAt: nowIso(),
    name: deriveClientNameFromLead(lead),
    email: String(lead.email || "").trim().toLowerCase(),
    phone: String(lead.phone || "").trim(),
    company: "",
    address: "",
    status: "Prospect",
    clientType: "Particulier",
    website: "",
    vat: "",
    taxRateOverride: "",
    zip: "",
    city: "",
    country: "Luxembourg",
    notes: buildLeadClientNotes(lead),
  };
}

export function buildQuoteDraftFromLead(lead = {}, clientId = "") {
  const metadata = lead.metadata || {};
  const projectName = String(metadata.projectName || "").trim() || "Projet configurateur";
  const source = lead.source || "configurateur";
  const details = [];

  if (metadata.size) details.push(`Taille : ${metadata.size}`);
  if (metadata.color) details.push(`Couleur : ${metadata.color}`);
  if (metadata.quantity) details.push(`Quantité : ${metadata.quantity}`);

  const description = [
    projectName,
    details.length ? details.join("\n") : "",
    `Source : ${source}`,
    `Contact : ${lead.email || "—"}${lead.phone ? ` · ${lead.phone}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    clientId,
    source: `lead ${source}`,
    notes: "Créé depuis un lead configurateur.",
    lines: [
      buildCalculatorQuoteLine({
        description,
        quantity: Number(metadata.quantity) || 1,
        priceHT: 0,
        sku: "LEAD-CFG",
        category: "Configurateur",
      }),
    ],
  };
}

export function buildLeadMailtoHref(lead = {}) {
  const email = String(lead.email || "").trim();
  if (!email) return "";
  const projectName = String(lead.metadata?.projectName || "").trim();
  const subject = projectName
    ? `AC Creation — votre projet ${projectName}`
    : "AC Creation — votre projet";
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`;
}

export function buildLeadTelHref(lead = {}) {
  const phone = String(lead.phone || "").replace(/\s/g, "");
  if (!phone) return "";
  return `tel:${phone}`;
}

export function convertLeadToClientAndQuote(data = {}, leadId) {
  const leads = data.leads || [];
  const lead = leads.find((entry) => String(entry.id) === String(leadId));
  if (!lead) {
    throw new Error("Lead introuvable.");
  }
  if (String(lead.status) === LEAD_STATUS.CONVERTED) {
    throw new Error("Ce lead a déjà été converti.");
  }

  const clients = data.clients || [];
  let client = findClientByEmail(clients, lead.email);
  let isNewClient = false;
  let nextClients = clients;

  if (!client) {
    client = buildClientFromLead(lead);
    isNewClient = true;
    nextClients = [...clients, client];
  } else if (!client.phone && lead.phone) {
    client = { ...client, phone: lead.phone };
    nextClients = clients.map((entry) => (entry.id === client.id ? client : entry));
  }

  const draft = buildQuoteDraftFromLead(lead, client.id);
  const nextLeads = markLeadConverted(leads, leadId, { clientId: client.id });

  return {
    data: {
      ...data,
      clients: nextClients,
      leads: nextLeads,
    },
    client,
    draft,
    isNewClient,
  };
}
