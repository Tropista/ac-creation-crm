import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { Html5QrcodeScanner } from "html5-qrcode";
import "./App.css";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import Vue3D from "./components/Vue3D";
import Vue3DTshirt from "./components/Vue3DTshirt";
import Banque from "./components/Banque";
import { getPermissions } from "./utils/permissions";
import { money } from "./utils/money";
import Sidebar from "./components/Sidebar";
import InvoicesPage from "./components/InvoicesPage";
import Clients from "./components/Clients";
import Documents from "./components/Documents";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import Categories from "./components/Categories";
import UsersAdmin from "./components/UsersAdmin";
import ActivityLogs from "./components/ActivityLogs";
import Backups from "./components/Backups";
import ExcelImport from "./components/ExcelImport";
import BarcodeLabels from "./components/BarcodeLabels";
import ProductScan from "./components/ProductScan";
import Product3DViewer from "./components/3d/Product3DViewer";
import AuthPage from "./components/auth/AuthPage";
import AccessDenied from "./components/auth/AccessDenied";
import PaginationControls from "./components/PaginationControls";
import {
  uid,
  today,
  clientName,
  statusClass,
  dedupeDocuments
} from "./utils/documents";
import Products from "./components/Products";

const STORAGE_KEY = "crm_local_data_v2";
const SESSION_KEY = "crm_current_user_v2";

const ADMIN_EMAILS = ["ac.creation.officiel@gmail.com"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.map(normalizeEmail).includes(normalizeEmail(email));
}

function isAllowedUser(email, users = []) {
  const normalizedEmail = normalizeEmail(email);
  return (
    isAdminEmail(normalizedEmail) ||
    (users || []).some((user) =>
      normalizeEmail(user.email) === normalizedEmail &&
      user.status !== "Désactivé"
    )
  );
}

function userRole(email, users = []) {
  if (isAdminEmail(email)) return "Admin";
  const found = (users || []).find((user) => normalizeEmail(user.email) === normalizeEmail(email));
  return found?.role || "Utilisateur";
}

function canAccessPage(role, page) {
  return getPermissions(role).pages.includes(page);
}

function canDeleteData(role) {
  return getPermissions(role).canDelete;
}

const emptyData = {
  users: [],
  settings: {
    companyName: "Mon Entreprise",
    companyEmail: "contact@monentreprise.com",
    companyPhone: "+352 00 00 00 00",
    companyAddress: "Adresse de l'entreprise",
    vatNumber: "LU00000000",
    logoUrl: "",
    paymentTerms: "Conditions de paiement : virement bancaire ou carte de crédit",
    bankInfo: "Informations bancaires : Tout paiement au nom de votre entreprise\nNom de la banque : BCEE\nBIC : BCEELULL\nIBAN : LU00 0000 0000 0000 0000\nVeuillez indiquer le numéro de facture dans votre communication",
    taxRate: 17,
  },
  clients: [],
  quotes: [],
  invoices: [],
  products: [],
  categories: [],
  backups: [],
  logs: [],
};

function dedupeItemsById(items = []) {
  const map = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const key = String(item.id || item.number || JSON.stringify(item));
    map.set(key, { ...map.get(key), ...item });
  }

  return Array.from(map.values());
}

function normalizeData(data) {
  return {
    ...emptyData,
    ...data,
    settings: { ...emptyData.settings, ...(data?.settings || {}) },
    users: dedupeItemsById(data?.users || []),
    clients: dedupeItemsById(data?.clients || []),
    quotes: dedupeDocuments(data?.quotes || []),
    invoices: dedupeDocuments(data?.invoices || []),
    products: dedupeItemsById(data?.products || []),
    categories: dedupeItemsById(data?.categories || []),
    backups: dedupeItemsById(data?.backups || []),
    logs: dedupeItemsById(data?.logs || []),
  };
}

