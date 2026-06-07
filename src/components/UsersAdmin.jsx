import { useState } from "react";
import { getSupabase } from "../supabase";
import { normalizeEmail } from "../services/authService";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";
function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}
export default function UsersAdmin({ data, setData, logActivity }) {
  const [form, setForm] = useState({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  const users = data.users || [];

  function reset() {
    setForm({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  }

  async function saveUserToSupabase(user) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("users")
    .upsert(
      {
        id: user.id,
        data: user,
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

  async function deleteUserFromSupabase(id) {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async function addUser(e) {
    e.preventDefault();
    const email = normalizeEmail(form.email);

    if (!email) return showToast("Email obligatoire.", "error");
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      return showToast("Cet utilisateur existe déjà.", "error");
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
      await logActivity?.({
  action: "Création utilisateur",
  target: nextUser.email,
  details: nextUser.role,
});
      reset();
      showToast("Utilisateur sauvegardé dans Supabase.", "success");
    } catch (error) {
      console.error("Erreur sauvegarde utilisateur Supabase :", error);
      showToast("Erreur : l'utilisateur n'a pas été sauvegardé dans Supabase.", "error");
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
      await logActivity?.({
  action: "Modification utilisateur",
  target: updatedUser?.email || id,
  details: JSON.stringify(changes),
});
    } catch (error) {
      console.error("Erreur mise à jour utilisateur Supabase :", error);
      showToast("Erreur : la modification utilisateur n'a pas été sauvegardée dans Supabase.", "error");
    }
  }

  async function removeUser(id) {
    if (
      !(await confirmAction({
        title: "Retirer l'accès utilisateur",
        message: "Cet utilisateur ne pourra plus accéder au CRM via cette fiche.",
        confirmLabel: "Retirer",
        danger: true,
      }))
    ) return;

    try {
      const removedUser = users.find((user) => user.id === id);
      await deleteUserFromSupabase(id);
      await setData({ ...data, users: users.filter((user) => user.id !== id) });
      await logActivity?.({
  action: "Suppression utilisateur",
  target: removedUser?.email || id,
});
    } catch (error) {
      console.error("Erreur suppression utilisateur Supabase :", error);
      showToast("Erreur : l'utilisateur n'a pas été supprimé dans Supabase.", "error");
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
