import { supabase } from "../supabase";

function rowsToItems(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    ...(row.data || {}),
  }));
}

export async function syncSupabaseData(nextData, previousData = {}) {
  const deleteRemovedItems = async (table, nextItems = [], previousItems = []) => {
    const nextIds = new Set((nextItems || []).map((item) => item.id));

    const removedIds = (previousItems || [])
      .filter((item) => item?.id && !nextIds.has(item.id))
      .map((item) => item.id);

    if (!removedIds.length) return;

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
    upsertCollection("quotes", nextData.quotes),
    upsertCollection("invoices", nextData.invoices),
    upsertCollection("crm_logs", nextData.logs),
  ]);

  await Promise.all([
    deleteRemovedItems("users", nextData.users, previousData.users),
    deleteRemovedItems("clients", nextData.clients, previousData.clients),
    deleteRemovedItems("products", nextData.products, previousData.products),
    deleteRemovedItems("categories", nextData.categories, previousData.categories),
    deleteRemovedItems("quotes", nextData.quotes, previousData.quotes),
    deleteRemovedItems("invoices", nextData.invoices, previousData.invoices),
    deleteRemovedItems("backups", nextData.backups, previousData.backups),
  ]);
}

export async function loadSupabaseData({ normalizeData, emptyData }) {
  const [
    settingsRes,
    usersRes,
    backupsRes,
    clientsRes,
    productsRes,
    categoriesRes,
    quotesRes,
    invoicesRes,
  ] = await Promise.all([
    supabase.from("settings").select("id,data").eq("id", "main").maybeSingle(),
    supabase.from("users").select("id,data").order("created_at", { ascending: true }),
    supabase.from("backups").select("id,data").order("created_at", { ascending: false }),
    supabase.from("clients").select("id,data").order("created_at", { ascending: true }),
    supabase.from("products").select("id,data").order("created_at", { ascending: true }),
    supabase.from("categories").select("id,data").order("created_at", { ascending: true }),
    supabase.from("quotes").select("id,data").order("created_at", { ascending: true }),
    supabase.from("invoices").select("id,data").order("created_at", { ascending: true }),
  ]);

  const logsRes = await supabase
    .from("crm_logs")
    .select("id,data")
    .order("created_at", { ascending: false });

  const errors = [
    settingsRes,
    usersRes,
    backupsRes,
    clientsRes,
    productsRes,
    categoriesRes,
    quotesRes,
    invoicesRes,
    logsRes,
  ]
    .map((res) => res.error)
    .filter(Boolean);

  if (errors.length) {
    console.error("Erreur Supabase :", errors);
    throw errors[0];
  }

  const cloudData = normalizeData({
    settings: settingsRes.data?.data || emptyData.settings,
    users: rowsToItems(usersRes.data),
    backups: rowsToItems(backupsRes.data),
    clients: rowsToItems(clientsRes.data),
    products: rowsToItems(productsRes.data),
    categories: rowsToItems(categoriesRes.data),
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
        quotesRes.data?.length ||
        invoicesRes.data?.length
    ),
  };
}