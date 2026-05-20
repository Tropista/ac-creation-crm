import { useState } from "react";
import { supabase } from "../../supabase";
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ["ac.creation.officiel@gmail.com"]
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
export default function AuthPage({
  data,
  setData,
  setCurrentUser
}) {

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