import { useState } from "react";
import { showToast } from "../utils/toast";
function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

export default function Categories({
  data,
  setData,
  currentRole = "Admin",
  logActivity
}) {
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
        if (!name) return showToast("Nom de catégorie obligatoire.", "error");
    
        const alreadyExists = categories.some(
          (category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== editing
        );
    
        if (alreadyExists) return showToast("Cette catégorie existe déjà.", "error");
    
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
    