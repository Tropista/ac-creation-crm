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
