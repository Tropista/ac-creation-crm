import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({
  isSupabaseConfigured: false,
  getSupabase: vi.fn(),
}));

import {
  LEAD_STATUS,
  buildClientFromLead,
  buildLeadMailtoHref,
  buildLeadTelHref,
  buildQuoteDraftFromLead,
  convertLeadToClientAndQuote,
  countActiveLeads,
  countUnreadLeads,
  deriveClientNameFromLead,
  findClientByEmail,
  getActiveLeads,
  loadLocalPublicLeads,
  markLeadConverted,
  markLeadRead,
  mergePublicLeadsIntoData,
  PUBLIC_LEADS_KEY,
  submitPublicLead,
} from "./leadsService";
const sampleLead = {
  id: "lead-1",
  email: "marie.dupont@example.com",
  phone: "+352 621 000 000",
  source: "configurateur-tshirt",
  metadata: {
    projectName: "T-shirts équipe",
    quantity: 24,
    color: "Noir",
    size: "L",
  },
  status: LEAD_STATUS.NEW,
  createdAt: "2026-05-01T10:00:00.000Z",
};

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

describe("leadsService", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });
  it("compte les leads non lus et actifs", () => {
    const leads = [
      sampleLead,
      { ...sampleLead, id: "lead-2", status: LEAD_STATUS.READ },
      { ...sampleLead, id: "lead-3", status: LEAD_STATUS.CONVERTED },
    ];

    expect(countUnreadLeads(leads)).toBe(1);
    expect(countActiveLeads(leads)).toBe(2);
    expect(getActiveLeads(leads)).toHaveLength(2);
  });

  it("marque un lead lu puis converti", () => {
    const readLeads = markLeadRead([sampleLead], "lead-1");
    expect(readLeads[0].status).toBe(LEAD_STATUS.READ);

    const convertedLeads = markLeadConverted(readLeads, "lead-1", { clientId: "client-1" });
    expect(convertedLeads[0].status).toBe(LEAD_STATUS.CONVERTED);
    expect(convertedLeads[0].clientId).toBe("client-1");
    expect(convertedLeads[0].convertedAt).toBeTruthy();
  });

  it("dérive un nom client depuis l’email", () => {
    expect(deriveClientNameFromLead(sampleLead)).toBe("Marie Dupont");
    expect(
      deriveClientNameFromLead({
        email: "contact@test.fr",
        metadata: { contactName: "Jean Martin" },
      })
    ).toBe("Jean Martin");
  });

  it("retrouve un client existant par email", () => {
    const clients = [{ id: "c1", email: "marie.dupont@example.com", name: "Marie" }];
    expect(findClientByEmail(clients, "Marie.Dupont@example.com")?.id).toBe("c1");
  });

  it("construit un brouillon de devis depuis un lead", () => {
    const draft = buildQuoteDraftFromLead(sampleLead, "client-1");
    expect(draft.clientId).toBe("client-1");
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].description).toContain("T-shirts équipe");
    expect(draft.lines[0].quantity).toBe(24);
  });

  it("convertit un lead en client + brouillon de devis", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "client-new" });

    const result = convertLeadToClientAndQuote({ leads: [sampleLead], clients: [] }, "lead-1");

    expect(result.isNewClient).toBe(true);
    expect(result.client.email).toBe("marie.dupont@example.com");
    expect(result.data.clients).toHaveLength(1);
    expect(result.data.leads[0].status).toBe(LEAD_STATUS.CONVERTED);
    expect(result.draft.clientId).toBe("client-new");

    vi.unstubAllGlobals();
  });

  it("réutilise un client existant lors de la conversion", () => {
    const existingClient = {
      id: "client-existing",
      email: "marie.dupont@example.com",
      name: "Marie Dupont",
      phone: "",
    };

    const result = convertLeadToClientAndQuote(
      { leads: [sampleLead], clients: [existingClient] },
      "lead-1"
    );

    expect(result.isNewClient).toBe(false);
    expect(result.data.clients).toHaveLength(1);
    expect(result.client.phone).toBe("+352 621 000 000");
    expect(result.draft.clientId).toBe("client-existing");
  });

  it("génère les liens mailto et tel", () => {
    expect(buildLeadMailtoHref(sampleLead)).toContain("mailto:marie.dupont%40example.com");
    expect(buildLeadTelHref(sampleLead)).toBe("tel:+352621000000");
  });

  it("crée un client avec les champs attendus", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "client-new" });
    const client = buildClientFromLead(sampleLead);
    expect(client.name).toBe("Marie Dupont");
    expect(client.status).toBe("Prospect");
    expect(client.notes).toContain("T-shirts équipe");
    vi.unstubAllGlobals();
  });

  it("fusionne les leads publics en attente dans les données CRM", () => {
    const pendingLead = { ...sampleLead, id: "pending-lead" };
    localStorage.setItem(PUBLIC_LEADS_KEY, JSON.stringify([pendingLead]));

    const merged = mergePublicLeadsIntoData({ leads: [], clients: [] });

    expect(merged.leads).toHaveLength(1);
    expect(merged.leads[0].id).toBe("pending-lead");
    expect(loadLocalPublicLeads()).toEqual([]);
  });

  it("conserve la file locale si le lead est déjà dans le CRM", () => {
    const pendingLead = { ...sampleLead, id: "pending-lead" };
    localStorage.setItem(PUBLIC_LEADS_KEY, JSON.stringify([pendingLead]));

    mergePublicLeadsIntoData({ leads: [pendingLead], clients: [] });

    expect(loadLocalPublicLeads()).toHaveLength(1);
    expect(loadLocalPublicLeads()[0].id).toBe("pending-lead");
  });

  it("enregistre un lead configurateur dans la file locale", async () => {
    const result = await submitPublicLead({
      email: "prospect@example.com",
      phone: "+352 621 000 000",
      metadata: { projectName: "Maquette club" },
    });

    expect(result.lead.email).toBe("prospect@example.com");
    expect(result.storage).toBe("local");
    expect(loadLocalPublicLeads()).toHaveLength(1);
    expect(loadLocalPublicLeads()[0].status).toBe(LEAD_STATUS.NEW);
  });

  it("rejette un email invalide", async () => {
    await expect(submitPublicLead({ email: "pas-un-email" })).rejects.toThrow(
      "Adresse email invalide."
    );
  });
});