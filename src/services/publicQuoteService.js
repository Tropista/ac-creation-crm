import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadData } from "./dataService";
import { getClientPortalDocuments } from "../utils/clientPortal";
import { acceptQuoteWithSignature } from "../utils/quoteSignature";

export function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export function ensureQuoteShareToken(quote) {
  if (!quote || typeof quote !== "object") return quote;
  if (quote.shareToken) return quote;
  return { ...quote, shareToken: generateShareToken() };
}

export function isShareTokenRequired(settings = {}) {
  return settings.quoteShareRequireToken !== false;
}

export function validateShareToken(quote, token, settings = {}) {
  if (!isShareTokenRequired(settings)) return true;
  const expected = String(quote?.shareToken || "");
  if (!expected) return false;
  return expected === String(token || "");
}

const BLOCKED_PUBLIC_STATUSES = ["Accepté", "Refusé", "Annulé"];

function findQuoteInLocalData(quoteId) {
  const data = loadData();
  return (data.quotes || []).find((entry) => String(entry.id) === String(quoteId)) || null;
}

function buildPortalContext(data, quote) {
  return getClientPortalDocuments(data, quote);
}

async function fetchPublicCollection(supabase, tableName, clientId) {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from(tableName)
    .select("data")
    .eq("data->>clientId", String(clientId));
  if (error) {
    console.warn(`Lecture portail client impossible pour ${tableName}`, error);
    return [];
  }
  return (data || []).map((row) => row.data).filter(Boolean);
}

export async function fetchPublicQuoteContext(quoteId, shareToken, settings = {}) {
  if (!quoteId) {
    throw new Error("Identifiant de devis manquant.");
  }

  const localQuote = findQuoteInLocalData(quoteId);
  if (localQuote && validateShareToken(localQuote, shareToken, settings)) {
    const data = loadData();
    return {
      quote: localQuote,
      client: (data.clients || []).find((c) => c.id === localQuote.clientId) || null,
      settings: data.settings || settings,
      portal: buildPortalContext(data, localQuote),
      source: "local",
    };
  }

  if (!isSupabaseConfigured) {
    throw new Error("Devis introuvable. Vérifiez le lien ou contactez AC Creation.");
  }

  const supabase = await getSupabase();
  const { data: row, error } = await supabase
    .from("quotes")
    .select("data")
    .eq("id", String(quoteId))
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de charger le devis pour le moment.");
  }

  const quote = row?.data;
  if (!quote) {
    throw new Error("Devis introuvable ou lien expiré.");
  }

  if (!validateShareToken(quote, shareToken, settings)) {
    throw new Error("Lien de partage invalide ou expiré.");
  }

  const client = quote.clientSnapshot
    ? { id: quote.clientId, ...quote.clientSnapshot }
    : null;

  let cloudSettings = settings;
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("data")
    .eq("id", "main")
    .maybeSingle();
  if (settingsRow?.data) {
    cloudSettings = settingsRow.data;
  }

  const [quotes, invoices, deliveryNotes, clientFiles] = await Promise.all([
    fetchPublicCollection(supabase, "quotes", quote.clientId),
    fetchPublicCollection(supabase, "invoices", quote.clientId),
    fetchPublicCollection(supabase, "delivery_notes", quote.clientId),
    fetchPublicCollection(supabase, "client_files", quote.clientId),
  ]);

  return {
    quote,
    client,
    settings: cloudSettings,
    portal: buildPortalContext({ quotes, invoices, deliveryNotes, clientFiles }, quote),
    source: "cloud",
  };
}

async function persistPublicQuote(context, quoteId, nextQuote) {
  if (context.source === "local") {
    const data = loadData();
    const nextQuotes = (data.quotes || []).map((entry) =>
      String(entry.id) === String(quoteId) ? nextQuote : entry
    );
    localStorage.setItem(
      "crm_local_data_v2",
      JSON.stringify({ ...data, quotes: nextQuotes })
    );
    return {
      ...context,
      quote: nextQuote,
      portal: buildPortalContext({ ...data, quotes: nextQuotes }, nextQuote),
      source: "local",
    };
  }

  if (!isSupabaseConfigured) {
    throw new Error("Action impossible — synchronisation cloud indisponible.");
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("quotes")
    .update({ data: nextQuote })
    .eq("id", String(quoteId));

  if (error) {
    throw new Error("Impossible d'enregistrer votre réponse. Contactez-nous.");
  }

  const nextPortal = buildPortalContext(
    {
      quotes: (context.portal?.quotes || []).map((entry) =>
        String(entry.id) === String(quoteId) ? nextQuote : entry
      ),
      invoices: context.portal?.invoices || [],
      deliveryNotes: context.portal?.deliveryNotes || [],
    },
    nextQuote
  );

  return {
    ...context,
    quote: nextQuote,
    portal: { ...nextPortal, files: context.portal?.files || nextPortal.files || [] },
    source: "cloud",
  };
}

export async function acceptPublicQuote(quoteId, shareToken, settings = {}, signature = {}) {
  const context = await fetchPublicQuoteContext(quoteId, shareToken, settings);
  const { quote } = context;

  if (BLOCKED_PUBLIC_STATUSES.includes(String(quote.status || ""))) {
    return { ...context, alreadyHandled: true };
  }

  const acceptedQuote = signature?.typedName
    ? {
        ...acceptQuoteWithSignature(quote, {
          mode: "typed",
          typedName: signature.typedName,
          clientEmail: signature.clientEmail || context.client?.email || quote.clientSnapshot?.email || "",
        }),
        acceptedVia: "public-link-signature",
      }
    : {
        ...quote,
        status: "Accepté",
        acceptedAt: new Date().toISOString(),
        acceptedVia: "public-link",
      };

  const result = await persistPublicQuote(context, quoteId, acceptedQuote);
  return { ...result, accepted: true };
}

export async function declinePublicQuote(quoteId, shareToken, settings = {}, reason = "") {
  const context = await fetchPublicQuoteContext(quoteId, shareToken, settings);
  const { quote } = context;

  if (BLOCKED_PUBLIC_STATUSES.includes(String(quote.status || ""))) {
    return { ...context, alreadyHandled: true };
  }

  const trimmedReason = String(reason || "").trim();
  const declinedQuote = {
    ...quote,
    status: "Refusé",
    declinedAt: new Date().toISOString(),
    declinedVia: "public-link",
    ...(trimmedReason ? { declineReason: trimmedReason } : {}),
  };

  const result = await persistPublicQuote(context, quoteId, declinedQuote);
  return { ...result, declined: true };
}
