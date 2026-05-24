import { getSupabase } from "../supabase";

/** Refuse de pousser une suppression massive vers le cloud (ex. migration ou snapshot vide). */
export const MASS_DELETE_GUARD_MIN = 50;

export function shouldSkipMassDelete(nextItems = [], previousItems = [], removedCount = 0) {
  if (!removedCount) return false;
  if ((nextItems || []).length > 0) return false;
  return (previousItems || []).length >= MASS_DELETE_GUARD_MIN;
}

function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(message)
  );
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

const COLLECTION_PAGE_SIZE = 1000;

async function fetchCollectionRows(supabase, tableName) {
  let from = 0;
  const rows = [];

  while (true) {
    const res = await supabase
      .from(tableName)
      .select("id,data")
      .order("created_at", { ascending: true })
      .range(from, from + COLLECTION_PAGE_SIZE - 1);

    const resolved = resolveOptionalResult(res, tableName);
    const page = resolved.data || [];
    rows.push(...page);

    if (page.length < COLLECTION_PAGE_SIZE) {
      break;
    }

    from += COLLECTION_PAGE_SIZE;
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

async function safeCollectionOp(tableName, operation) {
  try {
    await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      console.warn(
        `Table Supabase "${tableName}" introuvable — sync ignorée. Voir docs/SUPABASE.md.`,
        error
      );
      return;
    }
    throw error;
  }
}

function rowsToItems(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    ...(row.data || {}),
  }));
}

export async function syncSupabaseData(nextData, previousData = {}) {
  const supabase = await getSupabase();

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

    const { error } = await supabase
      .from(table)
      .delete()
      .in("id", removedIds);

    if (error) throw error;
  };

  const upsertCollection = async (table, items = []) => {
    if (!items.length) return;

    const payload = items
      .filter((item) => item?.id)
      .map((item) => ({
        id: item.id,
        data: item,
      }));

    if (!payload.length) return;

    const { error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "id" });

    if (error) throw error;
  };

  const { error: settingsError } = await supabase
    .from("settings")
    .upsert({
      id: "main",
      data: nextData.settings,
    });

  if (settingsError) throw settingsError;

  await Promise.all([
    upsertCollection("users", nextData.users),
    upsertCollection("backups", nextData.backups),
    upsertCollection("clients", nextData.clients),
    upsertCollection("products", nextData.products),
    upsertCollection("categories", nextData.categories),
    safeCollectionOp("supplier_catalog_items", () =>
      upsertCollection("supplier_catalog_items", nextData.supplierCatalogItems)
    ),
    safeCollectionOp("client_catalog_items", () =>
      upsertCollection("client_catalog_items", nextData.clientCatalogItems)
    ),
    safeCollectionOp("catalog_items", () =>
      upsertCollection("catalog_items", nextData.clientCatalogItems)
    ),
    safeCollectionOp("catalog_selections", () =>
      upsertCollection("catalog_selections", nextData.catalogSelections)
    ),
    safeCollectionOp("suppliers", () =>
      upsertCollection("suppliers", nextData.suppliers)
    ),
    safeCollectionOp("expenses", () =>
      upsertCollection("expenses", nextData.expenses)
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
    safeCollectionOp("supplier_catalog_items", () =>
      deleteRemovedItems(
        "supplier_catalog_items",
        nextData.supplierCatalogItems,
        previousData.supplierCatalogItems
      )
    ),
    safeCollectionOp("client_catalog_items", () =>
      deleteRemovedItems(
        "client_catalog_items",
        nextData.clientCatalogItems,
        previousData.clientCatalogItems
      )
    ),
    safeCollectionOp("catalog_items", () =>
      deleteRemovedItems(
        "catalog_items",
        nextData.clientCatalogItems,
        previousData.clientCatalogItems
      )
    ),
    safeCollectionOp("catalog_selections", () =>
      deleteRemovedItems(
        "catalog_selections",
        nextData.catalogSelections,
        previousData.catalogSelections
      )
    ),
    safeCollectionOp("suppliers", () =>
      deleteRemovedItems("suppliers", nextData.suppliers, previousData.suppliers)
    ),
    safeCollectionOp("expenses", () =>
      deleteRemovedItems("expenses", nextData.expenses, previousData.expenses)
    ),
    deleteRemovedItems("quotes", nextData.quotes, previousData.quotes),
    deleteRemovedItems("invoices", nextData.invoices, previousData.invoices),
    deleteRemovedItems("backups", nextData.backups, previousData.backups),
  ]);
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

  return {
    supplierCatalogItems: rowsToItems(supplierCatalogItems),
    clientCatalogItems: mergedClientCatalogItems,
    catalogSelections: rowsToItems(catalogSelections),
    hasCatalogData: Boolean(
      supplierCatalogItems.length ||
        mergedClientCatalogItems.length ||
        catalogSelections.length
    ),
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

  return {
    data: cloudData,
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