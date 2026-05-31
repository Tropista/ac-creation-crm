import { getSupabase, isSupabaseConfigured } from "../supabase";

export const PUBLIC_LEADS_KEY = "crm_public_leads_v1";

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

export function mergePublicLeadsIntoData(data = {}) {
  const pending = loadLocalPublicLeads();
  if (!pending.length) return data;

  const existingIds = new Set((data.leads || []).map((lead) => String(lead.id)));
  const merged = [...(data.leads || [])];

  for (const lead of pending) {
    if (!lead?.id || existingIds.has(String(lead.id))) continue;
    merged.push(lead);
    existingIds.add(String(lead.id));
  }

  saveLocalPublicLeads([]);
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
    status: "nouveau",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

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

  const localLeads = loadLocalPublicLeads();
  localLeads.push(lead);
  saveLocalPublicLeads(localLeads);
  return { lead, storage: "local" };
}

export function countUnreadLeads(leads = []) {
  return (leads || []).filter((lead) => String(lead?.status || "nouveau") === "nouveau").length;
}

export function markLeadRead(leads = [], leadId) {
  return (leads || []).map((lead) =>
    String(lead.id) === String(leadId)
      ? { ...lead, status: "lu", updatedAt: nowIso() }
      : lead
  );
}
