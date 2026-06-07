import { useEffect, useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import {
  getExpensesForSupplier,
  sumExpenseTotals,
} from "../utils/expenseSuppliers";
import { showToast } from "../utils/toast";
import { isNonNegativeNumber, isRequired, parseLocaleNumber, validateFields } from "../utils/validation";

function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}

function money(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

const emptySupplierForm = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  website: "",
  notes: "",
};

const UNIT_OPTIONS = ["pièce", "m", "m²", "kg", "rouleau", "L", "lot"];

const emptyLinkForm = {
  name: "",
  purchasePriceHT: "",
  supplierSku: "",
  unit: "pièce",
  notes: "",
};

function getLinkDisplayName(link, products = []) {
  if (link?.name?.trim()) return link.name.trim();
  if (link?.productId) {
    const product = products.find((p) => String(p.id) === String(link.productId));
    return product?.name || "Produit inconnu";
  }
  return "Produit inconnu";
}

export default function Suppliers({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
}) {
  const [search, setSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [form, setForm] = useState(emptySupplierForm);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [showLinkForm, setShowLinkForm] = useState(false);

  const itemsPerPage = 25;
  const suppliers = data.suppliers || [];
  const expenses = data.expenses || [];
  const products = (data.products || []).filter((product) => !product.archived);

  useEffect(() => {
    const supplierId = localStorage.getItem("crm_select_supplier_id");
    if (!supplierId) return;

    localStorage.removeItem("crm_select_supplier_id");
    if (suppliers.some((supplier) => String(supplier.id) === supplierId)) {
      setSelectedSupplierId(supplierId);
    }
  }, [suppliers]);

  const totalPurchasedProducts = useMemo(
    () =>
      suppliers.reduce(
        (sum, supplier) => sum + (supplier.productLinks || []).length,
        0
      ),
    [suppliers]
  );

  const filteredSuppliers = suppliers
    .filter((supplier) => {
      const linkText = (supplier.productLinks || [])
        .flatMap((link) => [
          getLinkDisplayName(link, products),
          link.supplierSku,
          link.notes,
        ])
        .join(" ");

      return [
        supplier.name,
        supplier.contact,
        supplier.email,
        supplier.phone,
        supplier.website,
        supplier.notes,
        linkText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const paginatedSuppliers = filteredSuppliers.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === selectedSupplierId
  );

  const linkedExpenses = useMemo(() => {
    if (!selectedSupplier) return [];
    return getExpensesForSupplier(selectedSupplier, expenses).sort((a, b) => {
      const dateA = new Date(a.purchaseDate || a.createdAt || 0).getTime();
      const dateB = new Date(b.purchaseDate || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [selectedSupplier, expenses]);

  const linkedExpenseTotals = useMemo(
    () => sumExpenseTotals(linkedExpenses),
    [linkedExpenses]
  );

  function resetSupplierForm() {
    setEditing(null);
    setForm(emptySupplierForm);
    setShowSupplierForm(false);
  }

  function resetLinkForm() {
    setEditingLinkId(null);
    setLinkForm(emptyLinkForm);
    setShowLinkForm(false);
  }

  function updateSupplierForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submitSupplier(e) {
    e.preventDefault();

    const validationError = validateFields(form, {
      name: [{ test: isRequired, message: "Le nom du fournisseur est obligatoire." }],
    });
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    if (editing) {
      setData({
        ...data,
        suppliers: suppliers.map((supplier) =>
          supplier.id === editing
            ? { ...supplier, ...form, name: form.name.trim() }
            : supplier
        ),
      });
      logActivity?.("Modification fournisseur", form.name.trim());
      showToast("Fournisseur modifié.", "success");
    } else {
      const supplier = {
        id: uid(),
        createdAt: today(),
        ...form,
        name: form.name.trim(),
        productLinks: [],
      };

      setData({
        ...data,
        suppliers: [...suppliers, supplier],
      });
      setSelectedSupplierId(supplier.id);
      logActivity?.("Création fournisseur", supplier.name);
      showToast("Fournisseur ajouté.", "success");
    }

    resetSupplierForm();
  }

  function editSupplier(supplier) {
    setEditing(supplier.id);
    setShowSupplierForm(true);
    setForm({
      name: supplier.name || "",
      contact: supplier.contact || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      website: supplier.website || "",
      notes: supplier.notes || "",
    });
  }

  function removeSupplier(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    const supplier = suppliers.find((item) => item.id === id);
    if (!confirm(`Supprimer le fournisseur « ${supplier?.name || ""} » ?`)) {
      return;
    }

    setData({
      ...data,
      suppliers: suppliers.filter((item) => item.id !== id),
    });

    if (selectedSupplierId === id) {
      setSelectedSupplierId(null);
    }

    logActivity?.("Suppression fournisseur", supplier?.name || "");
    showToast("Fournisseur supprimé.", "success");
  }

  function submitLink(e) {
    e.preventDefault();

    if (!selectedSupplier) return;

    const name = linkForm.name.trim();

    const validationError = validateFields(
      { name, purchasePriceHT: linkForm.purchasePriceHT || "0" },
      {
        name: [{ test: isRequired, message: "Le nom du produit acheté est obligatoire." }],
        purchasePriceHT: [{ test: isNonNegativeNumber, message: "Prix d'achat HT invalide." }],
      }
    );
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const purchasePriceHT = parseLocaleNumber(linkForm.purchasePriceHT || "0");

    const existingLinks = selectedSupplier.productLinks || [];
    const duplicate = existingLinks.some(
      (link) =>
        link.id !== editingLinkId &&
        getLinkDisplayName(link, products).toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      showToast("Ce produit acheté existe déjà chez ce fournisseur.", "error");
      return;
    }

    const nextLink = {
      id: editingLinkId || uid(),
      name,
      purchasePriceHT,
      supplierSku: linkForm.supplierSku.trim(),
      unit: linkForm.unit || "pièce",
      notes: linkForm.notes.trim(),
      updatedAt: today(),
    };

    const nextLinks = editingLinkId
      ? existingLinks.map((link) => (link.id === editingLinkId ? nextLink : link))
      : [...existingLinks, nextLink];

    setData({
      ...data,
      suppliers: suppliers.map((supplier) =>
        supplier.id === selectedSupplier.id
          ? { ...supplier, productLinks: nextLinks }
          : supplier
      ),
    });

    logActivity?.(
      editingLinkId ? "Modification produit acheté" : "Ajout produit acheté",
      selectedSupplier.name,
      name
    );
    showToast(
      editingLinkId ? "Produit acheté modifié." : "Produit acheté ajouté.",
      "success"
    );
    resetLinkForm();
  }

  function editLink(link) {
    setEditingLinkId(link.id);
    setShowLinkForm(true);
    setLinkForm({
      name: link.name?.trim() || getLinkDisplayName(link, products),
      purchasePriceHT: String(link.purchasePriceHT ?? ""),
      supplierSku: link.supplierSku || "",
      unit: link.unit || "pièce",
      notes: link.notes || "",
    });
  }

  function removeLink(linkId) {
    if (!selectedSupplier) return;

    if (!confirm("Retirer ce produit acheté du fournisseur ?")) return;

    setData({
      ...data,
      suppliers: suppliers.map((supplier) =>
        supplier.id === selectedSupplier.id
          ? {
              ...supplier,
              productLinks: (supplier.productLinks || []).filter(
                (link) => link.id !== linkId
              ),
            }
          : supplier
      ),
    });

    logActivity?.("Suppression produit acheté", selectedSupplier.name);
    showToast("Produit acheté retiré.", "success");
  }

  return (
    <section className="suppliers-page">
      <div className="page-header">
        <div>
          <h2>Fournisseurs</h2>
          <p>Gère tes fournisseurs et les produits que tu achètes chez eux.</p>
        </div>
      </div>

      <div className="stats suppliers-stats">
        <div className="card">
          <strong>{suppliers.length}</strong>
          <span>Fournisseur(s)</span>
        </div>
        <div className="card">
          <strong>{totalPurchasedProducts}</strong>
          <span>Produit(s) acheté(s)</span>
        </div>
      </div>

      <div className="suppliers-toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(emptySupplierForm);
            setShowSupplierForm(true);
          }}
        >
          + Nouveau fournisseur
        </button>

        <input
          className="search suppliers-search"
          placeholder="Rechercher un fournisseur ou un produit acheté..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      {showSupplierForm && (
        <form className="card form-grid suppliers-form-panel" onSubmit={submitSupplier}>
          <input
            placeholder="Nom fournisseur *"
            value={form.name}
            onChange={(e) => updateSupplierForm("name", e.target.value)}
          />
          <input
            placeholder="Contact"
            value={form.contact}
            onChange={(e) => updateSupplierForm("contact", e.target.value)}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateSupplierForm("email", e.target.value)}
          />
          <input
            placeholder="Téléphone"
            value={form.phone}
            onChange={(e) => updateSupplierForm("phone", e.target.value)}
          />
          <input
            placeholder="Site web"
            value={form.website}
            onChange={(e) => updateSupplierForm("website", e.target.value)}
          />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => updateSupplierForm("notes", e.target.value)}
          />
          <button className="primary">{editing ? "Modifier" : "Ajouter"}</button>
          <button type="button" onClick={resetSupplierForm}>
            Annuler
          </button>
        </form>
      )}

      <div className="two-columns suppliers-layout">
        <div className="table card suppliers-table-card">
          <p className="muted">{filteredSuppliers.length} fournisseur(s) trouvé(s)</p>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredSuppliers.length}
            perPage={itemsPerPage}
          />

          <table className="suppliers-table">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Contact</th>
                <th>Produits achetés</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSuppliers.length === 0 && (
                <tr>
                  <td colSpan="4" className="muted">
                    Aucun fournisseur pour le moment.
                  </td>
                </tr>
              )}
              {paginatedSuppliers.map((supplier) => {
                const linkCount = (supplier.productLinks || []).length;
                const isSelected = supplier.id === selectedSupplierId;

                return (
                  <tr
                    key={supplier.id}
                    className={isSelected ? "selected-row" : "clickable-row"}
                    onClick={() => setSelectedSupplierId(supplier.id)}
                  >
                    <td>
                      <strong>{supplier.name}</strong>
                      {supplier.email && (
                        <div className="supplier-meta">{supplier.email}</div>
                      )}
                    </td>
                    <td>
                      {supplier.contact || "—"}
                      {supplier.phone && (
                        <div className="supplier-meta">{supplier.phone}</div>
                      )}
                    </td>
                    <td>{linkCount}</td>
                    <td>
                      <div className="supplier-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => editSupplier(supplier)}>
                          Modifier
                        </button>
                        {canDeleteData(currentRole) && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => removeSupplier(supplier.id)}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="supplier-detail-card card">
          {!selectedSupplier ? (
            <div className="supplier-empty">
              <strong>Sélectionne un fournisseur</strong>
              <span>Clique sur une ligne pour voir les produits achetés et leurs prix.</span>
            </div>
          ) : (
            <>
              <div className="supplier-detail-header">
                <div>
                  <h3>{selectedSupplier.name}</h3>
                  <p className="muted">Créé le {formatDate(selectedSupplier.createdAt)}</p>
                </div>
                <button type="button" onClick={() => editSupplier(selectedSupplier)}>
                  Modifier
                </button>
              </div>

              <div className="supplier-info-grid">
                <div className="supplier-field">
                  <strong>Contact</strong>
                  <span>{selectedSupplier.contact || "—"}</span>
                </div>
                <div className="supplier-field">
                  <strong>Email</strong>
                  <span>{selectedSupplier.email || "—"}</span>
                </div>
                <div className="supplier-field">
                  <strong>Téléphone</strong>
                  <span>{selectedSupplier.phone || "—"}</span>
                </div>
                <div className="supplier-field">
                  <strong>Site web</strong>
                  <span>
                    {selectedSupplier.website ? (
                      <a href={selectedSupplier.website} target="_blank" rel="noreferrer">
                        {selectedSupplier.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="supplier-field supplier-field-wide">
                  <strong>Notes</strong>
                  <span>{selectedSupplier.notes || "—"}</span>
                </div>
              </div>

              <div className="supplier-links-section">
                <div className="supplier-links-header">
                  <h4>Produits achetés chez ce fournisseur</h4>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      resetLinkForm();
                      setShowLinkForm(true);
                    }}
                  >
                    + Ajouter un produit acheté
                  </button>
                </div>

                {showLinkForm && (
                  <form className="form-grid supplier-link-form" onSubmit={submitLink}>
                    <input
                      placeholder="Nom du produit acheté *"
                      value={linkForm.name}
                      onChange={(e) =>
                        setLinkForm((current) => ({
                          ...current,
                          name: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Prix d'achat HT *"
                      value={linkForm.purchasePriceHT}
                      onChange={(e) =>
                        setLinkForm((current) => ({
                          ...current,
                          purchasePriceHT: e.target.value,
                        }))
                      }
                    />
                    <input
                      placeholder="Réf. fournisseur (SKU)"
                      value={linkForm.supplierSku}
                      onChange={(e) =>
                        setLinkForm((current) => ({
                          ...current,
                          supplierSku: e.target.value,
                        }))
                      }
                    />
                    <select
                      value={linkForm.unit}
                      onChange={(e) =>
                        setLinkForm((current) => ({
                          ...current,
                          unit: e.target.value,
                        }))
                      }
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Notes"
                      value={linkForm.notes}
                      onChange={(e) =>
                        setLinkForm((current) => ({
                          ...current,
                          notes: e.target.value,
                        }))
                      }
                    />
                    <button className="primary" type="submit">
                      {editingLinkId ? "Modifier" : "Ajouter"}
                    </button>
                    <button type="button" onClick={resetLinkForm}>
                      Annuler
                    </button>
                  </form>
                )}

                <div className="table supplier-links-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>Prix achat HT</th>
                        <th>Unité</th>
                        <th>SKU fourn.</th>
                        <th>Màj</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSupplier.productLinks || []).length === 0 && (
                        <tr>
                          <td colSpan="6" className="muted">
                            Aucun produit acheté.
                          </td>
                        </tr>
                      )}
                      {(selectedSupplier.productLinks || []).map((link) => {
                        const displayName = getLinkDisplayName(link, products);
                        const isLegacy = !link.name?.trim() && link.productId;

                        return (
                          <tr key={link.id}>
                            <td>
                              <strong>{displayName}</strong>
                              {isLegacy && (
                                <div className="supplier-meta">Ancien lien produit</div>
                              )}
                              {link.notes && (
                                <div className="supplier-meta">{link.notes}</div>
                              )}
                            </td>
                            <td>{money(link.purchasePriceHT)}</td>
                            <td>{link.unit || "pièce"}</td>
                            <td>{link.supplierSku || "—"}</td>
                            <td>{formatDate(link.updatedAt)}</td>
                            <td>
                              <div className="supplier-actions">
                                <button type="button" onClick={() => editLink(link)}>
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => removeLink(link.id)}
                                >
                                  Retirer
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="supplier-expenses-section">
                <div className="supplier-links-header">
                  <h4>Factures de dépense liées</h4>
                  <div className="supplier-expense-totals">
                    <span>{linkedExpenses.length} facture(s)</span>
                    <strong>{money(linkedExpenseTotals.ht)} HT</strong>
                    <strong>{money(linkedExpenseTotals.ttc)} TTC</strong>
                  </div>
                </div>

                <div className="table supplier-expenses-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>N° facture</th>
                        <th>HT</th>
                        <th>TTC</th>
                        <th>Catégorie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedExpenses.length === 0 && (
                        <tr>
                          <td colSpan="5" className="muted">
                            Aucune facture de dépense liée à ce fournisseur.
                          </td>
                        </tr>
                      )}
                      {linkedExpenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{formatDate(expense.purchaseDate || expense.createdAt)}</td>
                          <td>{expense.invoiceNumber || "—"}</td>
                          <td>{money(expense.amountHT)}</td>
                          <td>{money(expense.totalTTC)}</td>
                          <td>{expense.category || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