function loadData() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyData);
  } catch {
    return emptyData;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function hasLocalBusinessData(data) {
  return Boolean(
    data.users?.length ||
    data.backups?.length ||
    data.clients?.length ||
    data.products?.length ||
    data.categories?.length ||
    data.quotes?.length ||
    data.invoices?.length
  );
}

function rowsToItems(rows) {
  return (rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
}
function addLog(data, updateData, currentUser, actionName, targetName, detailsText = "") {
  const log = {
    id: crypto.randomUUID(),

    // visible directement dans Supabase
    user_name: currentUser?.name || "Système",
    action: actionName,
    target: targetName,
    details: detailsText,

    // conservé pour compatibilité
    user: currentUser?.name || "Système",

    date: new Date().toISOString(),
  };

  updateData({
    ...data,
    logs: [log, ...(data.logs || [])].slice(0, 500),
  });
}
async function loadSupabaseData() {
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

  const errors = [settingsRes, usersRes, backupsRes, clientsRes, productsRes, categoriesRes, quotesRes, invoicesRes, logsRes]
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

async function syncTable(tableName, nextItems, previousItems) {
  const next = dedupeItemsById(nextItems || []);
  const previous = dedupeItemsById(previousItems || []);

  if (next.length) {
    const payload = next
      .filter((item) => item?.id)
.map((item) => {
  const row = {
    id: item.id,
    data: item,
  };

  if (tableName === "crm_logs") {
    row.user_name = item.user_name || item.user || "Système";
    row.action = item.action || "";
    row.target = item.target || "";
    row.details = item.details || "";
  }

  return row;
});

    if (payload.length) {
      const { error } = await supabase.from(tableName).upsert(payload, { onConflict: "id" });
      if (error) throw error;
    }
  }

  const nextIds = new Set(next.map((item) => item.id).filter(Boolean));
  const deletedIds = previous
    .map((item) => item.id)
    .filter((id) => id && !nextIds.has(id));

  if (deletedIds.length) {
    const { error } = await supabase.from(tableName).delete().in("id", deletedIds);
    if (error) throw error;
  }
}

async function syncSupabaseData(nextData, previousData) {
  const next = normalizeData(nextData);
  const previous = normalizeData(previousData);


  const { error: settingsError } = await supabase
    .from("settings")
    .upsert({ id: "main", data: next.settings, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (settingsError) throw settingsError;

  await Promise.all([
    syncTable("users", next.users, previous.users),
    syncTable("backups", next.backups, previous.backups),
    syncTable("clients", next.clients, previous.clients),
    syncTable("products", next.products, previous.products),
    syncTable("categories", next.categories, previous.categories),
    syncTable("quotes", next.quotes, previous.quotes),
    syncTable("invoices", next.invoices, previous.invoices),
    syncTable("crm_logs", next.logs, previous.logs),
  ]);
}

export default function App() {
  if (window.location.pathname === "/configurateur-tshirt") {
    return <PublicTshirtConfigurator />;
  }

  return <CrmApp />;
}

function PublicTshirtConfigurator() {
  return (
    <div style={{ minHeight: "100vh", background: "#081b4b", padding: "20px" }}>
      <Vue3DTshirt />
    </div>
  );
}

function CrmApp() {
  const [data, setData] = useState(loadData);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem(SESSION_KEY) || "null"));
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connexion à Supabase...");

  const isAdmin = isAdminEmail(currentUser?.email);
  const currentRole = userRole(currentUser?.email, data.users);
  const permissions = getPermissions(currentRole);

  useEffect(() => {
    initializeCloudData();
  }, []);

  useEffect(() => saveData(data), [data]);
  useEffect(() => {
  if (page === "invoices") {
    initializeCloudData();
  }
}, [page]);

  async function initializeCloudData() {
    try {
      const localData = normalizeData(loadData());
      const cloud = await loadSupabaseData();

      if (cloud.hasCloudData) {
      const mergedData = normalizeData({
  ...cloud.data,
  users: dedupeItemsById(cloud.data.users || []),
  backups: dedupeItemsById(cloud.data.backups || []),
  logs: dedupeItemsById(cloud.data.logs || []),
});

setData(mergedData);
saveData(mergedData);
        setSyncStatus("Synchronisé avec Supabase");
      } else if (hasLocalBusinessData(localData)) {
        await syncSupabaseData(localData, emptyData);
        setData(localData);
        setSyncStatus("Données locales envoyées vers Supabase");
      } else {
        await syncSupabaseData(emptyData, emptyData);
        setData(emptyData);
        setSyncStatus("Supabase prêt");
      }
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur Supabase : vérifie les tables et les clés API");
    } finally {
      setLoading(false);
    }
  }

  async function updateData(next) {
    const normalized = normalizeData({
  ...next,
  users: dedupeItemsById(next.users || []),
  backups: dedupeItemsById(next.backups || []),
  logs: dedupeItemsById(next.logs || []),
});
    const previous = data;
    setData(normalized);
    saveData(normalized);

    try {
      setSyncStatus("Sauvegarde Supabase...");
      await syncSupabaseData(normalized, previous);
      setSyncStatus("Synchronisé avec Supabase");
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur de sauvegarde Supabase");
    }
  }

  async function logActivity(action, target = "", details = "") {
    const log = {
      id: uid(),
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      user_name: currentUser?.name || currentUser?.email || "Système",
      user: currentUser?.name || currentUser?.email || "Système",
      email: currentUser?.email || "",
      role: currentRole,
      action,
      target,
      details,
    };

    setData((currentData) => {
      const normalized = normalizeData({
        ...currentData,
        logs: [log, ...(currentData.logs || [])].slice(0, 500),
      });

      saveData(normalized);
      return normalized;
    });

    try {
      const { error } = await supabase
        .from("crm_logs")
        .upsert({
          id: log.id,
          data: log,
          user_name: log.user_name || log.user || "Système",
          action: log.action || "",
          target: log.target || "",
          details: log.details || "",
        }, { onConflict: "id" });

      if (error) throw error;
    } catch (error) {
      console.error("Erreur journal d'activité :", error);
    }
  }

  async function createCloudBackup(label = "Sauvegarde manuelle") {
    const backup = createBackupSnapshot(data, label);
    const next = normalizeData({
      ...data,
      backups: pruneBackups([backup, ...(data.backups || [])], 12),
    });

    setData(next);
    saveData(next);

    try {
      setSyncStatus("Création sauvegarde cloud...");
      await syncSupabaseData(next, data);
      setSyncStatus("Sauvegarde cloud créée");
      await logActivity("Sauvegarde créée", label);
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur sauvegarde cloud");
      alert("Erreur pendant la sauvegarde cloud.");
    }
  }

  useEffect(() => {
    if (!currentUser || !isAllowedUser(currentUser.email, data.users)) return;

    const lastBackupAt = localStorage.getItem("crm_last_auto_backup_at");
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (!lastBackupAt || now - Number(lastBackupAt) > twelveHours) {
      localStorage.setItem("crm_last_auto_backup_at", String(now));
      createCloudBackup("Sauvegarde automatique");
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (currentUser && !canAccessPage(currentRole, page)) {
      setPage("dashboard");
    }
  }, [currentUser, currentRole, page]);

  async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setPage("dashboard");
  }

  if (loading) {
    return (
      <div className="auth">
        <div className="card auth-card">
          <h1>Chargement du CRM</h1>
          <p>{syncStatus}</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage data={data} setData={updateData} setCurrentUser={setCurrentUser} />;
  }

  if (!isAllowedUser(currentUser.email, data.users)) {
    return (
      <AccessDenied user={currentUser} logout={logout} />
    );
  }

  return (
    <div className="app">
<Sidebar
  data={data}
  currentUser={currentUser}
  currentRole={currentRole}
  syncStatus={syncStatus}
  permissions={permissions}
  page={page}
  setPage={setPage}
  logout={logout}
/>

      <main className="content">
        {!canAccessPage(currentRole, page) && <AccessDenied user={currentUser} logout={logout} />}
        {page === "dashboard" && canAccessPage(currentRole, "dashboard") && <Dashboard data={data} currentRole={currentRole} />}
        {page === "clients" && canAccessPage(currentRole, "clients") && <Clients data={data} setData={updateData} currentRole={currentRole} logActivity={logActivity} />}
        {page === "products" && canAccessPage(currentRole, "products") && <Products data={data} setData={updateData} currentRole={currentRole} logActivity={logActivity} />}
        {page === "labels" && canAccessPage(currentRole, "labels") && <BarcodeLabels data={data} />}
        {page === "scan" && canAccessPage(currentRole, "scan") && <ProductScan data={data} setData={updateData} logActivity={logActivity} />}
        {page === "categories" && canAccessPage(currentRole, "categories") && <Categories data={data} setData={updateData} currentRole={currentRole} logActivity={logActivity} />}
       {page === "quotes" && canAccessPage(currentRole, "quotes") && (
  <Documents
    type="quote"
    data={data}
    setData={updateData}
    currentRole={currentRole}
    logActivity={logActivity}
  />
)}

{page === "invoices" && canAccessPage(currentRole, "invoices") && (
  <Documents
    type="invoice"
    data={data}
    setData={updateData}
    currentRole={currentRole}
    logActivity={logActivity}
  />
)}
        {page === "users" && permissions.canManageUsers && <UsersAdmin data={data} setData={updateData} logActivity={logActivity} />}
        {page === "settings" && permissions.canEditSettings && <Settings data={data} setData={updateData} logActivity={logActivity} />}
        {page === "import" && permissions.canImport && <ExcelImport data={data} setData={updateData} logActivity={logActivity} />}
        {page === "backups" && permissions.canManageUsers && <Backups data={data} setData={updateData} createCloudBackup={createCloudBackup} logActivity={logActivity} />}
        {page === "logs" && canAccessPage(currentRole, "logs") && <ActivityLogs data={data} />}
        {page === "vue3d" && <Vue3D />}
        {page === "tshirt3d" && <Vue3DTshirt />}
        {page === "banque" && <Banque />}
      </main>
    </div>
  );
}