import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { isSupabaseConfigured } from "../supabase";
import { deleteCatalogSelection, upsertCatalogSelection } from "../services/catalogService";
import { emptyData, loadData, normalizeData } from "../services/dataService";
import {
  createCatalogSelectionPayload,
  getCatalogShareUrl,
  openQuoteFromCatalogSelection,
} from "../utils/catalogShare";
import { resolveActiveCatalogItems } from "../utils/catalogCollections";
import { mergeCloudWithLocal } from "../services/syncMerge";
import { probeCatalogApi, refreshCatalogColors, refreshCatalogImages } from "../utils/catalogApi";
import { patchClientCatalogColors, patchClientCatalogImageUrls } from "../utils/lmdtImport";
import { patchClientCatalogItemImage } from "../utils/catalogImageOverride";
import { stripSourceFromDescription } from "../utils/catalogDescription";
import { showToast } from "../utils/toast";
import CatalogImageDropZone from "./CatalogImageDropZone";
import {
  resolveCatalogColorHex,
  resolveCatalogColorImageUrl,
  resolveCatalogColorLabel,
  enrichCatalogColors,
} from "../utils/colorNameToHex";
import {
  CATALOG_CLIENT_FOLDERS,
  CATALOG_FOLDER_ALL,
  CATALOG_FOLDER_OTHER,
  countItemsByFolder,
  resolveCatalogFolder,
} from "../utils/catalogCategoryFolders";
import "../styles/client-catalog.css";

function statusLabel(status) {
  if (status === "submitted") return "Réponse reçue";
  if (status === "closed") return "Clôturée";
  return "En attente client";
}

function isLmdtSourceUrl(sourceUrl = "") {
  return String(sourceUrl || "").includes("lamaisonduteeshirt.com");
}

