import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";
import {
  dedupeDocuments
} from "./utils/documents";
import Vue3D from "./components/Vue3D";
import Vue3DTshirt from "./components/Vue3DTshirt";
import Banque from "./components/Banque";
import Sidebar from "./components/Sidebar";
import Clients from "./components/Clients";
import Products from "./components/Products";
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
import AuthPage from "./components/auth/AuthPage";
import AccessDenied from "./components/auth/AccessDenied";
import {
  createCloudBackup
} from "./services/backupService";
import { getPermissions } from "./utils/permissions";
import {
  loadSupabaseData,
  syncSupabaseData
} from "./services/supabaseSync";

import {
  emptyData,
  normalizeData,
  loadData,
  saveData,
  dedupeItemsById,
  hasLocalBusinessData
} from "./services/dataService";
import {
  isAdminEmail,
  isAllowedUser,
  userRole,
  canAccessPage,
} from "./services/authService";
import {
  logActivity
} from "./services/logService";
const SESSION_KEY = "crm_current_user_v2";

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
      const cloud = await loadSupabaseData({
  normalizeData,
  emptyData
});

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

  useEffect(() => {
    if (!currentUser || !isAllowedUser(currentUser.email, data.users)) return;

    const lastBackupAt = localStorage.getItem("crm_last_auto_backup_at");
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (!lastBackupAt || now - Number(lastBackupAt) > twelveHours) {
      localStorage.setItem("crm_last_auto_backup_at", String(now));
      createCloudBackup({
  data,

  label:
    "Sauvegarde automatique",

  setData,

  setSyncStatus,

  currentUser,

  currentRole,

  logActivity,
});
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