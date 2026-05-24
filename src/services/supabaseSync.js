import { getSupabase } from "../supabase";

/** Refuse de pousser une suppression massive vers le cloud (ex. migration ou snapshot vide). */
export const MASS_DELETE_GUARD_MIN = 50;

export const UPSERT_CHUNK_SIZE = 50;
export const DELETE_CHUNK_SIZE = 100;
export const COLLECTION_PAGE_SIZE = 1000;
export const COLLECTION_PAGE_SIZE_MIN = 100;
export const COLLECTION_SELECT = "id,data,created_at";

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
      `Table Supabase « ${tableName} » absente. Exécutez docs/supabase-migration.sql.`
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isStatementTimeoutError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  return (
    code === "57014" ||
    message.includes("statement timeout") ||
    message.includes("canceling statement")
  );
}

export function isRetryableFetchError(error) {
  if (!error) return false;
  if (isStatementTimeoutError(error)) return true;
  const status = Number(error.status ?? error.code);
  if ([500, 502, 503, 504, 429].includes(status)) return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("internal server error") ||
    message.includes("service unavailable") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

export function formatFetchLog(tableName, count, pageCount = 1, pageSize = COLLECTION_PAGE_SIZE) {
  const pages =
    pageCount > 1 ? ` (${pageCount} pages × ${pageSize})` : count > pageSize ? "" : "";
  return `${count} enregistrement(s) chargé(s) depuis Supabase « ${tableName} »${pages}`;
}

export function formatPartialFetchError(tableName, loadedCount = 0, error = null) {
  const base = String(error?.message || error || "erreur inconnue").trim();
  if (loadedCount > 0) {
    return (
      `Chargement partiel de « ${tableName} » : ${loadedCount} ligne(s) récupérée(s) avant expiration ` +
      `(timeout Supabase). ${base}`
    );
  }
  return `Impossible de charger « ${tableName} » depuis Supabase : ${base}`;
}

/** Paginate with .range() until all rows are loaded (PostgREST default cap: 1000/request). */
export async function fetchCollectionRowsDetailed(
  supabase,
  tableName,
  {
    pageSize: initialPageSize = COLLECTION_PAGE_SIZE,
    minPageSize = COLLECTION_PAGE_SIZE_MIN,
    select = COLLECTION_SELECT,
    allowPartial = false,
    maxPages = 5000,
  } = {}
) {
  let pageSize = initialPageSize;
  let from = 0;
  const rows = [];
  let pageCount = 0;
  let partial = false;
  let lastError = null;

  while (pageCount < maxPages) {
    let res;
    let attemptPageSize = pageSize;
    let pageLoaded = false;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      res = await supabase
        .from(tableName)
        .select(select)
        .order("created_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .range(from, from + attemptPageSize - 1);

      if (!res.error) {
        pageSize = attemptPageSize;
        pageLoaded = true;
        break;
      }

      if (isMissingTableError(res.error)) {
        console.warn(
          `Table Supabase "${tableName}" introuvable — utilisation d'un tableau vide. Voir docs/SUPABASE.md.`,
          res.error
        );
        return { rows: [], partial: false, error: null, pageCount: 0, pageSize };
      }

      lastError = res.error;

      if (isRetryableFetchError(res.error) && attemptPageSize > minPageSize) {
        attemptPageSize = Math.max(minPageSize, Math.floor(attemptPageSize / 2));
        console.warn(
          `[Supabase] « ${tableName} » — ${res.error.message || res.error.code || "erreur"} ; ` +
            `nouvel essai avec ${attemptPageSize} lignes/page (offset ${from}).`
        );
        await sleep(250 * (attempt + 1));
        continue;
      }

      break;
    }

    if (!pageLoaded) {
      if (allowPartial && rows.length > 0) {
        partial = true;
        break;
      }
      throw formatSupabaseCollectionError(tableName, lastError || res?.error);
    }

    const page = res.data || [];
    rows.push(...page);
    pageCount += 1;

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  if (pageCount >= maxPages && rows.length > 0) {
    partial = true;
    lastError =
      lastError ||
      new Error(
        `Pagination Supabase interrompue sur « ${tableName} » après ${maxPages} pages — vérifiez le volume de données.`
      );
  } else if (pageCount >= maxPages) {
    throw new Error(
      `Pagination Supabase interrompue sur « ${tableName} » après ${maxPages} pages — vérifiez le volume de données.`
    );
  }

  if (rows.length > 0) {
    console.info(
      `[Supabase] ${formatFetchLog(tableName, rows.length, pageCount, pageSize)}` +
        (partial ? " (partiel)" : "")
    );
  }

  return {
    rows,
    partial,
    error: partial && lastError ? formatSupabaseCollectionError(tableName, lastError) : null,
    pageCount,
    pageSize,
  };
}

export async function fetchCollectionRows(supabase, tableName, options = {}) {
  const { rows } = await fetchCollectionRowsDetailed(supabase, tableName, options);
  return rows;
}

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

  const upsertCollectionDelta = async (table, previousItems = [], nextItems = []) => {
    const delta = getCollectionDelta(previousItems, nextItems);
    if (!delta.length) return 0;
    return upsertCollection(table, delta);
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
}

export async function loadSupabaseData({ normalizeData, emptyData } = {}) {
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
    fetchCollectionRows(supabase, "suppliers").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "expenses").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "quotes").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "invoices").then((data) => ({ data, error: null })),
    fetchCollectionRows(supabase, "crm_logs").then((data) => ({ data, error: null })),
  ]);

  const resolvedSuppliersRes = resolveCollectionResult(suppliersRes, "suppliers");
  const resolvedExpensesRes = resolveCollectionResult(expensesRes, "expenses");

  const cloudData = normalizeData({
    settings: settingsRes.data?.data || emptyData.settings,
    users: rowsToItems(usersRes.data),
    backups: rowsToItems(backupsRes.data),
    clients: rowsToItems(clientsRes.data),
    products: rowsToItems(productsRes.data),
    categories: rowsToItems(categoriesRes.data),
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
        resolvedSuppliersRes.data?.length ||
        resolvedExpensesRes.data?.length ||
        quotesRes.data?.length ||
        invoicesRes.data?.length
    ),
  };
}
