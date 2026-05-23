import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadPublicCatalogCache, savePublicCatalogCache } from "../utils/catalogShare";

function rowToSelection(row) {
  if (!row) return null;
  return { id: row.id, ...(row.data || {}) };
}

function isMissingTableError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return /could not find the table|relation .* does not exist|PGRST205|42P01/i.test(message);
}

function normalizePublicError(error) {
  if (isMissingTableError(error)) {
    return new Error(
      "Table Supabase « catalog_selections » absente. Exécutez docs/supabase-migration.sql dans Supabase."
    );
  }
  return error;
}

export async function fetchPublicCatalogSelection(shareId) {
  const cached = loadPublicCatalogCache(shareId);

  if (!isSupabaseConfigured) {
    if (cached) return cached;
    throw new Error(
      "Catalogue indisponible en ligne. Configurez Supabase ou ouvrez le lien sur le même appareil que le CRM."
    );
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("catalog_selections")
      .select("id,data")
      .eq("id", shareId)
      .maybeSingle();

    if (error) throw normalizePublicError(error);
    const selection = rowToSelection(data);
    if (selection) {
      savePublicCatalogCache(selection);
      return selection;
    }
    return cached;
  } catch (error) {
    if (cached) return cached;
    throw normalizePublicError(error);
  }
}

export async function fetchPublicCatalogProducts(selection, productIds = []) {
  if (Array.isArray(selection?.productSnapshots) && selection.productSnapshots.length) {
    return selection.productSnapshots;
  }

  if (!productIds.length) return [];

  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("id,data")
      .in("id", productIds);

    if (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }

    return (data || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
  } catch {
    return [];
  }
}

export async function submitPublicCatalogSelection(shareId, submission) {
  const current = await fetchPublicCatalogSelection(shareId);
  if (!current) {
    throw new Error("Sélection introuvable.");
  }
  if (current.status === "submitted") {
    throw new Error("Cette sélection a déjà été envoyée.");
  }

  const nextSelection = {
    ...current,
    status: "submitted",
    clientSubmission: {
      ...submission,
      submittedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };

  savePublicCatalogCache(nextSelection);

  if (!isSupabaseConfigured) {
    return nextSelection;
  }

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("catalog_selections").upsert({
      id: shareId,
      data: nextSelection,
    });

    if (error) throw normalizePublicError(error);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return nextSelection;
}

export async function upsertCatalogSelection(selection) {
  savePublicCatalogCache(selection);

  if (!isSupabaseConfigured) return;

  const supabase = await getSupabase();
  const { error } = await supabase.from("catalog_selections").upsert({
    id: selection.id,
    data: selection,
  });

  if (error) throw normalizePublicError(error);
}

export async function deleteCatalogSelection(shareId) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(`crm_catalog_public_${shareId}`);
  }

  if (!isSupabaseConfigured) return;

  const supabase = await getSupabase();
  const { error } = await supabase.from("catalog_selections").delete().eq("id", shareId);
  if (error) throw normalizePublicError(error);
}
