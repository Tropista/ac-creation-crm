export default function AccessDenied({ user, logout }) {
  return (
    <div className="modern-auth">
      <div className="modern-auth-card admin-lock-card">
        <div className="lock-icon">⛔</div>

        <h2>Accès non autorisé</h2>

        <p className="auth-subtitle">
          Le compte {user?.email} existe dans Supabase,
          mais il n'est pas autorisé dans ce CRM.
        </p>

        <p className="admin-help">
          Un administrateur doit ajouter cet email
          dans la page Utilisateurs.
        </p>

        <button
          className="modern-primary"
          type="button"
          onClick={logout}
        >
          Se déconnecter <span>↗</span>
        </button>
      </div>
    </div>
  );
}