export default function CatalogueClient({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState(CATALOG_FOLDER_ALL);
  const [sortBy, setSortBy] = useState("name-asc");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [refreshingPackshots, setRefreshingPackshots] = useState(false);
  const [refreshingColors, setRefreshingColors] = useState(false);
  const [refreshingItemColorsId, setRefreshingItemColorsId] = useState(null);
  const [creatingSelection, setCreatingSelection] = useState(false);
  const [selectionForm, setSelectionForm] = useState({
    title: "",
    clientName: "",
    message: "",
  });

  const selections = Array.isArray(data.catalogSelections) ? data.catalogSelections : [];
  const catalogItems = resolveActiveCatalogItems(data.clientCatalogItems);

  const folderCounts = useMemo(() => countItemsByFolder(catalogItems), [catalogItems]);

  const filteredCatalogItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minPrice = priceMin === "" ? null : Number(priceMin);
    const maxPrice = priceMax === "" ? null : Number(priceMax);

    const filtered = catalogItems.filter((item) => {
      const price = Number(item.price || 0);
      const itemFolder = resolveCatalogFolder(item);
      const matchesSearch =
        !query ||
        [item.name, item.sku, item.category, item.brand, item.description, itemFolder]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesFolder = !folderFilter || itemFolder === folderFilter;
      const matchesPriceMin = minPrice === null || price >= minPrice;
      const matchesPriceMax = maxPrice === null || price <= maxPrice;
      return matchesSearch && matchesFolder && matchesPriceMin && matchesPriceMax;
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
  }, [catalogItems, search, folderFilter, sortBy, priceMin, priceMax]);

  const activeSelectedItem = useMemo(() => {
    if (!selectedItem) return null;
    return catalogItems.find((item) => item.id === selectedItem.id) || selectedItem;
  }, [catalogItems, selectedItem]);

  const activeSelectedColors = useMemo(() => {
    if (!activeSelectedItem?.colors?.length) return [];
    return enrichCatalogColors(activeSelectedItem.colors);
  }, [activeSelectedItem?.colors]);

  const sidePanelImageUrl = useMemo(() => {
    if (!activeSelectedItem) return "";
    if (selectedColorIndex !== null) {
      const colorImage = resolveCatalogColorImageUrl(activeSelectedColors[selectedColorIndex]);
      if (colorImage) return colorImage;
    }
    return activeSelectedItem.imageUrl || "";
  }, [activeSelectedItem, activeSelectedColors, selectedColorIndex]);

  useEffect(() => {
    setSelectedColorIndex(null);
  }, [activeSelectedItem?.id]);

  const activeSelectedDescription = useMemo(() => {
    if (!activeSelectedItem?.description) return "";
    return stripSourceFromDescription(activeSelectedItem.description);
  }, [activeSelectedItem?.description]);

  function resetCatalogFilters() {
    setSearch("");
    setFolderFilter(CATALOG_FOLDER_ALL);
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
      setSelectedColorIndex(null);
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
      setSelectedColorIndex(null);
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
      const merged = mergeCloudWithLocal(normalizeData(loadData()), cloud.data);
      setData({
        ...data,
        clientCatalogItems: merged.clientCatalogItems || [],
        catalogSelections: merged.catalogSelections || [],
      });
      showToast("Catalogue client synchronisé.", "success");
    } catch (error) {
      showToast(error.message || "Synchronisation impossible.", "error");
    }
  }

  async function applyPackshotResults(items, results, { logLabel }) {
    const imageBySourceUrl = new Map();
    let failed = 0;

    for (const result of results) {
      if (result.imageUrl) {
        imageBySourceUrl.set(String(result.sourceUrl || "").trim().toLowerCase(), result.imageUrl);
      } else {
        failed += 1;
      }
    }

    let updated = 0;
    await setData((current) => {
      const patched = patchClientCatalogImageUrls(current, imageBySourceUrl);
      updated = patched.updated;
      return patched.nextData;
    });

    if (activeSelectedItem?.id) {
      const key = String(activeSelectedItem.sourceUrl || "").trim().toLowerCase();
      const nextUrl = imageBySourceUrl.get(key);
      if (nextUrl) {
        setSelectedItem((current) =>
          current?.id === activeSelectedItem.id ? { ...current, imageUrl: nextUrl } : current
        );
      }
    }

    logActivity?.(
      logLabel,
      `${items.length} article(s)`,
      `${updated} mis à jour, ${failed} échec(s)`
    );

    return { updated, failed };
  }

  async function applyColorRefreshResults(items, results, { logLabel, singleItemId = null }) {
    const colorsBySourceUrl = new Map();
    let failed = 0;

    for (const result of results) {
      if (result.colors?.length) {
        colorsBySourceUrl.set(String(result.sourceUrl || "").trim().toLowerCase(), result.colors);
      } else {
        failed += 1;
      }
    }

    let updated = 0;
    await setData((current) => {
      const patched = patchClientCatalogColors(current, colorsBySourceUrl);
      updated = patched.updated;
      return patched.nextData;
    });

    if (singleItemId && activeSelectedItem?.id === singleItemId) {
      const key = String(activeSelectedItem.sourceUrl || "").trim().toLowerCase();
      const nextColors = colorsBySourceUrl.get(key);
      if (nextColors?.length) {
        setSelectedItem((current) =>
          current?.id === singleItemId
            ? { ...current, colors: enrichCatalogColors(nextColors) }
            : current
        );
      }
    }

    logActivity?.(
      logLabel,
      `${items.length} article(s)`,
      `${updated} mis à jour, ${failed} échec(s)`
    );

    return { updated, failed };
  }

  async function refreshItemColors(item) {
    if (!isLmdtSourceUrl(item?.sourceUrl)) {
      showToast("Couleurs disponibles uniquement pour les articles LMDT.", "warning");
      return;
    }

    const probe = await probeCatalogApi();
    if (probe.status !== "ok") {
      showToast(probe.message || "API catalogue indisponible.", "error");
      return;
    }

    setRefreshingItemColorsId(item.id);
    try {
      const results = await refreshCatalogColors([item.sourceUrl]);
      const { updated } = await applyColorRefreshResults([item], results, {
        logLabel: "Rafraîchissement couleurs article",
        singleItemId: item.id,
      });

      if (updated > 0) {
        showToast("Couleurs mises à jour depuis la fiche produit.", "success");
      } else {
        showToast("Aucune couleur récupérée — vérifiez npm run bank.", "warning");
      }
    } catch (error) {
      showToast(error.message || "Rafraîchissement des couleurs impossible.", "error");
    } finally {
      setRefreshingItemColorsId(null);
    }
  }

  async function refreshAllCatalogColors() {
    const lmdtItems = catalogItems.filter((item) => isLmdtSourceUrl(item.sourceUrl));

    if (!lmdtItems.length) {
      showToast("Aucun article La Maison du Tee-shirt à rafraîchir.", "warning");
      return;
    }

    const probe = await probeCatalogApi();
    if (probe.status !== "ok") {
      showToast(probe.message || "API catalogue indisponible.", "error");
      return;
    }

    setRefreshingColors(true);
    try {
      const results = await refreshCatalogColors(lmdtItems.map((item) => item.sourceUrl));
      const { updated, failed } = await applyColorRefreshResults(lmdtItems, results, {
        logLabel: "Rafraîchissement couleurs catalogue",
      });

      if (updated > 0) {
        showToast(`${updated} fiche(s) couleurs mises à jour.`, "success");
      } else if (failed > 0) {
        showToast("Aucune couleur récupérée — vérifiez npm run bank.", "warning");
      } else {
        showToast("Les couleurs étaient déjà à jour.", "info");
      }
    } catch (error) {
      showToast(error.message || "Rafraîchissement des couleurs impossible.", "error");
    } finally {
      setRefreshingColors(false);
    }
  }

  async function refreshPackshotImages() {
    const lmdtItems = catalogItems.filter((item) => isLmdtSourceUrl(item.sourceUrl));

    if (!lmdtItems.length) {
      showToast("Aucun article La Maison du Tee-shirt à rafraîchir.", "warning");
      return;
    }

    const probe = await probeCatalogApi();
    if (probe.status !== "ok") {
      showToast(probe.message || "API catalogue indisponible.", "error");
      return;
    }

    setRefreshingPackshots(true);
    try {
      const results = await refreshCatalogImages(lmdtItems.map((item) => item.sourceUrl));
      const { updated, failed } = await applyPackshotResults(lmdtItems, results, {
        logLabel: "Rafraîchissement images packshot",
      });

      if (updated > 0) {
        showToast(`${updated} image(s) packshot mises à jour.`, "success");
      } else if (failed > 0) {
        showToast("Aucune image packshot récupérée — vérifiez npm run bank.", "warning");
      } else {
        showToast("Les images étaient déjà à jour.", "info");
      }
    } catch (error) {
      showToast(error.message || "Rafraîchissement impossible.", "error");
    } finally {
      setRefreshingPackshots(false);
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

  async function createSelectionFromPicker(event) {
    event.preventDefault();

    if (!selectedItemIds.length) {
      showToast("Sélectionnez au moins un article.", "warning");
      return;
    }

    const title = selectionForm.title.trim();
    if (!title) {
      showToast("Indiquez un titre pour la sélection.", "warning");
      return;
    }

    const products = catalogItems.filter((item) => selectedItemIds.includes(item.id));
    const selection = createCatalogSelectionPayload({
      title,
      products,
      clientName: selectionForm.clientName.trim(),
      message: selectionForm.message.trim(),
      settings: data.settings || {},
    });

    setCreatingSelection(true);
    try {
      const nextSelections = [selection, ...selections];
      setData({ ...data, catalogSelections: nextSelections });
      await upsertCatalogSelection(selection);
      await copyLink(selection);
      logActivity?.("Création sélection catalogue client", selection.title, selection.id);
      setSelectedItemIds([]);
      setSelectionForm({ title: "", clientName: "", message: "" });
      showToast("Sélection créée — lien copié.", "success");
    } catch (error) {
      showToast(error.message || "Création impossible.", "error");
    } finally {
      setCreatingSelection(false);
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

  async function updateCatalogItemImage(itemId, imageUrl) {
    await setData((prev) => patchClientCatalogItemImage(prev, itemId, imageUrl));
    setSelectedItem((current) =>
      current?.id === itemId ? { ...current, imageUrl } : current
    );
    const item = catalogItems.find((entry) => entry.id === itemId);
    logActivity?.("Image catalogue client", item?.name || itemId, "");
    showToast("Image mise à jour", "success");
  }

  function handleColorSwatchClick(index, color) {
    const isActive = selectedColorIndex === index;
    if (isActive) {
      setSelectedColorIndex(null);
      return;
    }

    const colorImage = resolveCatalogColorImageUrl(color);
    const hex = resolveCatalogColorHex(color);
    if (!colorImage && hex) {
      showToast("Actualiser couleurs pour voir le modèle", "warning");
    }
    setSelectedColorIndex(index);
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
        <div className="page-header-actions">
          <button
            type="button"
            className="primary"
            onClick={refreshAllCatalogColors}
            disabled={refreshingColors || catalogItems.length === 0}
          >
            <RefreshCw size={16} className={refreshingColors ? "spin" : ""} />
            {refreshingColors ? "Couleurs…" : "Rafraîchir couleurs"}
          </button>
          <button
            type="button"
            className="primary"
            onClick={refreshPackshotImages}
            disabled={refreshingPackshots || catalogItems.length === 0}
          >
            <RefreshCw size={16} className={refreshingPackshots ? "spin" : ""} />
            {refreshingPackshots ? "Rafraîchissement…" : "Rafraîchir images packshot"}
          </button>
          <button type="button" className="primary" onClick={refreshFromCloud}>
            <Link2 size={16} />
            Sync cloud
          </button>
        </div>
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
              <strong>Recherche & tri</strong>
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

            <div className="catalog-client-browser">
              <nav className="catalog-folder-nav card" aria-label="Dossiers catalogue">
                <div className="catalog-folder-nav-header">
                  <strong>Dossiers</strong>
                  <span>{catalogItems.length} article(s)</span>
                </div>
                <button
                  type="button"
                  className={`catalog-folder-btn ${folderFilter === CATALOG_FOLDER_ALL ? "is-active" : ""}`}
                  onClick={() => setFolderFilter(CATALOG_FOLDER_ALL)}
                >
                  <span>Tous</span>
                  <span className="catalog-folder-count">{catalogItems.length}</span>
                </button>
                {CATALOG_CLIENT_FOLDERS.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    className={`catalog-folder-btn ${folderFilter === folder ? "is-active" : ""}`}
                    onClick={() => setFolderFilter(folder)}
                  >
                    <span>{folder}</span>
                    <span className="catalog-folder-count">{folderCounts[folder] || 0}</span>
                  </button>
                ))}
                {(folderCounts[CATALOG_FOLDER_OTHER] || 0) > 0 ? (
                  <button
                    type="button"
                    className={`catalog-folder-btn ${folderFilter === CATALOG_FOLDER_OTHER ? "is-active" : ""}`}
                    onClick={() => setFolderFilter(CATALOG_FOLDER_OTHER)}
                  >
                    <span>{CATALOG_FOLDER_OTHER}</span>
                    <span className="catalog-folder-count">
                      {folderCounts[CATALOG_FOLDER_OTHER] || 0}
                    </span>
                  </button>
                ) : null}
              </nav>

            <div className="products-erp-layout">
              <div className="product-premium-grid">
                {filteredCatalogItems.map((item) => {
                  const itemFolder = resolveCatalogFolder(item);
                  return (
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
                      <span>{itemFolder}</span>
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
                  );
                })}
            </div>

            <aside className="product-side-card card">
              {!activeSelectedItem ? (
                <div className="product-side-empty">
                  <strong>Sélectionne un article</strong>
                  <span>La fiche détaillée apparaîtra ici.</span>
                </div>
              ) : (
                <>
                  <CatalogImageDropZone
                    key={`${activeSelectedItem.id}-${selectedColorIndex ?? "default"}-${sidePanelImageUrl}`}
                    className="product-side-image"
                    imageUrl={sidePanelImageUrl}
                    placeholder={(activeSelectedItem.name || "A").slice(0, 1).toUpperCase()}
                    onImageChange={(imageUrl) =>
                      updateCatalogItemImage(activeSelectedItem.id, imageUrl)
                    }
                  />

                  <div className="product-side-header">
                    <div>
                      <h2>{activeSelectedItem.name}</h2>
                      <span>
                        {resolveCatalogFolder(activeSelectedItem)}
                        {activeSelectedItem.sku ? ` · SKU ${activeSelectedItem.sku}` : ""}
                      </span>
                    </div>
                  </div>

                  {(activeSelectedItem.brand ||
                    activeSelectedItem.grammage ||
                    activeSelectedItem.minOrderQty ||
                    activeSelectedColors.length) && (
                    <div className="product-side-desc">
                      <strong>Informations</strong>
                      {activeSelectedItem.brand ? <p>Marque : {activeSelectedItem.brand}</p> : null}
                      {activeSelectedItem.category ? (
                        <p>Catégorie LMDT : {activeSelectedItem.category}</p>
                      ) : null}
                      {activeSelectedItem.grammage ? (
                        <p>Grammage : {activeSelectedItem.grammage}</p>
                      ) : null}
                      {activeSelectedItem.minOrderQty ? (
                        <p>Commande minimum : x{activeSelectedItem.minOrderQty}</p>
                      ) : null}
                      {activeSelectedColors.length ? (
                        <div className="catalog-color-section">
                          <div className="catalog-color-section-header">
                            <p className="catalog-color-section-title">
                              Couleurs ({activeSelectedColors.length})
                            </p>
                            {isLmdtSourceUrl(activeSelectedItem.sourceUrl) ? (
                              <button
                                type="button"
                                className="catalog-color-refresh-btn"
                                onClick={() => refreshItemColors(activeSelectedItem)}
                                disabled={refreshingItemColorsId === activeSelectedItem.id}
                              >
                                <RefreshCw
                                  size={12}
                                  className={
                                    refreshingItemColorsId === activeSelectedItem.id ? "spin" : ""
                                  }
                                />
                                Actualiser couleurs
                              </button>
                            ) : null}
                          </div>
                          <div className="catalog-color-swatches catalog-color-swatches--prominent">
                            {activeSelectedColors.slice(0, 48).map((color, index) => {
                              const label = resolveCatalogColorLabel(color);
                              const hex = resolveCatalogColorHex(color);
                              const hasColorImage = Boolean(resolveCatalogColorImageUrl(color));
                              const isActive = selectedColorIndex === index;
                              return (
                                <button
                                  type="button"
                                  key={`${label}-${index}`}
                                  className={`catalog-color-swatch catalog-color-swatch--circle${
                                    isActive ? " is-active" : ""
                                  }${hasColorImage ? " has-image" : ""}`}
                                  title={label}
                                  aria-label={`Couleur : ${label}`}
                                  aria-pressed={isActive}
                                  onClick={() => handleColorSwatchClick(index, color)}
                                >
                                  <span
                                    className="catalog-color-swatch-dot"
                                    style={{ backgroundColor: hex || "#cbd5e1" }}
                                  />
                                  <span className="catalog-color-swatch-label">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {activeSelectedDescription ? (
                    <div className="product-side-desc">
                      <strong>Description</strong>
                      <p>{activeSelectedDescription}</p>
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
            </div>
          </>
        )}
      </div>

      {selectedItemIds.length > 0 ? (
        <form className="card catalog-selection-form" onSubmit={createSelectionFromPicker}>
          <h3>Créer une sélection client ({selectedItemIds.length} article(s))</h3>
          <div className="catalog-selection-form-grid">
            <label>
              Titre de la sélection *
              <input
                required
                value={selectionForm.title}
                onChange={(event) =>
                  setSelectionForm({ ...selectionForm, title: event.target.value })
                }
                placeholder="Ex. Projet club 2026"
              />
            </label>
            <label>
              Nom du client
              <input
                value={selectionForm.clientName}
                onChange={(event) =>
                  setSelectionForm({ ...selectionForm, clientName: event.target.value })
                }
                placeholder="Ex. AS Sportive"
              />
            </label>
          </div>
          <label>
            Message pour le client
            <textarea
              rows={2}
              value={selectionForm.message}
              onChange={(event) =>
                setSelectionForm({ ...selectionForm, message: event.target.value })
              }
              placeholder="Instructions ou contexte pour le client..."
            />
          </label>
          <button type="submit" className="primary" disabled={creatingSelection}>
            {creatingSelection ? "Création..." : "Générer le lien catalogue"}
          </button>
        </form>
      ) : null}

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
