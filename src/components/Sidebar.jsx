import { NavLink } from "react-router-dom";
import { pageToPath } from "../utils/routes";

const menuItems = [
  { page: "dashboard", label: "Tableau de bord", icon: "📊", type: "page" },
  { page: "clients", label: "Clients", icon: "👥", type: "page" },
  { page: "products", label: "Produits", icon: "📦", type: "page" },
  { page: "suppliers", label: "Fournisseurs", icon: "🏭", type: "page" },
  { page: "expenses", label: "Dépenses", icon: "🧾", type: "page" },
  { page: "labels", label: "Étiquettes", icon: "🏷️", type: "page" },
  { page: "scan", label: "Scan produit", icon: "📷", type: "page" },
  { page: "categories", label: "Catégories", icon: "🗂️", type: "page" },
  { page: "quotes", label: "Devis", icon: "🧾", type: "page" },
  { page: "invoices", label: "Factures", icon: "💶", type: "page" },
  { page: "print3dcalc", label: "Calculateur 3D", icon: "🧮", type: "page" },
  { page: "lasercalc", label: "Calculateur Laser", icon: "🔥", type: "page" },
  { page: "dtfcalc", label: "Calculateur DTF", icon: "👕", type: "page" },
  { page: "uvdtfcalc", label: "Calculateur UV-DTF", icon: "📱", type: "page" },
  { page: "banque", label: "Banque", icon: "🏦", type: "page" },
  { page: "users", label: "Utilisateurs", icon: "🔐", permission: "canManageUsers" },
  { page: "settings", label: "Paramètres", icon: "⚙️", permission: "canEditSettings" },
  { page: "import", label: "Import Excel", icon: "📥", permission: "canImport" },
  { page: "backups", label: "Sauvegardes", icon: "💾", permission: "canManageUsers" },
  { page: "logs", label: "Journal d’activité", icon: "📜", type: "page" },
 // Temporairement désactivé
// { page: "vue3d", label: "Vue 3D", icon: "👕", type: "page" },
// { page: "tshirt3d", label: "T-shirt 3D", icon: "🎨", type: "page" },
];

export default function Sidebar({
  data,
  currentUser,
  currentRole,
  syncStatus,
  permissions,
  logout
}) {
  function canShow(item) {
    if (item.type === "page") {
      return permissions.pages.includes(item.page);
    }

    if (item.permission) {
      return Boolean(permissions[item.permission]);
    }

    return true;
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img
            src="/logo.png"
            alt="AC Creation"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div>
          <h1>{data.settings.companyName || "AC Creation"}</h1>
          <span>Creative CRM</span>
          <p className="brand-desc">
Personnalisation • Laser • 3D
</p>
        </div>
      </div>

<div className="sidebar-user">
  <strong>
    {currentUser.name}
  </strong>

  <span>
    {currentRole}
  </span>
</div>

      <div className="sidebar-sync">
  ☁️ {syncStatus}
</div>

      <nav className="sidebar-nav">
        {menuItems.filter(canShow).map((item) => (
          <NavLink
            key={item.page}
            to={pageToPath(item.page)}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="danger" onClick={logout}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
