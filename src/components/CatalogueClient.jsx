import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2, Trash2 } from "lucide-react";
import { isSupabaseConfigured } from "../supabase";
import { deleteCatalogSelection } from "../services/catalogService";
import { emptyData, normalizeData } from "../services/dataService";
import {
  getCatalogShareUrl,
  openQuoteFromCatalogSelection,
} from "../utils/catalogShare";
import { resolveActiveCatalogItems } from "../utils/catalogCollections";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

function money(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function statusLabel(status) {
  if (status === "submitted") return "Réponse reçue";
  if (status === "closed") return "Clôturée";
  return "En attente client";
}

export default function CatalogueClient({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  const selections = Array.isArray(data.catalogSelections) ? data.catalogSelections : [];
  const catalogItems = resolveActiveCatalogItems(data.clientCatalogItems);

  const categories = useMemo(() => {
    const names = new Set();
    catalogItems.forEach((item) => {
      if (item.category) names.add(item.category);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "fr"));
  }, [catalogItems]);

  const filteredCatalogItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minPrice = priceMin === "" ? null : Number(priceMin);
    const maxPrice = priceMax === "" ? null : Number(priceMax);

    const filtered = catalogItems.filter((item) => {
      const price = Number(item.price || 0);
      const matchesSearch =
        !query ||
        [item.name, item.sku, item.category, item.brand, item.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesCategory = !categoryFilter || item.category === categoryFilter;
      const matchesPriceMin = minPrice === null || price >= minPrice;
      const matchesPriceMax = maxPrice === null || price <= maxPrice;
      return matchesSearch && matchesCategory && matchesPriceMin && matchesPriceMax;
    });

    return filtered.sort((a, b) => {
      const priceA = Number(a.price || 0);
      const priceB = Number(b.price || 0);
      switch (sortBy) {
        case "name-desc":
          return String(b.name || "").localeCompare(String(a.name || ""), "fr");
        case "price-asc":
          return priceA - priceB;
        case "price-desc":
          return priceB - priceA;
        case "recent":
          return (
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime()
          );
        default:
          return String(a.name || "").localeCompare(String(b.name || ""), "fr");
      }
    });
  }, [catalogItems, search, categoryFilter, sortBy, priceMin, priceMax]);

  const activeSelectedItem = useMemo(() => {
    if (!selectedItem) return null;
    return catalogItems.find((item) => item.id === selectedItem.id) || selectedItem;
  }, [catalogItems, selectedItem]);

  function resetCatalogFilters() {
    setSearch("");
    setCategoryFilter("");
    setSortBy("name-asc");
    setPriceMin("");
    setPriceMax("");
  }

  function toggleItemSelection(itemId) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredCatalogItems.map((item) => item.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedItemIds.includes(id));

    if (allVisibleSelected) {
      setSelectedItemIds((current) => current.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedItemIds((current) => [...new Set([...current, ...visibleIds])]);
    }
  }

  function removeCatalogItem(itemId) {
    const item = catalogItems.find((entry) => entry.id === itemId);
    if (!item || !confirm(`Retirer « ${item.name} » du catalogue client ?`)) return;

    setData((prev) => ({
      ...prev,
      clientCatalogItems: (prev.clientCatalogItems || []).filter(
        (entry) => entry.id !== itemId
      ),
    }));
    if (selectedItem?.id === itemId) {
      setSelectedItem(null);
    }
    setSelectedItemIds((current) => current.filter((id) => id !== itemId));
    logActivity?.("Suppression article catalogue client", item.name, item.sku || "");
  }

  function removeSelectedCatalogItems() {
    const count = selectedItemIds.length;
    if (!count) return;
    if (!confirm(`Supprimer ${count} article(s) du catalogue client ?`)) return;

    setData((prev) => ({
      ...prev,
      clientCatalogItems: (prev.clientCatalogItems || []).filter(
        (entry) => !selectedItemIds.includes(entry.id)
      ),
    }));

    if (selectedItem?.id && selectedItemIds.includes(selectedItem.id)) {
      setSelectedItem(null);
    }

    logActivity?.(
      "Suppression groupée catalogue client",
      `${count} article(s)`,
      ""
    );
    setSelectedItemIds([]);
    showToast(`${count} article(s) retiré(s) du catalogue client`, "success");
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
        clientCatalogItems: cloud.data.clientCatalogItems || [],
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
          <h2>Catalogue client</h2>
          <p className="page-subtitle">
            Articles proposés à vos clients. Importez-les depuis l&apos;onglet Import
            fournisseur — séparés de vos produits internes (onglet Produits).
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

      <div className="product-search-panel filters-card card">
        <div className="filters-premium-header">
          <div className="filters-title-row">
            <span className="filters-icon">⌕</span>
            <div>
              <strong>Recherche & filtres catalogue</strong>
              <span>
                {filteredCatalogItems.length} résultat(s) sur {catalogItems.length} article(s)
              </span>
            </div>
          </div>
        </div>

        <div className="filters-main-row products-filters-two-rows">
          <div className="filters-search-wrap">
            <span>⌕</span>
            <input
              className="search filters-search-input"
              placeholder="Recherche : nom, SKU, catégorie, marque..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            className="filters-select"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            className="filters-select"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="name-asc">Nom A → Z</option>
            <option value="name-desc">Nom Z → A</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
            <option value="recent">Plus récents</option>
          </select>

          <div className="filters-price-wrap">
            <input
              type="number"
              min="0"
              placeholder="Prix min"
              value={priceMin}
              onChange={(event) => setPriceMin(event.target.value)}
            />
            <span>→</span>
            <input
              type="number"
              min="0"
              placeholder="Prix max"
              value={priceMax}
              onChange={(event) => setPriceMax(event.target.value)}
            />
          </div>
        </div>

        <div className="filters-bottom-row">
          <button type="button" className="filters-reset-button" onClick={resetCatalogFilters}>
            ↺ Réinitialiser
          </button>
        </div>
      </div>

      <div className="products-premium-panel card">
        {catalogItems.length === 0 ? (
          <div className="product-empty-state">
            <strong>Aucun article catalogue</strong>
            <span>
              Importez des articles depuis l&apos;onglet Import fournisseur avec « Ajouter au
              catalogue client ».
            </span>
          </div>
        ) : filteredCatalogItems.length === 0 ? (
          <div className="product-empty-state">
            <strong>Aucun article trouvé</strong>
            <span>Essaie de modifier la recherche ou les filtres.</span>
          </div>
        ) : (
          <>
            <div className="catalog-client-bulk-toolbar">
              <label className="product-select-pill">
                <input
                  type="checkbox"
                  checked={
                    filteredCatalogItems.length > 0 &&
                    filteredCatalogItems.every((item) => selectedItemIds.includes(item.id))
                  }
                  onChange={toggleAllVisible}
                />
                <span>
                  {filteredCatalogItems.length > 0 &&
                  filteredCatalogItems.every((item) => selectedItemIds.includes(item.id))
                    ? "Tout désélectionner"
                    : "Tout sélectionner"}
                </span>
              </label>
              {selectedItemIds.length > 0 ? (
                <button type="button" className="danger" onClick={removeSelectedCatalogItems}>
                  <Trash2 size={14} />
                  Supprimer la sélection ({selectedItemIds.length})
                </button>
              ) : null}
            </div>

            <div className="products-erp-layout">
              <div className="product-premium-grid">
                {filteredCatalogItems.map((item) => (
                  <article
                    key={item.id}
                    className={`product-premium-card ${
                      selectedItemIds.includes(item.id) ? "selected" : ""
                    } ${activeSelectedItem?.id === item.id ? "active-product-card" : ""}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="product-premium-top">
                      <label className="product-select-pill">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.includes(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleItemSelection(item.id)}
                        />
                        <span>Sélection</span>
                      </label>
                    </div>

                    <div className="product-visual">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name || "Article"} loading="lazy" />
                    ) : (
                      <span>{(item.name || "A").slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="product-premium-body">
                    <h3>{item.name}</h3>

                    <div className="product-tags-row">
                      <span>SKU : {item.sku || "Sans SKU"}</span>
                      <span>{item.category || "Sans catégorie"}</span>
                      <span>Prix HT : {money(item.price)}</span>
                    </div>

                    {item.brand ? (
                      <p className="product-description">Marque : {item.brand}</p>
                    ) : null}
                  </div>

                  <div className="product-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="danger" onClick={() => removeCatalogItem(item.id)}>
                      <Trash2 size={14} />
                      Retirer
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <aside className="product-side-card card">
              {!activeSelectedItem ? (
                <div className="product-side-empty">
                  <strong>Sélectionne un article</strong>
                  <span>La fiche détaillée apparaîtra ici.</span>
                </div>
              ) : (
                <>
                  <div className="product-side-image">
                    {activeSelectedItem.imageUrl ? (
                      <img src={activeSelectedItem.imageUrl} alt={activeSelectedItem.name || "Article"} />
                    ) : (
                      <span>{(activeSelectedItem.name || "A").slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="product-side-header">
                    <div>
                      <h2>{activeSelectedItem.name}</h2>
                      <span>{activeSelectedItem.category || "Sans catégorie"}</span>
                    </div>
                    <strong>{money(activeSelectedItem.price)}</strong>
                  </div>

                  <div className="product-side-kpis">
                    <div>
                      <strong>{activeSelectedItem.sku || "—"}</strong>
                      <span>SKU</span>
                    </div>
                    <div>
                      <strong>{money(activeSelectedItem.price)}</strong>
                      <span>Prix HT</span>
                    </div>
                    <div>
                      <strong>
                        {activeSelectedItem.priceTTC
                          ? money(activeSelectedItem.priceTTC)
                          : "—"}
                      </strong>
                      <span>Prix TTC</span>
                    </div>
                  </div>

                  {(activeSelectedItem.brand ||
                    activeSelectedItem.grammage ||
                    activeSelectedItem.minOrderQty) && (
                    <div className="product-side-desc">
                      <strong>Informations</strong>
                      {activeSelectedItem.brand ? <p>Marque : {activeSelectedItem.brand}</p> : null}
                      {activeSelectedItem.grammage ? (
                        <p>Grammage : {activeSelectedItem.grammage}</p>
                      ) : null}
                      {activeSelectedItem.minOrderQty ? (
                        <p>Commande minimum : x{activeSelectedItem.minOrderQty}</p>
                      ) : null}
                    </div>
                  )}

                  {activeSelectedItem.description ? (
                    <div className="product-side-desc">
                      <strong>Description</strong>
                      <p>{activeSelectedItem.description}</p>
                    </div>
                  ) : null}

                  {activeSelectedItem.colors?.length ? (
                    <div className="product-side-desc">
                      <strong>Couleurs ({activeSelectedItem.colors.length})</strong>
                      <p>{activeSelectedItem.colors.slice(0, 20).join(", ")}</p>
                    </div>
                  ) : null}

                  {activeSelectedItem.sourceUrl ? (
                    <div className="product-side-desc">
                      <strong>Source fournisseur</strong>
                      <p>
                        <a href={activeSelectedItem.sourceUrl} target="_blank" rel="noreferrer">
                          {activeSelectedItem.sourceProvider || "Voir la fiche"}
                        </a>
                      </p>
                    </div>
                  ) : null}

                  <div className="product-side-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeCatalogItem(activeSelectedItem.id)}
                    >
                      <Trash2 size={16} />
                      Retirer du catalogue
                    </button>
                  </div>
                </>
              )}
            </aside>
            </div>
          </>
        )}
      </div>

      {selections.length > 0 ? (
        <div className="catalog-selection-list">
          <h3>Sélections client existantes</h3>
          {selections.map((selection) => {
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
          })}
        </div>
      ) : null}
    </div>
  );
}
