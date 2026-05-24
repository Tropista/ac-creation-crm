import { useEffect, useState } from "react";
import { getSupabase } from "../../supabase";
import { resetUrlAfterAuth } from "../../utils/routes";
import {
  isAllowedUser,
  saveSession,
  userRole,
} from "../../services/authService";

function hasRecoveryHash() {
  return (
    window.location.hash.includes("type=recovery") ||
    window.location.hash.includes("access_token=")
  );
}

export default function AuthPage({
  data,
  setData: _setData,
  setCurrentUser,
  initialNotice = "",
}) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(hasRecoveryHash());
  const [error, setError] = useState(initialNotice);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (initialNotice) {
      setError(initialNotice);
    }
  }, [initialNotice]);

  useEffect(() => {
    async function detectRecoverySession() {
      if (!hasRecoveryHash()) return;

      const supabase = await getSupabase();
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

    const supabase = await getSupabase();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message || "Impossible de mettre à jour le mot de passe.");
      return;
    }

    setSuccess("Mot de passe mis à jour. Tu peux maintenant te connecter.");
    setNewPassword("");
    setRecoveryMode(false);

    await supabase.auth.signOut();

    resetUrlAfterAuth();
  }

  async function login(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.email || !form.password) {
      setError("Indique ton email et ton mot de passe.");
      return;
    }

    const supabase = await getSupabase();
    const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });

    if (loginError || !authData.user) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    if (!isAllowedUser(authData.user.email, data.users)) {
      await supabase.auth.signOut();
      setError("Compte non autorisé. Demande à l'administrateur d'ajouter ton email.");
      return;
    }

    const session = saveSession({
      id: authData.user.id,
      name: authData.user.user_metadata?.name || authData.user.email,
      email: authData.user.email,
      role: userRole(authData.user.email, data.users),
    });

    setCurrentUser(session);
  }

  return (
    <div className="modern-auth" data-testid="auth-page">
      <div className="auth-orb orb-one"></div>
      <div className="auth-orb orb-two"></div>

      <section className="auth-showcase">
        <div className="brand-icon">📊</div>
        <h1>
          Mon <span>CRM</span>
        </h1>
        <p className="brand-text">
          Accès privé réservé aux utilisateurs autorisés par l'administrateur.
        </p>

        <div className="auth-features">
          <div className="feature-item">
            <div>🔐</div>
            <span>
              <strong>Accès sécurisé</strong>
              L'inscription publique est désactivée.
            </span>
          </div>

          <div className="feature-item">
            <div>👑</div>
            <span>
              <strong>Mode admin</strong>
              Seul l'admin peut autoriser de nouveaux utilisateurs.
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
              data-testid="auth-email"
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
            data-testid="auth-password"
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

        {error && (
          <p className="modern-error" data-testid="auth-error">
            {error}
          </p>
        )}
        {success && <p className="modern-success">{success}</p>}

        <button className="modern-primary" type="submit" data-testid="auth-submit">
          {recoveryMode ? "Mettre à jour" : "Se connecter"}
          <span>→</span>
        </button>

        {recoveryMode && (
          <button
            type="button"
            className="modern-secondary"
            onClick={async () => {
              try {
                const supabase = await getSupabase();
                await supabase.auth.signOut();
              } catch (err) {
                console.error(err);
              }
              setRecoveryMode(false);
              setNewPassword("");
              setError("");
              resetUrlAfterAuth();
            }}
          >
            Annuler
          </button>
        )}

        <p className="auth-note">
          🛡️ Compte requis et validé par l'administrateur.
        </p>
      </form>
    </div>
  );
}
