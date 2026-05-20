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
import Documents from "./components/Documents";
import {
  uid,
  today,
  clientName,
  statusClass,
  dedupeDocuments
} from "./utils/documents";

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

function createBackupSnapshot(data, label = "Sauvegarde automatique") {
  const safeData = normalizeData(data);
  return {
    id: uid(),
    label,
    createdAt: new Date().toISOString(),
    clientsCount: safeData.clients.length,
    productsCount: safeData.products.length,
    invoicesCount: safeData.invoices.length,
    quotesCount: safeData.quotes.length,
    data: {
      ...safeData,
      backups: [],
    },
  };
}

function pruneBackups(backups, max = 12) {
  return [...(backups || [])]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, max);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

function AccessDenied({ user, logout }) {
  return (
    <div className="modern-auth">
      <div className="modern-auth-card admin-lock-card">
        <div className="lock-icon">⛔</div>
        <h2>Accès non autorisé</h2>
        <p className="auth-subtitle">
          Le compte {user?.email} existe dans Supabase, mais il n’est pas autorisé dans ce CRM.
        </p>
        <p className="admin-help">
          Un administrateur doit ajouter cet email dans la page Utilisateurs.
        </p>
        <button className="modern-primary" type="button" onClick={logout}>
          Se déconnecter <span>→</span>
        </button>
      </div>
    </div>
  );
}

function AuthPage({ data, setData, setCurrentUser }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  async function login(e) {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Indique ton email et ton mot de passe.");
      return;
    }

    const email = normalizeEmail(form.email);

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password: form.password,
    });

    if (error || !authData.user) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    if (!isAllowedUser(authData.user.email, data.users)) {
      await supabase.auth.signOut();
      setError("Compte non autorisé. Demande à l’administrateur d’ajouter ton email.");
      return;
    }

    const session = {
      id: authData.user.id,
      name: authData.user.user_metadata?.name || authData.user.email,
      email: authData.user.email,
      role: userRole(authData.user.email, data.users),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(session);
  }

  return (
    <div className="modern-auth">
      <div className="auth-orb orb-one"></div>
      <div className="auth-orb orb-two"></div>

      <section className="auth-showcase">
        <div className="brand-icon">📊</div>
        <h1>
          Mon <span>CRM</span>
        </h1>
        <p className="brand-text">
          Accès privé réservé aux utilisateurs autorisés par l’administrateur.
        </p>

        <div className="auth-features">
          <div className="feature-item">
            <div>🔐</div>
            <span>
              <strong>Accès sécurisé</strong>
              L’inscription publique est désactivée.
            </span>
          </div>

          <div className="feature-item">
            <div>👑</div>
            <span>
              <strong>Mode admin</strong>
              Seul l’admin peut autoriser de nouveaux utilisateurs.
            </span>
          </div>

          <div className="feature-item">
            <div>☁️</div>
            <span>
              <strong>Supabase</strong>
              Données synchronisées dans le cloud.
            </span>
          </div>
        </div>
      </section>

      <form className="modern-auth-card" onSubmit={login}>
        <div className="lock-icon">🔒</div>

        <h2>Bienvenue !</h2>
        <p className="auth-subtitle">Connectez-vous à votre espace privé</p>

        <label className="modern-field">
          <span>✉️</span>
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>

        <label className="modern-field">
          <span>🔑</span>
          <input
            placeholder="Mot de passe"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>

        {error && <p className="modern-error">{error}</p>}

        <button className="modern-primary" type="submit">
          Se connecter
          <span>→</span>
        </button>

        <p className="auth-note">🛡️ Compte requis et validé par l’administrateur.</p>
      </form>
    </div>
  );
}

