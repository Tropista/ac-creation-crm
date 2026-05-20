import { useState } from "react";
import { supabase } from "../supabase";
export default function UsersAdmin({ data, setData, logActivity }) {
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