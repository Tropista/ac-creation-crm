import { getSupabase } from "../supabase";
import { mergeCatalogSelectionRecord } from "./syncMerge";

/** Refuse de pousser une suppression massive vers le cloud (ex. migration ou snapshot vide). */
export const MASS_DELETE_GUARD_MIN = 50;

export const UPSERT_CHUNK_SIZE = 50;
export const DELETE_CHUNK_SIZE = 100;

export const CATALOG_TABLES = {
  supplierCatalogItems: "supplier_catalog_items",
  clientCatalogItems: "client_catalog_items",
  catalogSelections: "catalog_selections",
};

function stableSerialize(value) {
  return JSON.stringify(value);
}

export function getCollectionDelta(previousItems = [], nextItems = []) {
  const previousMap = new Map(
    (previousItems || []).filter((item) => item?.id).map((item) => [String(item.id), item])
  );
  const delta = [];

  for (const item of nextItems || []) {
    if (!item?.id) continue;
    const previous = previousMap.get(String(item.id));
    if (!previous || stableSerialize(previous) !== stableSerialize(item)) {
      delta.push(item);
    }
  }

  return delta;
}

export function shouldSkipMassDelete(nextItems = [], previousItems = [], removedCount = 0) {
  if (!removedCount) return false;
  if ((nextItems || []).length > 0) return false;
  return (previousItems || []).length >= MASS_DELETE_GUARD_MIN;
}

export function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(message)
  );
}

export function formatSupabaseCollectionError(tableName, error) {
  if (isMissingTableError(error)) {
    return new Error(
      `Table Supabase « ${tableName} » absente. Exécutez docs/supabase-migration.sql (section catalogue).`
    );
  }

  const code = String(error?.code || "");
  if (code === "42501") {
    return new Error(
      `Permission refusée sur « ${tableName} » — ajoutez une politique RLS INSERT/UPDATE (voir docs/supabase-migration.sql).`
    );
  }

  const message = String(error?.message || error || "").trim();
  return new Error(message || `Erreur Supabase lors de l'écriture dans « ${tableName} ».`);
}

function resolveCollectionResult(res, tableName) {
  if (res.error && isMissingTableError(res.error)) {
    console.warn(
      `Table Supabase "${tableName}" introuvable — utilisation d'un tableau vide. Voir docs/SUPABASE.md.`,
      res.error
    );
    return { data: [], error: null };
  }
  return res;
}

function resolveOptionalResult(res, tableName) {
  const resolved = resolveCollectionResult(res, tableName);
  if (resolved.error) {
    console.warn(
      `Lecture Supabase "${tableName}" impossible — collection ignorée.`,
      resolved.error
    );
    return { data: [], error: null };
  }
  return resolved;
}

export const COLLECTION_PAGE_SIZE = 1000;

export function formatCatalogFetchLog(tableName, count, pageCount = 1) {
  const pages =
    pageCount > 1 ? ` (${pageCount} pages)` : count > COLLECTION_PAGE_SIZE ? "" : "";
  return `${count} article(s) chargé(s) depuis Supabase « ${tableName} »${pages}`;
}

export function formatCatalogSyncMessage(
  clientCount = 0,
  supplierCount = 0,
  selectionsCount = 0
) {
  const parts = [];
  if (clientCount > 0) parts.push(`${clientCount} article(s) catalogue client`);
  if (supplierCount > 0) parts.push(`${supplierCount} article(s) pool fournisseur`);
  if (selectionsCount > 0) {
    parts.push(`${selectionsCount} sélection(s) client`);
  }
  if (!parts.length) return "Catalogue synchronisé depuis Supabase";
  return `${parts.join(", ")} chargé(s) depuis Supabase`;
}

