export default function Sidebar({
  data,
  currentUser,
  currentRole,
  syncStatus,
  permissions,
  page,
  setPage,
  logout
}) {
  return (
    <aside className="sidebar">
      <h1>{data.settings.companyName}</h1>

      <p className="user">
        Connecté : {currentUser.name}
        <br />
        <span>{currentRole}</span>
      </p>

      <p className="cloud-status">☁️ {syncStatus}</p>

      {permissions.pages.includes("dashboard") && (
        <button onClick={() => setPage("dashboard")}>📊 Tableau de bord</button>
      )}

      {permissions.pages.includes("clients") && (
        <button onClick={() => setPage("clients")}>👥 Clients</button>
      )}

      {permissions.pages.includes("products") && (
        <button onClick={() => setPage("products")}>📦 Produits</button>
      )}

      {permissions.pages.includes("labels") && (
        <button onClick={() => setPage("labels")}>🏷️ Étiquettes</button>
      )}

      {permissions.pages.includes("scan") && (
        <button onClick={() => setPage("scan")}>📷 Scan produit</button>
      )}

      {permissions.pages.includes("categories") && (
        <button onClick={() => setPage("categories")}>🏷️ Catégories</button>
      )}

      {permissions.pages.includes("quotes") && (
        <button onClick={() => setPage("quotes")}>🧾 Devis</button>
      )}

      {permissions.pages.includes("invoices") && (
        <button onClick={() => setPage("invoices")}>💶 Factures</button>
      )}

      {permissions.pages.includes("banque") && (
        <button onClick={() => setPage("banque")}>🏦 Banque</button>
      )}

      {permissions.canManageUsers && (
        <button onClick={() => setPage("users")}>🔐 Utilisateurs</button>
      )}

      {permissions.canEditSettings && (
        <button onClick={() => setPage("settings")}>⚙️ Paramètres</button>
      )}

      {permissions.canImport && (
        <button onClick={() => setPage("import")}>📥 Import Excel</button>
      )}

      {permissions.canManageUsers && (
        <button onClick={() => setPage("backups")}>💾 Sauvegardes</button>
      )}

      {permissions.pages.includes("logs") && (
        <button onClick={() => setPage("logs")}>📜 Journal d’activité</button>
      )}

      {permissions.pages.includes("vue3d") && (
        <button onClick={() => setPage("vue3d")}>👕 Vue 3D</button>
      )}

      {permissions.pages.includes("tshirt3d") && (
        <button onClick={() => setPage("tshirt3d")}>👕 T-shirt 3D</button>
      )}

      <button className="danger" onClick={logout}>
        Déconnexion
      </button>
    </aside>
  );
}