function Dashboard({ data }) {
  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const clients = data.clients || [];
  const products = data.products || [];
  const categories = data.categories || [];

  const totalInvoices = invoices.reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
  const paidInvoices = invoices
    .filter((i) => i.status === "Payée")
    .reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
  const unpaidInvoices = totalInvoices - paidInvoices;
  const unpaidCount = invoices.filter((i) => i.status !== "Payée").length;
  const acceptedQuotes = quotes.filter((q) => q.status === "Accepté").length;

  const invoiceLines = invoices.flatMap((invoice) =>
    (invoice.lines || []).map((line) => ({
      ...line,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      date: invoice.date,
      status: invoice.status,
    }))
  );

  const productStats = products
    .map((product) => {
      const lines = invoiceLines.filter((line) => String(line.productId) === String(product.id));
      const quantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      const revenue = lines.reduce((sum, line) => sum + Number(line.totalHT || 0), 0);
      return { ...product, quantity, revenue };
    })
    .filter((p) => p.quantity > 0 || p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const clientStats = clients
    .map((client) => {
      const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
      const total = clientInvoices.reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
      return { ...client, invoiceCount: clientInvoices.length, total };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const categoryStats = categories
    .map((category) => {
      const categoryName = category.name || category.label || category.category || "";
      const normalizedCategoryName = String(categoryName).trim().toLowerCase();

      const categoryProducts = products.filter((p) =>
        String(p.categoryId || "") === String(category.id || "") ||
        String(p.category || "").trim().toLowerCase() === normalizedCategoryName
      );

      const categoryProductIds = categoryProducts.map((p) => String(p.id));

      const lines = invoiceLines.filter((line) => {
        const lineProductId = String(line.productId || "");
        const lineCategory = String(line.category || "").trim().toLowerCase();

        return (
          categoryProductIds.includes(lineProductId) ||
          lineCategory === normalizedCategoryName
        );
      });

      const revenue = lines.reduce((sum, line) => sum + Number(line.totalHT || line.subtotal || 0), 0);
      const quantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

      return { ...category, name: categoryName || "Sans catégorie", revenue, quantity };
    })
    .filter((c) => c.revenue > 0 || c.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const maxProductRevenue = Math.max(...productStats.map((p) => p.revenue), 1);
  const maxClientRevenue = Math.max(...clientStats.map((c) => c.total), 1);
  const maxCategoryRevenue = Math.max(...categoryStats.map((c) => c.revenue), 1);

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Tableau de bord</h2>
          <p>Statistiques de ventes, clients, produits et catégories.</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><span>Clients</span><strong>{clients.length}</strong></div>
        <div className="card stat"><span>Produits</span><strong>{products.length}</strong></div>
        <div className="card stat"><span>Devis</span><strong>{quotes.length}</strong></div>
        <div className="card stat"><span>Devis acceptés</span><strong>{acceptedQuotes}</strong></div>
        <div className="card stat"><span>Factures</span><strong>{invoices.length}</strong></div>
        <div className="card stat"><span>Non payées</span><strong>{unpaidCount}</strong></div>
        <div className="card stat"><span>Total facturé</span><strong>{money(totalInvoices)}</strong></div>
        <div className="card stat"><span>Payé</span><strong>{money(paidInvoices)}</strong></div>
        <div className="card stat"><span>À encaisser</span><strong>{money(unpaidInvoices)}</strong></div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Top produits vendus</h3>
          {productStats.length === 0 ? (
            <p className="muted">Aucune vente produit pour le moment.</p>
          ) : (
            <div className="bar-list">
              {productStats.map((product) => (
                <div className="bar-row" key={product.id}>
                  <div className="bar-info">
                    <strong>{product.name}</strong>
                    <span>{product.quantity} vendu(s) — {money(product.revenue)} HT</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (product.revenue / maxProductRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Meilleurs clients</h3>
          {clientStats.length === 0 ? (
            <p className="muted">Aucune facture client pour le moment.</p>
          ) : (
            <div className="bar-list">
              {clientStats.map((client) => (
                <div className="bar-row" key={client.id}>
                  <div className="bar-info">
                    <strong>{client.name}</strong>
                    <span>{client.invoiceCount} facture(s) — {money(client.total)} TTC</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (client.total / maxClientRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Ventes par catégorie</h3>
          {categoryStats.length === 0 ? (
            <p className="muted">Aucune vente par catégorie pour le moment.</p>
          ) : (
            <div className="bar-list">
              {categoryStats.map((category) => (
                <div className="bar-row" key={category.id}>
                  <div className="bar-info">
                    <strong>{category.name}</strong>
                    <span>{category.quantity} article(s) — {money(category.revenue)} HT</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (category.revenue / maxCategoryRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Dernières factures</h3>
          {invoices.length === 0 ? (
            <p className="muted">Aucune facture pour le moment.</p>
          ) : (
            <div className="table compact-table">
              <table>
                <thead>
                  <tr><th>N°</th><th>Client</th><th>Total TTC</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {invoices.slice(-6).reverse().map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{clientName(data, invoice.clientId)}</td>
                      <td>{money(invoice.totalTTC)}</td>
                      <td><span className={statusClass(invoice.status)}>{invoice.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}




function ActivityLogs({ data }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("Toutes");

  const logs = [...(data.logs || [])]
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  const actions = ["Toutes", ...Array.from(new Set(logs.map((log) => log.action).filter(Boolean)))];

  const filteredLogs = logs.filter((log) => {
    const text = [
      log.user_name,
      log.user,
      log.email,
      log.action,
      log.target,
      log.details,
      log.role,
    ].join(" ").toLowerCase();

    const matchesSearch = text.includes(search.trim().toLowerCase());
    const matchesAction = actionFilter === "Toutes" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Journal d’activité</h2>
          <p>Historique des actions effectuées dans le CRM.</p>
        </div>
      </div>

      <div className="card form-grid">
        <input
          placeholder="Rechercher par utilisateur, action, cible..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          {actions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Action</th>
              <th>Cible</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.date ? new Date(log.date).toLocaleString("fr-FR") : "-"}</td>
                <td>{log.user_name || log.user || "Système"}</td>
                <td>{log.role || "-"}</td>
                <td>{log.action || "-"}</td>
                <td>{log.target || "-"}</td>
                <td>{log.details || "-"}</td>
              </tr>
            ))}

            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan="6" className="muted">Aucune activité enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Backups({ data, setData, createCloudBackup, logActivity }) {
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const backups = pruneBackups(data.backups || [], 50);
  const selectedBackup = backups.find((backup) => backup.id === selectedBackupId);

  function exportFullJson() {
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(filename, normalizeData({ ...data, backups: data.backups || [] }));
  }

  async function restoreBackup() {
    if (!selectedBackup) return alert("Choisis une sauvegarde à restaurer.");
    if (!confirm("Restaurer cette sauvegarde ? Les données actuelles seront remplacées.")) return;

    const restored = normalizeData({
      ...selectedBackup.data,
      backups: pruneBackups([
        createBackupSnapshot(data, "Avant restauration"),
        ...(data.backups || []),
      ], 12),
    });

    await setData(restored);
    await logActivity?.("Sauvegarde restaurée", selectedBackup.label, selectedBackup.createdAt);
    alert("Sauvegarde restaurée.");
  }

  function deleteBackup(id) {
    if (!confirm("Supprimer cette sauvegarde ?")) return;
    const backupToDelete = (data.backups || []).find((backup) => backup.id === id);
    setData({
      ...data,
      backups: (data.backups || []).filter((backup) => backup.id !== id),
    });
    logActivity?.("Sauvegarde supprimée", backupToDelete?.label || id);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Sauvegardes</h2>
          <p>Sauvegarde automatique cloud et restauration complète du CRM.</p>
        </div>
      </div>

      <div className="backup-grid">
        <div className="card backup-card">
          <h3>Créer une sauvegarde</h3>
          <p className="muted">
            Une sauvegarde automatique est créée environ toutes les 12 heures.
          </p>
          <button className="primary" onClick={() => createCloudBackup("Sauvegarde manuelle")}>
            💾 Créer une sauvegarde cloud
          </button>
          <button onClick={exportFullJson}>
            ⬇️ Export JSON complet
          </button>
        </div>

        <div className="card backup-card">
          <h3>Restaurer une sauvegarde</h3>
          <select value={selectedBackupId} onChange={(e) => setSelectedBackupId(e.target.value)}>
            <option value="">Choisir une sauvegarde</option>
            {backups.map((backup) => (
              <option key={backup.id} value={backup.id}>
                {new Date(backup.createdAt).toLocaleString()} — {backup.label}
              </option>
            ))}
          </select>
          <button className="danger" onClick={restoreBackup}>
            Restaurer la sauvegarde sélectionnée
          </button>
        </div>
      </div>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Clients</th>
              <th>Produits</th>
              <th>Factures</th>
              <th>Devis</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id}>
                <td>{new Date(backup.createdAt).toLocaleString()}</td>
                <td>{backup.label}</td>
                <td>{backup.clientsCount}</td>
                <td>{backup.productsCount}</td>
                <td>{backup.invoicesCount}</td>
                <td>{backup.quotesCount}</td>
                <td>
                  <button onClick={() => downloadJson(`crm-backup-${backup.createdAt.slice(0,10)}.json`, backup.data)}>
                    Exporter
                  </button>
                  <button className="danger" onClick={() => deleteBackup(backup.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}

            {backups.length === 0 && (
              <tr>
                <td colSpan="7" className="muted">Aucune sauvegarde créée pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersAdmin({ data, setData, logActivity }) {
  const [form, setForm] = useState({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  const users = data.users || [];

  function reset() {
    setForm({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  }

  async function saveUserToSupabase(user) {
    const { error } = await supabase
      .from("users")
      .upsert(
        {
          id: user.id,
          data: user,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) throw error;
  }

  async function deleteUserFromSupabase(id) {
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async function addUser(e) {
    e.preventDefault();
    const email = normalizeEmail(form.email);

    if (!email) return alert("Email obligatoire.");
    if (isAdminEmail(email)) return alert("Cet email est déjà administrateur principal.");
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      return alert("Cet utilisateur existe déjà.");
    }

    const nextUser = {
      id: uid(),
      createdAt: today(),
      name: form.name || email,
      email,
      role: form.role,
      status: form.status,
    };

    try {
      await saveUserToSupabase(nextUser);
      await setData({ ...data, users: [...users, nextUser] });
      await logActivity?.("Création utilisateur", nextUser.email, nextUser.role);
      reset();
      alert("Utilisateur sauvegardé dans Supabase.");
    } catch (error) {
      console.error("Erreur sauvegarde utilisateur Supabase :", error);
      alert("Erreur : l'utilisateur n'a pas été sauvegardé dans Supabase.");
    }
  }

  async function updateUser(id, changes) {
    const nextUsers = users.map((user) => user.id === id ? { ...user, ...changes } : user);
    const updatedUser = nextUsers.find((user) => user.id === id);

    try {
      if (updatedUser) await saveUserToSupabase(updatedUser);
      await setData({
        ...data,
        users: nextUsers,
      });
      await logActivity?.("Modification utilisateur", updatedUser?.email || id, JSON.stringify(changes));
    } catch (error) {
      console.error("Erreur mise à jour utilisateur Supabase :", error);
      alert("Erreur : la modification utilisateur n'a pas été sauvegardée dans Supabase.");
    }
  }

  async function removeUser(id) {
    if (!confirm("Retirer cet accès utilisateur ?")) return;

    try {
      const removedUser = users.find((user) => user.id === id);
      await deleteUserFromSupabase(id);
      await setData({ ...data, users: users.filter((user) => user.id !== id) });
      await logActivity?.("Suppression utilisateur", removedUser?.email || id);
    } catch (error) {
      console.error("Erreur suppression utilisateur Supabase :", error);
      alert("Erreur : l'utilisateur n'a pas été supprimé dans Supabase.");
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Utilisateurs</h2>
          <p>Autorise les comptes qui peuvent accéder au CRM.</p>
        </div>
      </div>

      <div className="card admin-warning">
        <strong>Important :</strong>
        <p>
          L’inscription publique est désactivée. Pour créer un nouveau compte, ajoute d’abord
          l’utilisateur ici, puis crée son compte dans Supabase → Authentication → Users.
        </p>
      </div>

      <div className="card role-card">
        <h3>Permissions</h3>
        <p><span className="role-badge admin">👑 Admin</span> Accès complet, suppression, paramètres, import et utilisateurs.</p>
        <p><span className="role-badge employe">👨‍💼 Employé</span> Dashboard, clients, devis et factures. Pas de suppression.</p>
        <p><span className="role-badge comptable">💰 Comptable</span> Dashboard et factures. Pas de suppression.</p>
      </div>

      <form className="card form-grid" onSubmit={addUser}>
        <input
          placeholder="Nom utilisateur"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Email autorisé *"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option>Employé</option>
          <option>Comptable</option>
          <option>Admin</option>
          <option>Utilisateur</option>
        </select>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Actif</option>
          <option>Désactivé</option>
        </select>
        <button className="primary">Autoriser l’utilisateur</button>
      </form>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AC Creation</td>
              <td>ac.creation.officiel@gmail.com</td>
              <td><span className="badge vip">Admin principal</span></td>
              <td><span className="badge client">Actif</span></td>
              <td>-</td>
            </tr>

            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role || "Utilisateur"} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                    <option>Employé</option>
                    <option>Comptable</option>
                    <option>Admin</option>
                    <option>Utilisateur</option>
                  </select>
                </td>
                <td>
                  <select value={user.status || "Actif"} onChange={(e) => updateUser(user.id, { status: e.target.value })}>
                    <option>Actif</option>
                    <option>Désactivé</option>
                  </select>
                </td>
                <td>
                  <button className="danger" onClick={() => removeUser(user.id)}>Retirer accès</button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">Aucun utilisateur ajouté pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Settings({ data, setData, logActivity }) {
  const [form, setForm] = useState(data.settings);

  function submit(e) {
    e.preventDefault();
    setData({ ...data, settings: { ...form, taxRate: Number(form.taxRate || 0) } });
    logActivity?.("Modification paramètres", "Paramètres entreprise");
    alert("Paramètres sauvegardés.");
  }

  return (
    <section>
      <div className="page-header"><div><h2>Paramètres</h2><p>Infos utilisées sur les devis et factures.</p></div></div>
      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom entreprise" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        <input placeholder="Email entreprise" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} />
        <input placeholder="Téléphone entreprise" value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} />
        <input placeholder="Adresse entreprise" value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} />
        <input placeholder="N° TVA" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
        <input placeholder="URL du logo" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
        <input type="number" min="0" placeholder="TVA %" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
        <textarea placeholder="Conditions de paiement" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
        <textarea placeholder="Informations bancaires" value={form.bankInfo} onChange={(e) => setForm({ ...form, bankInfo: e.target.value })} />
        <button className="primary">Sauvegarder</button>
      </form>
    </section>
  );
}


function PaginationControls({ page, totalPages, onPageChange, totalItems, perPage }) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalItems);

  return (
    <div className="pagination-controls">
      <span>
        {start}-{end} sur {totalItems}
      </span>

      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        ← Précédent
      </button>

      <strong>
        Page {page} / {totalPages}
      </strong>

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Suivant →
      </button>
    </div>
  );
}

function Clients({ data, setData, currentRole = 'Admin', logActivity }) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });

  const itemsPerPage = 25;
  const clients = (data.clients || [])
    .filter((c) => [c.name, c.email, c.phone, c.company, c.status, c.address].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "nameAsc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "nameDesc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "dateDesc") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "dateAsc") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      return 0;
    });
  const clientTotalPages = Math.max(1, Math.ceil(clients.length / itemsPerPage));
  const clientPage = Math.min(currentPage, clientTotalPages);
  const paginatedClients = clients.slice((clientPage - 1) * itemsPerPage, clientPage * itemsPerPage);
  const selectedClient = (data.clients || []).find((c) => c.id === selectedClientId);
  const selectedClientInvoices = selectedClient
    ? (data.invoices || [])
        .filter((invoice) => String(invoice.clientId) === String(selectedClient.id))
        .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    : [];
  const selectedClientInvoiceTotal = selectedClientInvoices.reduce((sum, invoice) => sum + Number(invoice.totalTTC || 0), 0);

  function reset() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Le nom du client est obligatoire.");
    if (editing) {
      setData({ ...data, clients: data.clients.map((c) => (c.id === editing ? { ...c, ...form } : c)) });
      logActivity?.("Modification client", form.name);
    } else {
      const client = { id: uid(), createdAt: today(), ...form };
      setData({ ...data, clients: [...data.clients, client] });
      setSelectedClientId(client.id);
      logActivity?.("Création client", client.name);
    }
    reset();
  }

  function edit(client) {
    setEditing(client.id);
    setForm({
      name: client.name || "", email: client.email || "", phone: client.phone || "",
      company: client.company || "", address: client.address || "",
      status: client.status || "Prospect", notes: client.notes || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) return alert("Ton rôle ne permet pas de supprimer.");
    if (!confirm("Supprimer ce client ?")) return;
    const removedClient = data.clients.find((c) => c.id === id);
    setData({ ...data, clients: data.clients.filter((c) => c.id !== id) });
    logActivity?.("Suppression client", removedClient?.name || id);
    if (selectedClientId === id) setSelectedClientId(null);
  }

  return (
    <section className="clients-page">
      <div className="page-header"><div><h2>Clients</h2><p>Ajoute tes prospects et clients.</p></div></div>

      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom client *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Société" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Prospect</option><option>Client</option><option>VIP</option><option>Inactif</option>
        </select>
        <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="primary">{editing ? "Modifier" : "Ajouter"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="clients-toolbar">
        <input className="search" placeholder="Rechercher un client..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
        <select className="client-sort" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}>
          <option value="nameAsc">Nom : A → Z</option>
          <option value="nameDesc">Nom : Z → A</option>
          <option value="dateDesc">Date : récent</option>
          <option value="dateAsc">Date : ancien</option>
          <option value="status">Statut</option>
        </select>
      </div>

      <div className="two-columns clients-layout">
        <div className="table card clients-table-card">
          <table>
            <thead><tr><th>Nom du client</th><th>Actions</th></tr></thead>
            <tbody>
              {paginatedClients.map((c) => (
                <tr key={c.id} className={selectedClientId === c.id ? "selected-client-row" : ""}>
                  <td>
                    <button className="link-button client-name-button" onClick={() => setSelectedClientId(c.id)}>
                      <strong>{c.name}</strong>
                    </button>
                  </td>
                  <td className="client-actions">
                    <button onClick={() => edit(c)}>Modifier</button>
                    <button className="danger" onClick={() => remove(c.id)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            totalItems={clients.length}
            perPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>

        <div className="card client-side-card">
          <h3>Fiche client</h3>
          {!selectedClient ? <p className="muted">Clique sur un client pour voir sa fiche.</p> : (
            <div className="client-card">
              <h2>{selectedClient.name}</h2>
              <p><strong>Société :</strong> {selectedClient.company || "-"}</p>
              <p><strong>Email :</strong> {selectedClient.email || "-"}</p>
              <p><strong>Téléphone :</strong> {selectedClient.phone || "-"}</p>
              <p><strong>Adresse :</strong> {selectedClient.address || "-"}</p>
              <p><strong>Statut :</strong> <span className={statusClass(selectedClient.status)}>{selectedClient.status}</span></p>
              <p><strong>Créé le :</strong> {selectedClient.createdAt}</p>
              <p><strong>Notes :</strong><br />{selectedClient.notes || "-"}</p>

              <div className="client-history">
                <h4>Historique factures</h4>
                <div className="client-history-total">
                  <span>{selectedClientInvoices.length} facture(s)</span>
                  <strong>{money(selectedClientInvoiceTotal)}</strong>
                </div>

                {selectedClientInvoices.length === 0 ? (
                  <p className="muted">Aucune facture pour ce client.</p>
                ) : (
                  <div className="client-history-list">
                    {selectedClientInvoices.slice(0, 5).map((invoice) => (
                      <div className="client-history-item" key={invoice.id}>
                        <div>
                          <strong>{invoice.number || "Facture"}</strong>
                          <span>{invoice.date || invoice.createdAt || "-"}</span>
                        </div>
                        <div>
                          <strong>{money(invoice.totalTTC || 0)}</strong>
                          <span className={statusClass(invoice.status)}>{invoice.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



function DocumentPreview({ doc, type, data, onClose }) {
  const isQuote = type === "quote";
  const client = data.clients.find((c) => c.id === doc.clientId);
  const amountDue = doc.status === "Payée" ? 0 : (doc.totalTTC || 0);
  const lines = doc.lines?.length
    ? doc.lines
    : [
        {
          description: doc.description,
          quantity: doc.quantity,
          price: doc.price,
          discount: doc.discount || 0,
          subtotal: doc.subtotal,
          totalHT: doc.totalHT,
        },
      ];

  async function downloadPdf() {
    const element = document.querySelector(".invoice-pdf-area");
    if (!element) return alert("Zone PDF introuvable.");

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${isQuote ? "devis" : "facture"}-${doc.number || "document"}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Impossible de générer le PDF.");
    }
  }

  function sendEmail() {
    if (!client?.email) {
      alert("Ce client n'a pas d'adresse email enregistrée.");
      return;
    }

    const documentName = isQuote ? "devis" : "facture";
    const subject = `${isQuote ? "Devis" : "Facture"} ${doc.number} - ${data.settings.companyName}`;
    const body = `Bonjour ${client?.name || ""},

Veuillez trouver ci-dessous les informations de votre ${documentName}.

${isQuote ? "Devis" : "Facture"} : ${doc.number}
Date : ${doc.date}
Montant total TTC : ${money(doc.totalTTC)}
Statut : ${doc.status}

${data.settings.paymentTerms || ""}

${data.settings.bankInfo || ""}

Cordialement,
${data.settings.companyName}
${data.settings.companyPhone || ""}
${data.settings.companyEmail || ""}`;

    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="modal">
      <div className="modal-content invoice-modal">
        <div className="no-print modal-actions">
          <button onClick={onClose}>Fermer</button>
          <button onClick={sendEmail}>Envoyer par email</button>
          <button onClick={() => window.print()}>
            Imprimer
          </button>
          <button className="primary" onClick={downloadPdf}>
            Télécharger PDF
          </button>
        </div>

        <div className="print-area invoice-template invoice-pink-template invoice-pdf-area">
          <div
            className="invoice-modern-header"
            style={{
              width: "92%",
              margin: "0 auto 26px auto",
              display: "grid",
              gridTemplateColumns: "115px 1fr 255px",
              gap: "22px",
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            <div className="invoice-logo-box">
             <img
  className="invoice-main-logo"
  src={data.settings.logoUrl && data.settings.logoUrl.trim() !== "" ? data.settings.logoUrl : "./logo.png"}
  alt="Logo entreprise"
  onError={(e) => {
    e.currentTarget.src = "./logo.png";
  }}
/>
            </div>

            <div className="invoice-company-info">
              <h1>{data.settings.companyName}</h1>
              <p>{data.settings.companyAddress}</p>
              <p>{data.settings.companyPhone}</p>
              <p>{data.settings.companyEmail}</p>
              <p>
                <strong>N° TVA :</strong> {data.settings.vatNumber || "-"}
              </p>
            </div>

            <div
              className="invoice-document-head"
              style={{
                width: 255,
                maxWidth: 255,
                overflow: "hidden",
              }}
            >
              <h2>{isQuote ? "DEVIS" : "FACTURE"}</h2>
              <div className="invoice-number-box">
                <span>N° {isQuote ? "DEVIS" : "FACTURE"}</span>
                <strong>{String(doc.number || "").replace(/^(FAC-|DEV-|N°)/, "")}</strong>
              </div>
              <div className="invoice-date-box">
                <span>Date d'émission :</span>
                <strong>{doc.date}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-info-grid">
            <div className="invoice-info-card">
              <div className="invoice-round-icon">👤</div>
              <div>
                <h3>FACTURÉ À</h3>
                <strong>{client?.name || "Client supprimé"}</strong>
                {client?.company && <p>{client.company}</p>}
                {client?.address && <p>{client.address}</p>}
                {client?.email && <p>{client.email}</p>}
                {client?.phone && <p>{client.phone}</p>}
              </div>
            </div>

            <div className="invoice-info-card">
              <div className="invoice-round-icon">📄</div>
              <div>
                <h3>RÉFÉRENCE</h3>
                <strong>{doc.convertedFrom || doc.number}</strong>
                <p><strong>Statut :</strong> {doc.status}</p>
                {!isQuote && doc.dueDate && <p><strong>Échéance :</strong> {doc.dueDate}</p>}
              </div>
            </div>
          </div>

          <table className="invoice-modern-table">
            <thead>
              <tr>
                <th>DÉSIGNATION</th>
                <th>PRIX UNITAIRE HT</th>
                <th>QUANTITÉ</th>
                <th>REMISE</th>
                <th>MONTANT TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.description}</td>
                  <td>{money(line.price)}</td>
                  <td>{Number(line.quantity || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td>{line.discount || 0}%</td>
                  <td>{money(line.totalHT || line.subtotal)}</td>
                </tr>
              ))}

              {lines.length < 2 && (
                <tr className="invoice-empty-line">
                  <td>&nbsp;</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="invoice-bottom-modern">
            <div className="invoice-payment-modern">
              <div className="invoice-section-heading">
                <span>💳</span>
                <strong>CONDITIONS DE PAIEMENT</strong>
              </div>
              <p>
                <strong>Échéance de paiement :</strong> {data.settings.paymentTerms}
              </p>
              <pre>{data.settings.bankInfo}</pre>
            </div>

            <div className="invoice-total-modern">
              <div>
                <span>Sous-total HT</span>
                <strong>{money(doc.subtotal || doc.totalHT)}</strong>
              </div>
              <div>
                <span>Remise lignes</span>
                <strong>{money(doc.lineDiscountAmount || 0)}</strong>
              </div>
              <div>
                <span>Remise globale {doc.globalDiscount ? `(${doc.globalDiscount}%)` : ""}</span>
                <strong>{money(doc.globalDiscountAmount || 0)}</strong>
              </div>
              <div>
                <span>Total HT</span>
                <strong>{money(doc.totalHT)}</strong>
              </div>
              <div>
                <span>TVA à {doc.taxRate}%</span>
                <strong>{money(doc.taxAmount)}</strong>
              </div>
              <div>
                <span>Total TTC</span>
                <strong>{money(doc.totalTTC)}</strong>
              </div>
              <div className="invoice-final-due">
                <span>À PAYER</span>
                <strong>{money(amountDue)}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-legal-note">
            <strong>Mentions</strong>
            <p>Document généré électroniquement. Aucun escompte accordé sauf indication contraire. En cas de retard de paiement, des pénalités peuvent être appliquées selon les conditions convenues.</p>
          </div>

          <div className="invoice-thank-you">
            <div className="invoice-round-icon">i</div>
            <div>
              <strong>Merci pour votre confiance.</strong>
              <p>Pour toute question, n'hésitez pas à nous contacter.</p>
            </div>
            <div className="invoice-signature">Merci !</div>
          </div>

          <div className="invoice-modern-footer">
            <strong>{data.settings.companyName} — Personnalisation</strong>
            <span>
              {data.settings.companyAddress} — {data.settings.companyPhone} — {data.settings.companyEmail}
            </span>
            <span>N° TVA : {data.settings.vatNumber || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Categories({ data, setData, currentRole = 'Admin', logActivity }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState(null);

  const categories = data.categories || [];

  function reset() {
    setEditing(null);
    setForm({ name: "", description: "" });
  }

  function submit(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return alert("Nom de catégorie obligatoire.");

    const alreadyExists = categories.some(
      (category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== editing
    );

    if (alreadyExists) return alert("Cette catégorie existe déjà.");

    if (editing) {
      const oldCategory = categories.find((category) => category.id === editing);
      setData({
        ...data,
        categories: categories.map((category) =>
          category.id === editing ? { ...category, name, description: form.description } : category
        ),
        products: (data.products || []).map((product) =>
          product.category === oldCategory?.name ? { ...product, category: name } : product
        ),
      });
      logActivity?.("Modification catégorie", name, oldCategory?.name || "");
    } else {
      const category = { id: uid(), createdAt: today(), name, description: form.description };
      setData({
        ...data,
        categories: [...categories, category],
      });
      logActivity?.("Création catégorie", category.name);
    }

    reset();
  }

  function edit(category) {
    setEditing(category.id);
    setForm({ name: category.name || "", description: category.description || "" });
  }

  function remove(category) {
    const used = (data.products || []).some((product) => product.category === category.name);

    if (used) {
      const clearProducts = confirm(
        "Cette catégorie est utilisée par des produits. Supprimer la catégorie et retirer cette catégorie des produits ?"
      );
      if (!clearProducts) return;
    } else if (!confirm("Supprimer cette catégorie ?")) {
      return;
    }

    setData({
      ...data,
      categories: categories.filter((c) => c.id !== category.id),
      products: (data.products || []).map((product) =>
        product.category === category.name ? { ...product, category: "" } : product
      ),
    });
    logActivity?.("Suppression catégorie", category.name);
  }

  function productCount(categoryName) {
    return (data.products || []).filter((product) => product.category === categoryName).length;
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Catégories</h2>
          <p>Organise tes produits par famille : sublimation, textile, accessoires, services...</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input
          placeholder="Nom de catégorie *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="primary">{editing ? "Modifier" : "Ajouter catégorie"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="table card">
        <table>
          <thead>
            <tr><th>Catégorie</th><th>Description</th><th>Produits liés</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan="4" className="muted">Aucune catégorie pour le moment.</td></tr>
            )}
            {categories.map((category) => (
              <tr key={category.id}>
                <td><strong>{category.name}</strong></td>
                <td>{category.description}</td>
                <td>{productCount(category.name)}</td>
                <td>
                  <button onClick={() => edit(category)}>Modifier</button>
                  <button className="danger" onClick={() => remove(category)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


class Product3DErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="product-3d-fallback">
          <strong>Modèle 3D non lisible</strong>
          <span>Réimporte un fichier .glb ou .gltf valide.</span>
        </div>
      );
    }

    return this.props.children;
  }
}

function Product3DModel({ modelUrl }) {
  const { scene } = useGLTF(modelUrl);

  return (
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <primitive
            object={scene}
            scale={1.25}
            rotation={[0, 0, 0]}
          />
        </group>
      </Center>
    </Bounds>
  );
}


function MugDesignPatch({ imageUrl, size = 1, posX = 0, posY = 0 }) {
  const [texture, setTexture] = React.useState(null);

  React.useEffect(() => {
    if (!imageUrl) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    let active = true;

    loader.load(
      imageUrl,
      (loadedTexture) => {
        if (!active) return;

        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = 16;
        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
        loadedTexture.needsUpdate = true;
        setTexture(loadedTexture);
      },
      undefined,
      () => {
        if (active) setTexture(null);
      }
    );

    return () => {
      active = false;
    };
  }, [imageUrl]);

  React.useEffect(() => {
    if (!texture) return;

    const safeSize = Math.max(0.35, Math.min(2.8, Number(size || 1)));

    // Zone impression 21 x 9 cm : on garde l'image dans la zone incurvée
    // au lieu d'agrandir le cylindre devant la caméra.
    const repeatX = 0.52 / safeSize;
    const repeatY = 1 / safeSize;

    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(
      0.24 + Number(posX || 0) * 0.22,
      0.5 - repeatY / 2 + Number(posY || 0) * 0.12
    );
    texture.needsUpdate = true;
  }, [texture, size, posX, posY]);

  if (!texture) return null;

  return (
    <mesh
      renderOrder={20}
      rotation={[0, Math.PI / 2, 0]}
      position={[0, Number(posY || 0) * 0.08, 0]}
    >
      {/*
        Zone d'impression mug 21 x 9 cm.
        Rayon très proche du mug + arc limité pour éviter l'effet tunnel géant.
      */}
      <cylinderGeometry
        args={[
          1.005,
          1.005,
          2.05,
          96,
          1,
          true,
          -Math.PI * 0.28,
          Math.PI * 0.56,
        ]}
      />

      <meshStandardMaterial
        map={texture}
        transparent
        side={THREE.FrontSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
      />
    </mesh>
  );
}

function MugCustomizerPreview({ designImage, designSize = 1, designX = 0, designY = 0 }) {
  return (
    <div className="mug-customizer-preview">
      <div className="mug-mockup">
        <div className="mug-body">
          <div className="mug-shine" />
          {designImage ? (
            <img
              className="mug-print-image"
              src={designImage}
              alt="Visuel personnalisé"
              style={{
                width: `${180 * Number(designSize || 1)}px`,
                transform: `translate(calc(-50% + ${Number(designX || 0) * 110}px), calc(-50% + ${Number(designY || 0) * -110}px))`,
              }}
            />
          ) : (
            <div className="mug-empty-zone">Ajoutez une image</div>
          )}
        </div>
        <div className="mug-handle" />
      </div>
      <p className="mug-preview-note">Aperçu de la zone d’impression du mug</p>
    </div>
  );
}


function Product3DViewer({ modelUrl, designImage, designSize = 1, designX = 0, designY = 0, fallbackLetter = "P" }) {
  if (!modelUrl) {
    return (
      <div className="product-3d-placeholder">
        <span>{fallbackLetter}</span>
      </div>
    );
  }

  return (
    <Product3DErrorBoundary resetKey={modelUrl}>
      <div className="product-3d-viewer">
        <Canvas
          camera={{ position: [0, 0.12, 4.2], fov: 26 }}
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={1.4} />
          <directionalLight position={[4, 6, 5]} intensity={2.4} />
          <directionalLight position={[-4, 2, -3]} intensity={0.8} />
          <Suspense fallback={null}>
            <Product3DModel modelUrl={modelUrl} />
            <MugDesignPatch
              imageUrl={designImage}
              size={Number(designSize || 1)}
              posX={Number(designX || 0)}
              posY={Number(designY || 0)}
            />
            <Environment preset="city" />
          </Suspense>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={0.35}
            maxDistance={5}
          />
        </Canvas>
        <div className="product-3d-hint">↔ tourner · molette zoom</div>
      </div>
    </Product3DErrorBoundary>
  );
}


function Products({ data, setData, currentRole = 'Admin', logActivity }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name-asc");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkStock, setBulkStock] = useState(100);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    price: "",
    stock: "",
    imageUrl: "",
    model3dUrl: "",
    description: "",
  });

  function compressProductImage(file, maxWidth = 900, quality = 0.78) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Choisis une image valide."));
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();

        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };

        img.onerror = () => reject(new Error("Image impossible à lire."));
        img.src = event.target.result;
      };

      reader.onerror = () => reject(new Error("Image impossible à importer."));
      reader.readAsDataURL(file);
    });
  }

  async function handleProductImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageUrl = await compressProductImage(file);
      setForm((current) => ({ ...current, imageUrl }));
    } catch (error) {
      alert(error.message || "Erreur pendant l'import de l'image.");
    } finally {
      event.target.value = "";
    }
  }

  function removeProductImage() {
    setForm((current) => ({ ...current, imageUrl: "" }));
  }


  function handleProduct3DUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = String(file.name || "").toLowerCase();
    const is3DFile =
      fileName.endsWith(".glb") ||
      fileName.endsWith(".gltf") ||
      file.type === "model/gltf-binary" ||
      file.type === "model/gltf+json";

    if (!is3DFile) {
      alert("Choisis un vrai fichier 3D au format .glb ou .gltf.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      setForm((current) => ({
        ...current,
        model3dUrl: readerEvent.target.result,
      }));
    };

    reader.onerror = () => {
      alert("Impossible de lire le modèle 3D.");
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function removeProduct3D() {
    setForm((current) => ({ ...current, model3dUrl: "" }));
  }



  const categories = data.categories || [];
  const allProducts = (data.products || []).map((product) => ({
    ...product,
    stock:
      Number(product.stock || 0) > 0
        ? Number(product.stock || 0)
        : 100,
  }));

  function getCategoryName(categoryName) {
    return String(categoryName || "").trim();
  }

  function categoryExists(categoryName) {
    const selectedCategory = getCategoryName(categoryName);
    return categories.some((category) => getCategoryName(category.name).toLowerCase() === selectedCategory.toLowerCase());
  }

  function getSkuPrefix(categoryName) {
    const cleanCategory = getCategoryName(categoryName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

    return cleanCategory.slice(0, 3).padEnd(3, "X");
  }

  function isAutoSku(sku, categoryName = form.category) {
    if (!sku || !categoryExists(categoryName)) return false;
    const prefix = getSkuPrefix(categoryName);
    return new RegExp(`^${prefix}-\\d{4}$`).test(String(sku).trim().toUpperCase());
  }

  function generateSkuForCategory(categoryName, excludedProductId = editing) {
    if (!categoryExists(categoryName)) return "";

    const prefix = getSkuPrefix(categoryName);
    const skuPattern = new RegExp(`^${prefix}-(\\d{4})$`);
    const existingSkus = new Set();
    let highestNumber = 0;

    allProducts.forEach((product) => {
      if (excludedProductId && product.id === excludedProductId) return;
      const productSku = String(product.sku || "").trim().toUpperCase();
      existingSkus.add(productSku);

      const productCategory = getCategoryName(product.category).toLowerCase();
      const selectedCategory = getCategoryName(categoryName).toLowerCase();
      const match = productSku.match(skuPattern);

      if (productCategory === selectedCategory && match) {
        highestNumber = Math.max(highestNumber, Number(match[1] || 0));
      }
    });

    let nextNumber = highestNumber + 1;
    let nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

    while (existingSkus.has(nextSku)) {
      nextNumber += 1;
      nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
    }

    return nextSku;
  }

  function handleCategoryChange(categoryName) {
    setForm((current) => {
      const shouldGenerateSku = !current.sku || isAutoSku(current.sku, current.category);
      return {
        ...current,
        category: categoryName,
        sku: shouldGenerateSku ? generateSkuForCategory(categoryName) : current.sku,
      };
    });
  }

  function handleGenerateSku() {
    if (!form.category) return alert("Choisis d'abord une catégorie.");
    if (!categoryExists(form.category)) return alert("La catégorie doit venir de l'onglet Catégories.");

    const nextSku = generateSkuForCategory(form.category);
    if (!nextSku) return alert("Impossible de générer le SKU.");

    setForm((current) => ({ ...current, sku: nextSku }));
  }

  function regenerateAllProductSkus() {
    const validProducts = allProducts.filter((product) => categoryExists(product.category));

    if (!validProducts.length) {
      return alert("Aucun produit avec une catégorie valide trouvée.");
    }

    const skippedProducts = allProducts.length - validProducts.length;
    const confirmMessage = skippedProducts > 0
      ? `Cette action va remplacer les SKU de ${validProducts.length} produit(s). ${skippedProducts} produit(s) sans catégorie valide seront ignorés. Continuer ?`
      : `Cette action va remplacer les SKU de ${validProducts.length} produit(s). Continuer ?`;

    if (!confirm(confirmMessage)) return;

    const countersByPrefix = {};
    const usedSkus = new Set();

    const updatedProducts = allProducts.map((product) => {
      if (!categoryExists(product.category)) return product;

      const prefix = getSkuPrefix(product.category);
      let nextNumber = (countersByPrefix[prefix] || 0) + 1;
      let nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

      while (usedSkus.has(nextSku)) {
        nextNumber += 1;
        nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
      }

      countersByPrefix[prefix] = nextNumber;
      usedSkus.add(nextSku);

      return {
        ...product,
        sku: nextSku,
      };
    });

    setData({
      ...data,
      products: updatedProducts,
    });

    setSelectedProductIds([]);
    alert("Tous les SKU ont été régénérés par catégorie.");
  }

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minPrice = priceMin === "" ? null : Number(priceMin);
    const maxPrice = priceMax === "" ? null : Number(priceMax);

    const filtered = allProducts.filter((product) => {
      const stock = Number(product.stock || 0);
      const minStock = Number(product.stockMin || product.minStock || 0);
      const price = Number(product.price || 0);
      const margin = price - Number(product.purchasePrice || 0);

      const matchesSearch =
        !query ||
        [
          product.name,
          product.sku,
          product.category,
          product.description,
          product.supplier,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesCategory =
        !categoryFilter || product.category === categoryFilter;

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && stock > 0 && (!minStock || stock > minStock)) ||
        (stockFilter === "low" && stock > 0 && minStock > 0 && stock <= minStock) ||
        (stockFilter === "out" && stock <= 0);

      const matchesPriceMin = minPrice === null || price >= minPrice;
      const matchesPriceMax = maxPrice === null || price <= maxPrice;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStock &&
        matchesPriceMin &&
        matchesPriceMax
      );
    });

    return filtered.sort((a, b) => {
      const priceA = Number(a.price || 0);
      const priceB = Number(b.price || 0);
      const stockA = Number(a.stock || 0);
      const stockB = Number(b.stock || 0);
      const marginA = priceA - Number(a.purchasePrice || 0);
      const marginB = priceB - Number(b.purchasePrice || 0);
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();

      switch (sortBy) {
        case "name-desc":
          return String(b.name || "").localeCompare(String(a.name || ""));
        case "price-asc":
          return priceA - priceB;
        case "price-desc":
          return priceB - priceA;
        case "stock-asc":
          return stockA - stockB;
        case "stock-desc":
          return stockB - stockA;
        case "margin-desc":
          return marginB - marginA;
        case "recent":
          return dateB - dateA;
        default:
          return String(a.name || "").localeCompare(String(b.name || ""));
      }
    });
  }, [allProducts, search, categoryFilter, stockFilter, priceMin, priceMax, sortBy]);

  const productsStats = useMemo(() => {
    const total = allProducts.length;
    const available = allProducts.filter((p) => Number(p.stock || 0) > 0).length;
    const low = allProducts.filter((p) => {
      const stock = Number(p.stock || 0);
      const minStock = Number(p.stockMin || p.minStock || 0);
      return stock > 0 && minStock > 0 && stock <= minStock;
    }).length;
    const out = allProducts.filter((p) => Number(p.stock || 0) <= 0).length;

    return { total, available, low, out };
  }, [allProducts]);

  function resetProductFilters() {
    setSearch("");
    setCategoryFilter("");
    setStockFilter("all");
    setSortBy("name-asc");
    setPriceMin("");
    setPriceMax("");
    setCurrentPage(1);
  }

  const visibleProducts = products;

  function reset() {
    setEditing(null);
    setForm({ name: "", sku: "", category: "", price: "", stock: "", imageUrl: "", model3dUrl: "", description: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Nom du produit obligatoire.");

    const finalSku = String(form.sku || generateSkuForCategory(form.category) || "").trim();

    const productData = {
      ...form,
      sku: finalSku,
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
    };

    if (editing) {
      setData({
        ...data,
        products: (data.products || []).map((p) =>
          p.id === editing ? { ...p, ...productData } : p
        ),
      });
      logActivity?.("Modification produit", productData.name, productData.sku);
    } else {
      const product = { id: uid(), createdAt: today(), ...productData };
      setData({
        ...data,
        products: [...allProducts, product],
      });
      logActivity?.("Création produit", product.name, product.sku);
    }

    reset();
  }

  function edit(product) {
    setEditing(product.id);
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      price: product.price || "",
      stock: product.stock || "",
      imageUrl: product.imageUrl || "",
      model3dUrl: product.model3dUrl || "",
      description: product.description || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) return alert("Ton rôle ne permet pas de supprimer.");
    if (!confirm("Supprimer ce produit ?")) return;
    const removedProduct = allProducts.find((p) => p.id === id);
    setData({ ...data, products: allProducts.filter((p) => p.id !== id) });
    logActivity?.("Suppression produit", removedProduct?.name || id, removedProduct?.sku || "");
    setSelectedProductIds(selectedProductIds.filter((productId) => productId !== id));
  }

  function toggleProductSelection(id) {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id]
    );
  }

  function toggleVisibleProducts() {
    const visibleIds = visibleProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));

    if (allVisibleSelected) {
      setSelectedProductIds(selectedProductIds.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedProductIds([...new Set([...selectedProductIds, ...visibleIds])]);
    }
  }

  function applyBulkCategory() {
    if (!selectedProductIds.length) return alert("Sélectionne au moins un produit.");
    if (!bulkCategory) return alert("Choisis une catégorie.");

    setData({
      ...data,
      products: allProducts.map((product) =>
        selectedProductIds.includes(product.id)
          ? { ...product, category: bulkCategory }
          : product
      ),
    });

    logActivity?.("Modification catégorie produits", bulkCategory, `${selectedProductIds.length} produit(s)`);
    setSelectedProductIds([]);
    setBulkCategory("");
    alert("Catégorie appliquée aux produits sélectionnés.");
  }

  function applyBulkStock() {
    if (!selectedProductIds.length) return alert("Sélectionne au moins un produit.");

    setData({
      ...data,
      products: allProducts.map((product) =>
        selectedProductIds.includes(product.id)
          ? { ...product, stock: Number(bulkStock || 0) }
          : product
      ),
    });

    logActivity?.("Modification stock produits", `${Number(bulkStock || 0)} pièce(s)`, `${selectedProductIds.length} produit(s)`);
    setSelectedProductIds([]);
    alert("Stock modifié avec succès.");
  }

  function setAllProductsStock100() {
    if (!confirm("Mettre tous les produits à 100 pièces ?")) return;

    setData({
      ...data,
      products: allProducts.map((product) => ({
        ...product,
        stock: 100,
      })),
    });

    logActivity?.("Réinitialisation stock produits", "100 pièces", `${allProducts.length} produit(s)`);
    setSelectedProductIds([]);
    alert("Tous les produits sont maintenant à 100 pièces.");
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Produits</h2>
          <p>Gère tes produits, prix, références et stocks.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom produit *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="product-sku-field">
          <input
            placeholder="Référence SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
          />
          <button type="button" onClick={handleGenerateSku}>
            Générer SKU
          </button>
          <span>Auto selon la catégorie choisie.</span>
        </div>
        <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
          <option value="">Sans catégorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Prix HT"
          value={String(form.price).replace(".", ",")}
          onChange={(e) => setForm({ ...form, price: e.target.value.replace(",", ".") })}
        />
        <input type="number" min="0" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <div className="product-image-field">
          <label className="image-upload-button">
            📷 Importer une image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleProductImageUpload}
            />
          </label>

          {form.imageUrl && (
            <div className="product-image-preview">
              <img src={form.imageUrl} alt="Aperçu produit" />
              <button type="button" onClick={removeProductImage}>
                Retirer
              </button>
            </div>
          )}

          <label className="image-upload-button product-3d-upload-button">
            🧊 Importer modèle 3D
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              onChange={handleProduct3DUpload}
            />
          </label>

          

          <label className="image-upload-button">
            🎨 Ajouter design mug
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                setForm({ ...form, designImage: url, designSize: form.designSize || 1, designX: form.designX || 0, designY: form.designY || 0 });
              }}
            />
          </label>


          {form.designImage && (
            <div className="mug-design-controls">
              <label>
                <span>Taille du visuel</span>
                <input
                  type="range"
                  min="0.4"
                  max="2"
                  step="0.05"
                  value={form.designSize || 1}
                  onChange={(e) => setForm({ ...form, designSize: e.target.value })}
                />
              </label>

              <label>
                <span>Position horizontale</span>
                <input
                  type="range"
                  min="-0.8"
                  max="0.8"
                  step="0.02"
                  value={form.designX || 0}
                  onChange={(e) => setForm({ ...form, designX: e.target.value })}
                />
              </label>

              <label>
                <span>Position verticale</span>
                <input
                  type="range"
                  min="-0.8"
                  max="0.8"
                  step="0.02"
                  value={form.designY || 0}
                  onChange={(e) => setForm({ ...form, designY: e.target.value })}
                />
              </label>
            </div>
          )}

          {form.model3dUrl && (
            <div className="product-image-preview product-model-preview">
              <Product3DViewer modelUrl={form.model3dUrl} designImage={form.designImage} designSize={Number(form.designSize || 1)} designX={Number(form.designX || 0)} designY={Number(form.designY || 0)} fallbackLetter={(form.name || "P").slice(0, 1).toUpperCase()} />
              <button type="button" onClick={removeProduct3D}>
                Retirer le modèle 3D
              </button>
            </div>
          )}
        </div>
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="primary">{editing ? "Modifier" : "Ajouter produit"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="product-search-panel filters-card card">
        <div className="filters-premium-header">
          <div className="filters-title-row">
            <span className="filters-icon">⌕</span>
            <div>
              <strong>Recherche & filtres produits</strong>
              <span>{products.length} résultat(s) sur {productsStats.total} produit(s)</span>
            </div>
          </div>
        </div>

        <div className="filters-main-row products-filters-two-rows">
          <div className="filters-search-wrap">
            <span>⌕</span>
            <input
              className="search filters-search-input"
              placeholder="Recherche ultra rapide : nom, SKU, catégorie..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="filters-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>

          <select
            className="filters-select"
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Tous les stocks</option>
            <option value="available">Disponibles</option>
            <option value="low">Stock faible</option>
            <option value="out">Rupture</option>
          </select>

          <select
            className="filters-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="name-asc">Nom A → Z</option>
            <option value="name-desc">Nom Z → A</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
            <option value="stock-asc">Stock croissant</option>
            <option value="stock-desc">Stock décroissant</option>
            <option value="margin-desc">Meilleure marge</option>
            <option value="recent">Plus récents</option>
          </select>

          <div className="filters-price-wrap">
            <input
              type="number"
              min="0"
              placeholder="Prix min"
              value={priceMin}
              onChange={(e) => {
                setPriceMin(e.target.value);
                setCurrentPage(1);
              }}
            />
            <span>→</span>
            <input
              type="number"
              min="0"
              placeholder="Prix max"
              value={priceMax}
              onChange={(e) => {
                setPriceMax(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <div className="filters-bottom-row">
          <button type="button" className="filters-reset-button" onClick={resetProductFilters}>
            ↺ Réinitialiser
          </button>
        </div>
      </div>

      <div className="products-premium-panel card">
        <div className="bulk-actions products-bulk-premium">
          <strong>{selectedProductIds.length} produit(s) sélectionné(s)</strong>

          <select value={bulkStock} onChange={(e) => setBulkStock(e.target.value)}>
            <option value="100">100 pièces</option>
            <option value="200">200 pièces</option>
            <option value="500">500 pièces</option>
          </select>

          <button type="button" className="primary" onClick={applyBulkStock}>
            Modifier le stock
          </button>

          <button type="button" className="primary" onClick={setAllProductsStock100}>
            Tous les produits = 100 pièces
          </button>

          <button type="button" className="primary" onClick={regenerateAllProductSkus}>
            Regénérer tous les SKU
          </button>

          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>

          <button type="button" className="primary" onClick={applyBulkCategory}>
            Appliquer la catégorie
          </button>

          {selectedProductIds.length > 0 && (
            <button type="button" onClick={() => setSelectedProductIds([])}>
              Désélectionner
            </button>
          )}
        </div>

        <div className="select-visible-row">
          <button type="button" onClick={toggleVisibleProducts}>
            Sélectionner / désélectionner les produits affichés
          </button>
        </div>

        {products.length === 0 && (
          <div className="product-empty-state">
            <strong>Aucun produit trouvé</strong>
            <span>Essaie de modifier la recherche ou les filtres.</span>
          </div>
        )}

        <div className="product-premium-grid">
          {visibleProducts.map((product) => {
            const stock = Number(product.stock || 0);
            const minStock = Number(product.stockMin || product.minStock || 0);
            const stockLevel = Math.min(100, Math.max(0, stock));
            const stockClass =
              stock <= 0
                ? "danger"
                : minStock > 0 && stock <= minStock
                  ? "warning"
                  : "success";

            return (
              <article
                className={`product-premium-card ${selectedProductIds.includes(product.id) ? "selected" : ""}`}
                key={product.id}
              >
                <div className="product-premium-top">
                  <label className="product-select-pill">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleProductSelection(product.id)}
                    />
                    <span>Sélection</span>
                  </label>
                </div>

                <div className="product-visual">
                  {product.model3dUrl ? (
                    <Product3DViewer modelUrl={product.model3dUrl} designImage={product.designImage} designSize={Number(product.designSize || 1)} designX={Number(product.designX || 0)} designY={Number(product.designY || 0)} fallbackLetter={(product.name || "P").slice(0, 1).toUpperCase()} />
                  ) : product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name || "Produit"} />
                  ) : (
                    <span>{(product.name || "P").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div className="product-premium-body">
                  <h3>{product.name}</h3>

                  <div className="product-tags-row">
                    <span>SKU : {product.sku || "Sans SKU"}</span>
                    <span>Prix HT : {money(product.price)}</span>
                  </div>

                  {product.description && (
                    <p className="product-description">{product.description}</p>
                  )}
                </div>

                <div className="product-actions">
                  <button onClick={() => edit(product)}>Modifier</button>
                  <button className="danger" onClick={() => remove(product.id)}>Supprimer</button>
                </div>
              </article>
            );
          })}
        </div>

      </div>
    </section>
  );
}


const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

function getCode128Values(value) {
  const text = String(value || "").trim() || "SANS-SKU";
  const safeText = text.replace(/[^\x20-\x7E]/g, "");
  const values = [104];

  for (const char of safeText) {
    values.push(char.charCodeAt(0) - 32);
  }

  let checksum = 104;
  for (let index = 1; index < values.length; index += 1) {
    checksum += values[index] * index;
  }

  values.push(checksum % 103, 106);
  return values;
}

function BarcodeSvg({ value, height = 58 }) {
  const values = getCode128Values(value);
  const quiet = 10;
  let x = quiet;
  const bars = [];

  values.forEach((code, groupIndex) => {
    const pattern = CODE128_PATTERNS[code];
    let drawBar = true;

    pattern.split("").forEach((widthChar, partIndex) => {
      const width = Number(widthChar);
      if (drawBar) {
        bars.push({ x, width, key: `${groupIndex}-${partIndex}` });
      }
      x += width;
      drawBar = !drawBar;
    });
  });

  const width = x + quiet;

  return (
    <svg className="barcode-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Code-barres ${value || "sans SKU"}`}>
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {bars.map((bar) => (
        <rect key={bar.key} x={bar.x} y="4" width={bar.width} height={height - 14} fill="#111827" />
      ))}
    </svg>
  );
}

function BarcodeLabels({ data }) {
  const allProducts = data.products || [];
  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const showPrice = false;
  const [showQr, setShowQr] = useState(true);
  const [copies, setCopies] = useState(1);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allProducts;
    return allProducts.filter((product) =>
      [product.name, product.sku, product.category]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [allProducts, search]);

  const selectedProducts = selectedProductIds
    .map((id) => allProducts.find((product) => product.id === id))
    .filter(Boolean);

  const labelsToPrint = selectedProducts.flatMap((product) =>
    Array.from({ length: Math.max(1, Number(copies) || 1) }, () => product)
  );

  function toggleProduct(productId) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  function selectVisibleProducts() {
    const visibleIds = filteredProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds]))
    );
  }

  return (
    <section className="labels-page">
      <div className="page-header no-print">
        <div>
          <h2>Étiquettes & codes-barres</h2>
          <p>Génère des étiquettes produits imprimables à partir des SKU.</p>
        </div>
        <button className="primary" onClick={() => window.print()} disabled={!labelsToPrint.length}>
          Imprimer les étiquettes
        </button>
      </div>

      <div className="card labels-controls no-print">
        <input
          placeholder="Rechercher un produit, SKU ou catégorie..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          type="number"
          min="1"
          max="100"
          value={copies}
          onChange={(event) => setCopies(event.target.value)}
          title="Nombre d'étiquettes par produit"
        />
        <label className="labels-checkbox">
          <input type="checkbox" checked={showQr} onChange={(event) => setShowQr(event.target.checked)} />
          Afficher QR code
        </label>
        <button type="button" onClick={selectVisibleProducts}>Sélectionner / désélectionner les produits visibles</button>
        <button type="button" onClick={() => setSelectedProductIds([])}>Vider la sélection</button>
      </div>

      <div className="labels-layout no-print">
        <div className="card labels-product-list">
          <h3>Produits</h3>
          {filteredProducts.length === 0 && <p className="muted">Aucun produit trouvé.</p>}
          {filteredProducts.map((product) => (
            <label className="label-product-row" key={product.id}>
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={() => toggleProduct(product.id)}
              />
              <span>
                <strong>{product.name || "Produit sans nom"}</strong>
                <small>{product.sku || "Sans SKU"} {product.category ? `• ${product.category}` : ""}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="card labels-preview-card">
          <h3>Aperçu impression</h3>
          <p className="muted">{labelsToPrint.length} étiquette(s) prête(s) à imprimer.</p>
          <div className="labels-sheet labels-sheet-preview">
            {labelsToPrint.map((product, index) => (
              <ProductLabel key={`${product.id}-${index}`} product={product} showPrice={showPrice} showQr={showQr} />
            ))}
          </div>
        </div>
      </div>

      <div className="labels-print-area">
        <div className="labels-sheet">
          {labelsToPrint.map((product, index) => (
            <ProductLabel key={`${product.id}-print-${index}`} product={product} showPrice={showPrice} showQr={showQr} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductLabel({ product, showPrice, showQr = false }) {
  const codeValue = product.sku || product.name || product.id;
  return (
    <div className="product-label">
      <strong>{product.name || "Produit"}</strong>
      <div className="product-label-code-row">
        <BarcodeSvg value={codeValue} />
        {showQr && <QrCodeImage value={codeValue} className="product-label-qr" />}
      </div>
      <div className="product-label-footer">
        <span>{product.sku || "Sans SKU"}</span>
      </div>
    </div>
  );
}

function QrCodeImage({ value, className = "qr-code-img" }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc("");
      return;
    }

    QRCode.toDataURL(String(value), {
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) return <span className={className} />;
  return <img className={className} src={src} alt={`QR code ${value}`} />;
}

function ProductScan({ data, setData, logActivity }) {
  const products = data.products || [];
  const [scanValue, setScanValue] = useState("");
  const [mode, setMode] = useState("out");
  const [quantity, setQuantity] = useState(1);
  const [foundProduct, setFoundProduct] = useState(null);
  const [message, setMessage] = useState("Scanne un code-barres, un QR code ou saisis un SKU.");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const scannerRef = useRef(null);
  const containerId = "crm-html5-qrcode-scanner";

  function findProduct(rawValue) {
    const query = String(rawValue || "").trim().toLowerCase();
    if (!query) return null;
    return products.find((product) =>
      [product.sku, product.id, product.name]
        .filter(Boolean)
        .some((value) => String(value).trim().toLowerCase() === query)
    ) || products.find((product) =>
      [product.sku, product.name, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) || null;
  }

  function applyStock(product, actionMode = mode, amount = quantity) {
    if (!product) return;
    const qty = Math.max(1, Number(amount) || 1);
    const currentStock = Number(product.stock || 0);
    const nextStock = actionMode === "in" ? currentStock + qty : Math.max(0, currentStock - qty);

    setData({
      ...data,
      products: products.map((item) =>
        item.id === product.id
          ? { ...item, stock: nextStock, updatedAt: today() }
          : item
      ),
    });

    setFoundProduct({ ...product, stock: nextStock });
    setMessage(`${actionMode === "in" ? "Entrée" : "Sortie"} stock : ${qty} pièce(s) — ${product.name} (${nextStock} en stock).`);
    logActivity?.(actionMode === "in" ? "Entrée stock" : "Sortie stock", product.name, `${qty} pièce(s), stock final ${nextStock}`);
  }

  function handleScan(rawValue, autoApply = false) {
    const product = findProduct(rawValue);
    setScanValue(String(rawValue || ""));
    if (!product) {
      setFoundProduct(null);
      setMessage("Produit introuvable. Vérifie le SKU, le code-barres ou le QR code.");
      return;
    }

    setFoundProduct(product);
    setMessage(`Produit trouvé : ${product.name} — ${product.sku || "Sans SKU"}`);
    if (autoApply) applyStock(product);
  }

  function handleSubmit(event) {
    event.preventDefault();
    handleScan(scanValue, false);
  }

  useEffect(() => {
    if (!cameraEnabled) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    const scanner = new Html5QrcodeScanner(
      containerId,
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false
    );

    scanner.render(
      (decodedText) => {
        handleScan(decodedText, true);
      },
      () => {}
    );

    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled]);

  return (
    <section className="scan-page">
      <div className="page-header">
        <div>
          <h2>Scan produit</h2>
          <p>Scanne un SKU, un code-barres ou un QR code pour retrouver un produit et ajuster le stock.</p>
        </div>
        <button className="primary" type="button" onClick={() => setCameraEnabled((value) => !value)}>
          {cameraEnabled ? "Arrêter caméra" : "Activer caméra"}
        </button>
      </div>

      <div className="scan-grid">
        <div className="card scan-card">
          <h3>Scanner / rechercher</h3>
          <form onSubmit={handleSubmit} className="scan-form">
            <input
              autoFocus
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              placeholder="Scanner ici ou saisir le SKU..."
            />
            <button className="primary" type="submit">Rechercher</button>
          </form>

          <div className="scan-options">
            <label>
              Action stock
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="out">Sortie stock</option>
                <option value="in">Entrée stock</option>
              </select>
            </label>
            <label>
              Quantité
              <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
          </div>

          <p className="scan-message">{message}</p>

          {foundProduct && (
            <div className="scan-result-card">
              <div>
                <h3>{foundProduct.name}</h3>
                <p>{foundProduct.sku || "Sans SKU"} {foundProduct.category ? `• ${foundProduct.category}` : ""}</p>
                <strong>Stock actuel : {Number(foundProduct.stock || 0)}</strong>
              </div>
              <div className="scan-product-codes">
                <QrCodeImage value={foundProduct.sku || foundProduct.id} />
                <BarcodeSvg value={foundProduct.sku || foundProduct.id} height={46} />
              </div>
              <div className="scan-actions">
                <button type="button" className="primary" onClick={() => applyStock(foundProduct, "in")}>+ Entrée stock</button>
                <button type="button" className="danger" onClick={() => applyStock(foundProduct, "out")}>- Sortie stock</button>
              </div>
            </div>
          )}
        </div>

        <div className="card camera-card">
          <h3>Caméra / QR code</h3>
          {!cameraEnabled && <p className="muted">Clique sur “Activer caméra” pour scanner avec la webcam ou le téléphone.</p>}
          <div id={containerId} className={cameraEnabled ? "camera-scanner active" : "camera-scanner"}></div>
        </div>
      </div>
    </section>
  );
}

function ExcelImport({ data, setData, logActivity }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function normalize(value) {
    return cleanText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;
    return Number(String(value).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  }

  function excelDate(value) {
    if (!value) return today();

    if (!isNaN(Number(value))) {
      const date = new Date((Number(value) - 25569) * 86400 * 1000);
      return date.toLocaleDateString("fr-FR");
    }

    return cleanText(value);
  }

  function getSheetRows(workbook, possibleNames) {
    const wanted = possibleNames.map(normalize);

    const sheetName = workbook.SheetNames.find((name) =>
      wanted.includes(normalize(name))
    );

    if (!sheetName) return [];

    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
    });
  }

  function findClientIdByName(clientName, importedClients) {
    const allClients = [...(data.clients || []), ...importedClients];

    return (
      allClients.find((client) => normalize(client.name) === normalize(clientName))?.id || ""
    );
  }

  function importClients(workbook) {
    const rows = getSheetRows(workbook, ["Clients", "Client"]);

    return rows
      .slice(8) // ligne Excel 9
      .map((row) => {
        const customerNumber = cleanText(row[1]); // colonne B
        const name = cleanText(row[2]); // colonne C

        return {
          id: uid(),
          createdAt: today(),
          customerNumber,
          name,
          category: cleanText(row[3]), // D
          status: cleanText(row[4]) || "Client", // E
          paymentTerms: cleanText(row[5]), // F
          email: cleanText(row[7]), // H
          phone: cleanText(row[8]), // I
          address: [
            cleanText(row[9]), // J
            cleanText(row[10]), // K
            cleanText(row[11]), // L
            cleanText(row[12]), // M
          ]
            .filter(Boolean)
            .join(", "),
          birthday: cleanText(row[13]), // N
          notes: cleanText(row[14]) || "Import Excel", // O
        };
      })
      .filter((client) => {
        const n = normalize(client.name);
        return (
          client.name &&
          !["nomduclient", "client", "clientsociete", "totalclients"].includes(n) &&
          !n.includes("copyright") &&
          !n.includes("agathetemplates")
        );
      });
  }

  function importProducts(workbook) {
    const rows = getSheetRows(workbook, [
      "Mes produits",
      "Produits",
      "products",
      "Products",
      "Mes products",
    ]);

    return rows
      .slice(6) // ligne Excel 7
      .map((row) => {
        const sku = cleanText(row[1]); // B
        const name = cleanText(row[2]); // C
        const supplier = cleanText(row[3]); // D
        const price = parseNumber(row[4]); // E
        const taxRaw = parseNumber(row[6]); // G
        const notes = cleanText(row[7]); // H

        return {
          id: uid(),
          createdAt: today(),
          sku,
          name,
          supplier,
          price,
          taxRate:
            taxRaw > 0 && taxRaw < 1
              ? taxRaw * 100
              : taxRaw || Number(data.settings?.taxRate || 17),
          description: notes,
          stock: 0,
          categoryId: "",
        };
      })
      .filter((product) => {
        const s = normalize(product.sku);
        const n = normalize(product.name);
        return (
          product.sku &&
          product.name &&
          product.price > 0 &&
          !["reference", "ref"].includes(s) &&
          !["produitservice", "produit", "service"].includes(n) &&
          !n.includes("calculateur") &&
          !n.includes("fournisseur") &&
          !s.includes("agathe")
        );
      });
  }

  function importInvoices(workbook, importedClients) {
    const rows = getSheetRows(workbook, [
      "Toutes les factures",
      "Factures",
      "invoices",
      "Invoices",
      "Mes factures",
    ]);

    return rows
      .slice(9) // ligne Excel 10 : première facture réelle
      .map((row, index) => {
        const rawNumber = cleanText(row[1]); // B
        const clientName = cleanText(row[2]); // C
        const invoiceDate = excelDate(row[3]); // D
        const dueDate = excelDate(row[4]); // E
        const totalHT = parseNumber(row[6]); // G Montant de la facture
        const paidAmount = parseNumber(row[8]); // I
        const remainingAmount = parseNumber(row[10]); // K
        const status = cleanText(row[14]) || (remainingAmount <= 0 ? "Payée" : "Non payée"); // O

        const taxRate = Number(data.settings?.taxRate || 17);
        const taxAmount = totalHT * (taxRate / 100);
        const totalTTC = totalHT + taxAmount;

        return {
          id: uid(),
          number: rawNumber || `FAC-${String(index + 1).padStart(4, "0")}`,
          date: invoiceDate,
          dueDate,
          clientId: findClientIdByName(clientName, importedClients),
          clientName,
          status,
          paidAmount,
          remaining: remainingAmount,
          lines: [
            {
              id: uid(),
              productId: "",
              description: `Facture importée ${rawNumber || ""}`.trim(),
              quantity: 1,
              price: Number(totalHT.toFixed(2)),
              discount: 0,
              totalHT: Number(totalHT.toFixed(2)),
            },
          ],
          subtotal: Number(totalHT.toFixed(2)),
          discountAmount: 0,
          totalHT: Number(totalHT.toFixed(2)),
          taxRate,
          taxAmount: Number(taxAmount.toFixed(2)),
          totalTTC: Number(totalTTC.toFixed(2)),
          importedFromExcel: true,
        };
      })
      .filter((invoice) => {
        const n = normalize(invoice.number);
        const c = normalize(invoice.clientName);
        return (
          invoice.number &&
          invoice.clientName &&
          invoice.totalHT > 0 &&
          !n.includes("numerodefacture") &&
          !n.includes("numero") &&
          !n.includes("facture") &&
          !c.includes("client")
        );
      });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage("Lecture du fichier Excel...");
    setPreview(null);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });

        const importedClients = importClients(workbook);
        const importedProducts = importProducts(workbook);
        const importedInvoices = importInvoices(workbook, importedClients);

        const result = {
          importedClients,
          importedProducts,
          importedInvoices,
        };

        setPreview(result);

        setData({
          ...data,
          clients: [...(data.clients || []), ...importedClients],
          products: [...(data.products || []), ...importedProducts],
          invoices: [...(data.invoices || []), ...importedInvoices],
        });

        setMessage(
          `Import terminé : ${importedClients.length} clients, ${importedProducts.length} produits, ${importedInvoices.length} factures.`
        );
      } catch (err) {
        console.error(err);
        setMessage("Erreur lors de l'import du fichier Excel.");
      }

      setLoading(false);
    };

    reader.readAsBinaryString(file);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Import Excel</h2>
          <p>Importe les clients, produits et factures depuis ton fichier Excel.</p>
        </div>
      </div>

      <div className="card">
        <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleFile} />
        {loading && <p className="muted">Import en cours...</p>}
        {message && <p style={{ marginTop: 20 }}>{message}</p>}
      </div>

      {preview && (
        <div className="stats">
          <div className="card stat">
            <span>Clients importés</span>
            <strong>{preview.importedClients.length}</strong>
          </div>
          <div className="card stat">
            <span>Produits importés</span>
            <strong>{preview.importedProducts.length}</strong>
          </div>
          <div className="card stat">
            <span>Factures importées</span>
            <strong>{preview.importedInvoices.length}</strong>
          </div>
        </div>
      )}
    </section>
  );
}

