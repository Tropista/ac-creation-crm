import { useEffect, useState } from "react";
import { supabase } from "../../supabase";

const SESSION_KEY = "crm_current_user_v2";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return [
    "ac.creation.officiel@gmail.com",
    "dos.santos.alves.daniel@gmail.com",
  ]
    .map(normalizeEmail)
    .includes(normalizeEmail(email));
}

function isAllowedUser(email, users = []) {
  const normalizedEmail = normalizeEmail(email);

  return (
    isAdminEmail(normalizedEmail) ||
    (users || []).some(
      (user) =>
        normalizeEmail(user.email) === normalizedEmail &&
        user.status !== "Désactivé"
    )
  );
}

function userRole(email, users = []) {
  if (isAdminEmail(email)) return "Admin";

  const found = (users || []).find(
    (user) => normalizeEmail(user.email) === normalizeEmail(email)
  );

  return found?.role || "Utilisateur";
}

function hasRecoveryHash() {
  return (
    window.location.hash.includes("type=recovery") ||
    window.location.hash.includes("access_token=")
  );
}

export default function AuthPage({
  data,
  setData,
  setCurrentUser
}) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(hasRecoveryHash());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function detectRecoverySession() {
      if (!hasRecoveryHash()) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setRecoveryMode(true);
      }
    }

    detectRecoverySession();
  }, []);

  async function updatePassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.length < 6) {
      setError("Mot de passe minimum : 6 caractères.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setError(error.message || "Impossible de mettre à jour le mot de passe.");
      return;
    }

    setSuccess("Mot de passe mis à jour. Tu peux maintenant te connecter.");
    setNewPassword("");
    setRecoveryMode(false);

    await supabase.auth.signOut();

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }

  async function login(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

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

      <form
        className="modern-auth-card"
        onSubmit={recoveryMode ? updatePassword : login}
      >
        <div className="lock-icon">🔒</div>

        <h2>{recoveryMode ? "Nouveau mot de passe" : "Bienvenue !"}</h2>

        <p className="auth-subtitle">
          {recoveryMode
            ? "Définis ton nouveau mot de passe pour ton compte."
            : "Connectez-vous à votre espace privé"}
        </p>

        {!recoveryMode && (
          <label className="modern-field">
            <span>✉️</span>
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
        )}

        <label className="modern-field">
          <span>🔑</span>
          <input
            placeholder={recoveryMode ? "Nouveau mot de passe" : "Mot de passe"}
            type="password"
            value={recoveryMode ? newPassword : form.password}
            onChange={(e) =>
              recoveryMode
                ? setNewPassword(e.target.value)
                : setForm({ ...form, password: e.target.value })
            }
          />
        </label>

        {error && <p className="modern-error">{error}</p>}
        {success && <p className="modern-success">{success}</p>}

        <button className="modern-primary" type="submit">
          {recoveryMode ? "Mettre à jour" : "Se connecter"}
          <span>→</span>
        </button>

        {recoveryMode && (
          <button
            type="button"
            className="modern-secondary"
            onClick={async () => {
              await supabase.auth.signOut();
              setRecoveryMode(false);
              setNewPassword("");
              setError("");
              window.history.replaceState(
                {},
                document.title,
                window.location.pathname
              );
            }}
          >
            Annuler
          </button>
        )}

        <p className="auth-note">
          🛡️ Compte requis et validé par l’administrateur.
        </p>
      </form>
    </div>
  );
}
