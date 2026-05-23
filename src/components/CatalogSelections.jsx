import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { isSupabaseConfigured } from "../supabase";
import { upsertCatalogSelection, deleteCatalogSelection } from "../services/catalogService";
import { emptyData, normalizeData } from "../services/dataService";
import {
  generateShareId,
  getCatalogShareUrl,
  openQuoteFromCatalogSelection,
  buildProductSnapshots,
} from "../utils/catalogShare";
import { showToast } from "../utils/toast";
import CatalogItemImport from "./CatalogItemImport";

function uidStamp() {
  return new Date().toISOString();
}

function statusLabel(status) {
  if (status === "submitted") return "Réponse reçue";
  if (status === "closed") return "Clôturée";
  return "En attente client";
}

function resolveCatalogItems(data) {
  return (Array.isArray(data.catalogItems) ? data.catalogItems : []).filter(
    (item) => item && !item.archived
  );
}

export default function CatalogSelections({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    clientId: "",
    message: "",
    itemIds: [],
  });
  const [itemSearch, setItemSearch] = useState("");

  const selections = Array.isArray(data.catalogSelections) ? data.catalogSelections : [];
  const clients = data.clients || [];
  const catalogItems = resolveCatalogItems(data);

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return catalogItems.slice(0, 60);
    return catalogItems
      .filter((item) =>
        [item.name, item.sku, item.category, item.brand]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 60);
  }, [catalogItems, itemSearch]);

  function resetForm() {
    setForm({ title: "", clientId: "", message: "", itemIds: [] });
    setItemSearch("");
  }

  function toggleItem(itemId) {
    setForm((current) => ({
      ...current,
      itemIds: current.itemIds.includes(itemId)
        ? current.itemIds.filter((id) => id !== itemId)
        : [...current.itemIds, itemId],
    }));
  }

  async function persistSelection(selection, previousSelections) {
    setData({
      ...data,
      catalogSelections: previousSelections,
    });

    if (isSupabaseConfigured) {
      try {
        await upsertCatalogSelection(selection);
      } catch (error) {
        showToast(error.message || "Sync Supabase impossible.", "error");
      }
    }
  }

  async function createSelection(event) {
    event.preventDefault();

    if (!form.title.trim()) {
      showToast("Titre obligatoire.", "error");
      return;
    }
    if (!form.itemIds.length) {
      showToast("Choisissez au moins un article du catalogue.", "error");
      return;
    }

    const shareId = generateShareId();
    const client = clients.find((item) => item.id === form.clientId);
    const selectedItems = catalogItems.filter((item) => form.itemIds.includes(item.id));
    const productSnapshots = buildProductSnapshots(selectedItems);
    const selection = {
      id: shareId,
      shareId,
      title: form.title.trim(),
      clientId: form.clientId || "",
      clientName: client?.name || "",
      message: form.message.trim(),
      productIds: [...form.itemIds],
      productSnapshots,
      status: "open",
      clientSubmission: null,
      createdAt: uidStamp(),
      updatedAt: uidStamp(),
    };

    const nextSelections = [selection, ...selections];
    await persistSelection(selection, nextSelections);
    logActivity?.("Création catalogue client", selection.title, shareId);
    showToast("Sélection créée. Copiez le lien client ci-dessous.", "success");
    resetForm();
  }

  function removeCatalogItem(itemId) {
    const item = catalogItems.find((entry) => entry.id === itemId);
    if (!item || !confirm(`Retirer « ${item.name} » du catalogue client ?`)) return;

    setData({
      ...data,
      catalogItems: (data.catalogItems || []).filter((entry) => entry.id !== itemId),
    });
    logActivity?.("Suppression article catalogue", item.name, item.sku || "");
  }

  async function removeSelection(selection) {
    if (!confirm(`Supprimer la sélection « ${selection.title} » ?`)) return;

    const nextSelections = selections.filter((item) => item.id !== selection.id);
    setData({ ...data, catalogSelections: nextSelections });

    if (isSupabaseConfigured) {
      try {
        await deleteCatalogSelection(selection.id);
      } catch (error) {
        showToast(error.message || "Suppression cloud impossible.", "error");
      }
    }

    logActivity?.("Suppression catalogue client", selection.title, selection.id);
  }

  async function refreshFromCloud() {
    if (!isSupabaseConfigured) {
      showToast("Supabase non configuré.", "warning");
      return;
    }

    try {
      const { loadSupabaseData } = await import("../services/supabaseSync");
      const cloud = await loadSupabaseData({ normalizeData, emptyData });
      setData({
        ...data,
        catalogItems: cloud.data.catalogItems || [],
        catalogSelections: cloud.data.catalogSelections || [],
      });
      showToast("Catalogue client synchronisé.", "success");
    } catch (error) {
      showToast(error.message || "Synchronisation impossible.", "error");
    }
  }

  async function copyLink(selection) {
    const link = getCatalogShareUrl(selection.shareId || selection.id);
    try {
      await navigator.clipboard.writeText(link);
      showToast("Lien copié dans le presse-papiers.", "success");
    } catch {
      showToast(link, "info");
    }
  }

  function findCatalogItem(itemId, selection) {
    const snapshot = (selection?.productSnapshots || []).find((item) => item.id === itemId);
    if (snapshot) return snapshot;
    return catalogItems.find((item) => item.id === itemId);
  }

  function createQuote(selection) {
    const items = (selection.productIds || [])
      .map((id) => findCatalogItem(id, selection))
      .filter(Boolean);
    openQuoteFromCatalogSelection(navigate, selection, items);
  }

  return (
    <div className="catalog-selections-page">
      <div className="page-header">
        <div>
          <h2>Catalogues client</h2>
          <p className="page-subtitle">
            Importez des articles fournisseur, composez une sélection et envoyez un lien au client.
            Séparé de vos produits internes (onglet Produits).
          </p>
        </div>
        <button type="button" className="primary" onClick={refreshFromCloud}>
          <Link2 size={16} />
          Rafraîchir
        </button>
      </div>

      {!isSupabaseConfigured ? (
        <div className="catalog-api-banner is-error">
          Supabase non configuré : le lien client ne fonctionnera que sur le même appareil que le CRM.
        </div>
      ) : null}

      <CatalogItemImport data={data} setData={setData} logActivity={logActivity} />

      <section className="card">
        <h3>Articles du catalogue ({catalogItems.length})</h3>
        {catalogItems.length === 0 ? (
          <p className="page-subtitle">
            Aucun article importé. Utilisez le formulaire ci-dessus pour ajouter des tee-shirts, polos, etc.
          </p>
        ) : (
          <div className="catalog-import-grid">
            {catalogItems.slice(0, 24).map((item) => (
              <article key={item.id} className="catalog-import-item">
                <div className="catalog-import-item-media">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                  ) : (
                    <div className="catalog-import-placeholder">?</div>
                  )}
                </div>
                <div className="catalog-import-item-body">
                  <strong>{item.name}</strong>
                  <span>{item.category}</span>
                  <span>{item.sku}</span>
                </div>
                <button type="button" className="danger" onClick={() => removeCatalogItem(item.id)}>
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        )}
        {catalogItems.length > 24 ? (
          <p className="catalog-import-meta">{catalogItems.length - 24} autre(s) article(s) — utilisez la recherche ci-dessous.</p>
        ) : null}
      </section>

      <form className="card catalog-selection-form" onSubmit={createSelection}>
        <h3>Nouvelle sélection client</h3>
        <div className="catalog-selection-form-grid">
          <label>
            Titre
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ex. Tee-shirts pour événement Dupont"
            />
          </label>
          <label>
            Client
            <select
              value={form.clientId}
              onChange={(event) => setForm({ ...form, clientId: event.target.value })}
            >
              <option value="">— Optionnel —</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Message pour le client
          <textarea
            rows={3}
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder="Bonjour, voici les modèles proposés. Indiquez vos choix de couleur et taille."
          />
        </label>

        <label>
          Rechercher dans le catalogue
          <input
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder="Nom, SKU, catégorie..."
          />
        </label>

        <div className="catalog-selection-products">
          {filteredItems.length === 0 ? (
            <p className="page-subtitle">Importez d&apos;abord des articles dans le catalogue.</p>
          ) : (
            filteredItems.map((item) => (
              <label key={item.id} className="catalog-selection-product">
                <input
                  type="checkbox"
                  checked={form.itemIds.includes(item.id)}
                  onChange={() => toggleItem(item.id)}
                />
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" />
                ) : (
                  <div className="catalog-import-placeholder">?</div>
                )}
                <span>{item.name}</span>
              </label>
            ))
          )}
        </div>

        <button type="submit" className="primary" disabled={!catalogItems.length}>
          <Plus size={16} />
          Créer la sélection ({form.itemIds.length})
        </button>
      </form>

      <div className="catalog-selection-list">
        {selections.length === 0 ? (
          <div className="card empty-state">Aucune sélection client pour le moment.</div>
        ) : (
          selections.map((selection) => {
            const link = getCatalogShareUrl(selection.shareId || selection.id);
            const submission = selection.clientSubmission;

            return (
              <article key={selection.id} className="card catalog-selection-card">
                <div className="catalog-selection-card-header">
                  <div>
                    <h3>{selection.title}</h3>
                    <p>
                      {selection.clientName || "Sans client"} · {selection.productIds?.length || 0}{" "}
                      article(s) ·{" "}
                      <span className={`status-pill status-${selection.status}`}>
                        {statusLabel(selection.status)}
                      </span>
                    </p>
                  </div>
                  <div className="catalog-selection-actions">
                    <button type="button" className="primary" onClick={() => copyLink(selection)}>
                      <Copy size={16} />
                      Copier le lien
                    </button>
                    <a
                      className="primary"
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                    >
                      <Link2 size={16} />
                      Aperçu
                    </a>
                    {selection.status === "submitted" ? (
                      <button type="button" className="primary" onClick={() => createQuote(selection)}>
                        <Link2 size={16} />
                        Créer un devis
                      </button>
                    ) : null}
                    <button type="button" className="danger" onClick={() => removeSelection(selection)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <p className="catalog-selection-link">{link}</p>

                {submission ? (
                  <div className="catalog-selection-submission">
                    <strong>Réponse client</strong>
                    <p>
                      {submission.clientName || "—"} · {submission.clientEmail || "—"} ·{" "}
                      {submission.clientPhone || "—"}
                    </p>
                    {submission.notes ? <p>{submission.notes}</p> : null}
                    <ul>
                      {(submission.choices || []).map((choice, index) => {
                        const item = findCatalogItem(choice.productId, selection);
                        return (
                          <li key={`${choice.productId}-${index}`}>
                            {item?.name || "Article"} · Qté {choice.quantity}
                            {choice.color ? ` · ${choice.color}` : ""}
                            {choice.size ? ` · ${choice.size}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