async function fetchCatalogSelectionRowsByIds(supabase, ids = []) {
  if (!ids.length) return [];

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows = [];

  for (let offset = 0; offset < uniqueIds.length; offset += DELETE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(offset, offset + DELETE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from(CATALOG_TABLES.catalogSelections)
      .select("id,data")
      .in("id", chunk);

    if (error) {
      if (isMissingTableError(error)) return [];
      throw formatSupabaseCollectionError(CATALOG_TABLES.catalogSelections, error);
    }

    rows.push(...(data || []));
  }

  return rows;
}

async function protectCatalogSelectionsDelta(supabase, delta = []) {
  if (!delta.length) return delta;

  const cloudRows = await fetchCatalogSelectionRowsByIds(
    supabase,
    delta.map((item) => item.id)
  );
  const cloudMap = new Map(
    cloudRows.map((row) => [String(row.id), { id: row.id, ...(row.data || {}) }])
  );

  return delta.map((item) => {
    const cloud = cloudMap.get(String(item.id));
    if (!cloud) return item;
    return mergeCatalogSelectionRecord(item, cloud);
  });
}

/** Paginate with .range() until all rows are loaded (PostgREST default cap: 1000/request). */
export async function fetchCollectionRows(supabase, tableName) {
  let from = 0;
  const rows = [];
  let pageCount = 0;
  const maxPages = 500;

  while (pageCount < maxPages) {
    const res = await supabase
      .from(tableName)
      .select("id,data")
      .order("created_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(from, from + COLLECTION_PAGE_SIZE - 1);

    if (res.error) {
      if (isMissingTableError(res.error)) {
        console.warn(
          `Table Supabase "${tableName}" introuvable — utilisation d'un tableau vide. Voir docs/SUPABASE.md.`,
          res.error
        );
        return [];
      }
      throw formatSupabaseCollectionError(tableName, res.error);
    }

    const page = res.data || [];
    for (const row of page) {
      rows.push(row);
    }
    pageCount += 1;

    if (page.length < COLLECTION_PAGE_SIZE) {
      break;
    }

    from += COLLECTION_PAGE_SIZE;
  }

  if (pageCount >= maxPages) {
    throw new Error(
      `Pagination Supabase interrompue sur « ${tableName} » après ${maxPages} pages — vérifiez le volume de données.`
    );
  }

  if (rows.length > 0) {
    console.info(`[Supabase] ${formatCatalogFetchLog(tableName, rows.length, pageCount)}`);
  }

  return rows;
}

async function fetchCatalogCollectionRows(supabase, tableName) {
  try {
    return await fetchCollectionRows(supabase, tableName);
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `Table Supabase "${tableName}" introuvable — utilisation d'un tableau vide. Voir docs/SUPABASE.md.`,
        error
      );
      return [];
    }
    console.warn(`Lecture Supabase "${tableName}" impossible — collection ignorée.`, error);
    return [];
  }
}

/** Écriture catalogue : ne jamais avaler les erreurs (table absente, RLS, quota). */
async function requireCollectionWrite(tableName, operation) {
  try {
    return await operation();
  } catch (error) {
    throw formatSupabaseCollectionError(tableName, error);
  }
}

/** Écriture optionnelle : tables CRM parfois absentes sur d'anciens projets. */
async function safeOptionalCollectionWrite(tableName, operation) {
  try {
    return await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `Table Supabase "${tableName}" introuvable — sync ignorée. Voir docs/SUPABASE.md.`,
        error
      );
      return 0;
    }
    throw formatSupabaseCollectionError(tableName, error);
  }
}

function rowsToItems(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    ...(row.data || {}),
  }));
}

