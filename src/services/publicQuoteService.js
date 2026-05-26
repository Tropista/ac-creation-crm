import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadData } from "./dataService";

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

function findQuoteInLocalData(quoteId) {
  const data = loadData();
  return (data.quotes || []).find((entry) => String(entry.id) === String(quoteId)) || null;
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

  return { quote, client, settings: cloudSettings, source: "cloud" };
}

export async function acceptPublicQuote(quoteId, shareToken, settings = {}) {
  const context = await fetchPublicQuoteContext(quoteId, shareToken, settings);
  const { quote } = context;

  const blocked = ["Accepté", "Refusé", "Annulé"];
  if (blocked.includes(String(quote.status || ""))) {
    return { ...context, alreadyHandled: true };
  }

  const acceptedQuote = {
    ...quote,
    status: "Accepté",
    acceptedAt: new Date().toISOString(),
    acceptedVia: "public-link",
  };

  if (context.source === "local") {
    const data = loadData();
    const nextQuotes = (data.quotes || []).map((entry) =>
      String(entry.id) === String(quoteId) ? acceptedQuote : entry
    );
    localStorage.setItem(
      "crm_local_data_v2",
      JSON.stringify({ ...data, quotes: nextQuotes })
    );
    return { ...context, quote: acceptedQuote, accepted: true, source: "local" };
  }

  if (!isSupabaseConfigured) {
    throw new Error("Acceptation impossible — synchronisation cloud indisponible.");
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("quotes")
    .update({ data: acceptedQuote })
    .eq("id", String(quoteId));

  if (error) {
    throw new Error("Impossible d'enregistrer votre acceptation. Contactez-nous.");
  }

  return { ...context, quote: acceptedQuote, accepted: true, source: "cloud" };
}