async function upsertRowsBatched(supabase, table, items = []) {
  const payload = (items || [])
    .filter((item) => item?.id)
    .map((item) => ({
      id: item.id,
      data: item,
    }));

  if (!payload.length) return 0;

  let written = 0;
  for (let offset = 0; offset < payload.length; offset += UPSERT_CHUNK_SIZE) {
    const chunk = payload.slice(offset, offset + UPSERT_CHUNK_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw error;
    written += chunk.length;
  }

  return written;
}

export async function syncSupabaseData(nextData, previousData = {}) {
  const supabase = await getSupabase();
  const catalogWriteSummary = [];

  const deleteRemovedItems = async (table, nextItems = [], previousItems = []) => {
    const nextIds = new Set((nextItems || []).map((item) => item.id));

    const removedIds = (previousItems || [])
      .filter((item) => item?.id && !nextIds.has(item.id))
      .map((item) => item.id);

    if (!removedIds.length) return;

    if (shouldSkipMassDelete(nextItems, previousItems, removedIds.length)) {
      console.warn(
        `Protection anti-suppression : ${removedIds.length} enregistrement(s) de "${table}" non supprimés ` +
          `(passage de ${previousItems.length} à 0).`
      );
      return;
    }

    for (let offset = 0; offset < removedIds.length; offset += DELETE_CHUNK_SIZE) {
      const chunk = removedIds.slice(offset, offset + DELETE_CHUNK_SIZE);
      const { error } = await supabase.from(table).delete().in("id", chunk);
      if (error) throw formatSupabaseCollectionError(table, error);
    }
  };

  const upsertCollection = async (table, items = []) => {
    if (!items.length) return 0;
    return upsertRowsBatched(supabase, table, items);
  };

  const upsertCollectionDelta = async (
    table,
    previousItems = [],
    nextItems = [],
    { required = false, label = table, protectSelections = false } = {}
  ) => {
    let delta = getCollectionDelta(previousItems, nextItems);
    if (!delta.length) return 0;

    const write = async () => {
      if (protectSelections) {
        delta = await protectCatalogSelectionsDelta(supabase, delta);
      }

      const written = await upsertCollection(table, delta);
      if (written > 0) {
        catalogWriteSummary.push(`${label}: ${written}`);
        console.info(`[Supabase sync] ${written} ligne(s) upsert dans ${table}`);
      }
      return written;
    };

    if (required) {
      return requireCollectionWrite(table, write);
    }

    return safeOptionalCollectionWrite(table, write);
  };

  const { error: settingsError } = await supabase.from("settings").upsert({
    id: "main",
    data: nextData.settings,
  });

  if (settingsError) throw formatSupabaseCollectionError("settings", settingsError);

  await Promise.all([
    upsertCollection("users", nextData.users),
    upsertCollection("backups", nextData.backups),
    upsertCollection("clients", nextData.clients),
    upsertCollection("products", nextData.products),
    upsertCollection("categories", nextData.categories),
    upsertCollectionDelta(
      CATALOG_TABLES.supplierCatalogItems,
      previousData.supplierCatalogItems,
      nextData.supplierCatalogItems,
      { required: true, label: "pool fournisseur" }
    ),
    upsertCollectionDelta(
      CATALOG_TABLES.clientCatalogItems,
      previousData.clientCatalogItems,
      nextData.clientCatalogItems,
      { required: true, label: "catalogue client" }
    ),
    safeOptionalCollectionWrite("catalog_items", () =>
      upsertCollectionDelta(
        "catalog_items",
        previousData.clientCatalogItems,
        nextData.clientCatalogItems
      )
    ),
    safeOptionalCollectionWrite(CATALOG_TABLES.catalogSelections, () =>
      upsertCollectionDelta(
        CATALOG_TABLES.catalogSelections,
        previousData.catalogSelections,
        nextData.catalogSelections,
        { label: "sélections catalogue", protectSelections: true }
      )
    ),
    safeOptionalCollectionWrite("suppliers", () =>
      upsertCollectionDelta("suppliers", previousData.suppliers, nextData.suppliers)
    ),
    safeOptionalCollectionWrite("expenses", () =>
      upsertCollectionDelta("expenses", previousData.expenses, nextData.expenses)
    ),
    upsertCollection("quotes", nextData.quotes),
    upsertCollection("invoices", nextData.invoices),
    upsertCollection("crm_logs", nextData.logs),
  ]);

  await Promise.all([
    deleteRemovedItems("users", nextData.users, previousData.users),
    deleteRemovedItems("clients", nextData.clients, previousData.clients),
    deleteRemovedItems("products", nextData.products, previousData.products),
    deleteRemovedItems("categories", nextData.categories, previousData.categories),
    requireCollectionWrite(CATALOG_TABLES.supplierCatalogItems, () =>
      deleteRemovedItems(
        CATALOG_TABLES.supplierCatalogItems,
        nextData.supplierCatalogItems,
        previousData.supplierCatalogItems
      )
    ),
    requireCollectionWrite(CATALOG_TABLES.clientCatalogItems, () =>
      deleteRemovedItems(
        CATALOG_TABLES.clientCatalogItems,
        nextData.clientCatalogItems,
        previousData.clientCatalogItems
      )
    ),
    safeOptionalCollectionWrite("catalog_items", () =>
      deleteRemovedItems(
        "catalog_items",
        nextData.clientCatalogItems,
        previousData.clientCatalogItems
      )
    ),
    safeOptionalCollectionWrite(CATALOG_TABLES.catalogSelections, () =>
      deleteRemovedItems(
        CATALOG_TABLES.catalogSelections,
        nextData.catalogSelections,
        previousData.catalogSelections
      )
    ),
    safeOptionalCollectionWrite("suppliers", () =>
      deleteRemovedItems("suppliers", nextData.suppliers, previousData.suppliers)
    ),
    safeOptionalCollectionWrite("expenses", () =>
      deleteRemovedItems("expenses", nextData.expenses, previousData.expenses)
    ),
    deleteRemovedItems("quotes", nextData.quotes, previousData.quotes),
    deleteRemovedItems("invoices", nextData.invoices, previousData.invoices),
    deleteRemovedItems("backups", nextData.backups, previousData.backups),
  ]);

  return {
    catalogWrites: catalogWriteSummary,
  };
}

export async function loadSupabaseCatalogRecovery() {
  const supabase = await getSupabase();

  const [
    supplierCatalogItems,
    clientCatalogItems,
    legacyCatalogItems,
    catalogSelections,
  ] = await Promise.all([
    fetchCatalogCollectionRows(supabase, "supplier_catalog_items"),
    fetchCatalogCollectionRows(supabase, "client_catalog_items"),
    fetchCatalogCollectionRows(supabase, "catalog_items"),
    fetchCatalogCollectionRows(supabase, "catalog_selections"),
  ]);

  const clientItems = rowsToItems(clientCatalogItems);
  const mergedClientCatalogItems = clientItems.length
    ? clientItems
    : rowsToItems(legacyCatalogItems);

  const supplierItems = rowsToItems(supplierCatalogItems);
  const clientItemsOut = mergedClientCatalogItems;
  const selectionItems = rowsToItems(catalogSelections);

  const counts = {
    supplier: supplierItems.length,
    client: clientItemsOut.length,
    selections: selectionItems.length,
    total: supplierItems.length + clientItemsOut.length + selectionItems.length,
  };

  if (counts.total > 0) {
    console.info(
      `[Supabase] Catalogue récupéré — ${counts.client} client, ${counts.supplier} fournisseur, ${counts.selections} sélection(s).`
    );
  }

  return {
    supplierCatalogItems: supplierItems,
    clientCatalogItems: clientItemsOut,
    catalogSelections: selectionItems,
    counts,
    hasCatalogData: counts.total > 0,
  };
}

export async function loadSupabaseData({ normalizeData, emptyData }) {
  const supabase = await getSupabase();

  const settingsRes = resolveOptionalResult(
    await supabase.from("settings").select("id,data").eq("id", "main").maybeSingle(),
    "settings"
  );

  const [
    usersRes,
    backupsRes,
    clientsRes,
    productsRes,
    categoriesRes,
    catalogItemsRes,
    supplierCatalogItemsRes,
    clientCatalogItemsRes,
    catalogSelectionsRes,
    suppliersRes,
    expensesRes,
    quotesRes,
    invoicesRes,
    logsRes,
  ] = await Promise.all([
    fetchCollectionRows(supabase, "users").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "backups").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "clients").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "products").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "categories").then((data) => ({ data, error: null })),
    fetchCatalogCollectionRows(supabase, "catalog_items").then((data) => ({ data, error: null })),
    fetchCatalogCollectionRows(supabase, "supplier_catalog_items").then((data) => ({
      data,
      error: null,
    })),
    fetchCatalogCollectionRows(supabase, "client_catalog_items").then((data) => ({
      data,
      error: null,
    })),
    fetchCatalogCollectionRows(supabase, "catalog_selections").then((data) => ({
      data,
      error: null,
    })),
    fetchCatalogCollectionRows(supabase, "suppliers").then((data) => ({ data, error: null })),
    fetchCatalogCollectionRows(supabase, "expenses").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "quotes").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "invoices").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "crm_logs").then((data) => ({ data, error: null })),
  ]);

  const resolvedSupplierCatalogItemsRes = resolveCollectionResult(
    supplierCatalogItemsRes,
    "supplier_catalog_items"
  );
  const resolvedClientCatalogItemsRes = resolveCollectionResult(
    clientCatalogItemsRes,
    "client_catalog_items"
  );
  const resolvedCatalogItemsRes = resolveCollectionResult(catalogItemsRes, "catalog_items");
  const resolvedCatalogSelectionsRes = resolveCollectionResult(
    catalogSelectionsRes,
    "catalog_selections"
  );
  const resolvedSuppliersRes = resolveCollectionResult(suppliersRes, "suppliers");
  const resolvedExpensesRes = resolveCollectionResult(expensesRes, "expenses");

  const legacyClientItems = rowsToItems(resolvedCatalogItemsRes.data);
  const clientCatalogItems = rowsToItems(resolvedClientCatalogItemsRes.data);
  const mergedClientCatalogItems = clientCatalogItems.length
    ? clientCatalogItems
    : legacyClientItems;

  const cloudData = normalizeData({
    settings: settingsRes.data?.data || emptyData.settings,
    users: rowsToItems(usersRes.data),
    backups: rowsToItems(backupsRes.data),
    clients: rowsToItems(clientsRes.data),
    products: rowsToItems(productsRes.data),
    categories: rowsToItems(categoriesRes.data),
    supplierCatalogItems: rowsToItems(resolvedSupplierCatalogItemsRes.data),
    clientCatalogItems: mergedClientCatalogItems,
    catalogSelections: rowsToItems(resolvedCatalogSelectionsRes.data),
    suppliers: rowsToItems(resolvedSuppliersRes.data),
    expenses: rowsToItems(resolvedExpensesRes.data),
    quotes: rowsToItems(quotesRes.data),
    invoices: rowsToItems(invoicesRes.data),
    logs: rowsToItems(logsRes.data),
  });

  const catalogCounts = {
    supplier: cloudData.supplierCatalogItems.length,
    client: cloudData.clientCatalogItems.length,
    selections: cloudData.catalogSelections.length,
  };
  if (catalogCounts.supplier || catalogCounts.client || catalogCounts.selections) {
    console.info(
      `[Supabase] Sync cloud — ${catalogCounts.client} catalogue client, ${catalogCounts.supplier} pool fournisseur, ${catalogCounts.selections} sélection(s) chargée(s).`
    );
  }

  return {
    data: cloudData,
    catalogCounts,
    hasCloudData: Boolean(
      settingsRes.data ||
        usersRes.data?.length ||
        backupsRes.data?.length ||
        logsRes.data?.length ||
        clientsRes.data?.length ||
        productsRes.data?.length ||
        categoriesRes.data?.length ||
        resolvedSupplierCatalogItemsRes.data?.length ||
        mergedClientCatalogItems.length ||
        resolvedCatalogSelectionsRes.data?.length ||
        resolvedSuppliersRes.data?.length ||
        resolvedExpensesRes.data?.length ||
        quotesRes.data?.length ||
        invoicesRes.data?.length
    ),
  };
}
