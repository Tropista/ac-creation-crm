import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, Copy, Mail, ShoppingBag, Trash2, X } from "lucide-react";
import {
  fetchPublicCatalogProducts,
  fetchPublicCatalogSelection,
  submitPublicCatalogSelection,
} from "../services/catalogService";
import { APP_LOGO_URL } from "../utils/assets";
import {
  buildCatalogMailtoUrl,
  buildCatalogProductSheet,
  resolveCatalogRecipientEmail,
  resolveProductDisplayImage,
  resolveProductMinQuantity,
  resolveProductSizeOptions,
} from "../utils/catalogShare";
import { stripSourceFromDescription } from "../utils/catalogDescription";
import {
  enrichCatalogColors,
  resolveCatalogColorHex,
  resolveCatalogColorLabel,
} from "../utils/colorNameToHex";
import {
  CATALOG_AUDIENCES,
  CATALOG_AUDIENCE_ALL,
  CATALOG_AUDIENCE_UNISEXE,
  CATALOG_CLIENT_FOLDERS,
  CATALOG_FOLDER_ALL,
  CATALOG_FOLDER_OTHER,
  countItemsByFolder,
  resolveCatalogAudience,
  resolveCatalogFolder,
} from "../utils/catalogCategoryFolders";
import {
  filterProductsByAudience,
  filterProductsByFolder,
  buildPageNumbers,
  CLIENT_CATALOG_PAGE_SIZE,
  getTotalPages,
  paginateItems,
} from "../utils/clientCatalogBrowse";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

const CATALOG_LOAD_TIMEOUT_MS = 45000;

function createLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDraftForProduct(product) {
  const colors = enrichCatalogColors(product.colors || []);
  const sizes = resolveProductSizeOptions(product);
  const minQty = resolveProductMinQuantity(product);
  return {
    color: colors.length ? resolveCatalogColorLabel(colors[0]) : "",
    size: sizes.includes("M") ? "M" : sizes[0] || "M",
    quantity: minQty,
  };
}

function ClientColorPicker({ colors, value, onChange }) {
  const enriched = enrichCatalogColors(colors);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!enriched.length) {
    return (
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex. Blanc"
      />
    );
  }

  const selected =
    enriched.find((color) => resolveCatalogColorLabel(color) === value) || enriched[0];
  const selectedLabel = resolveCatalogColorLabel(selected);
  const selectedHex = resolveCatalogColorHex(selected);

  return (
    <div className="client-catalog-color-picker" ref={rootRef}>
      <button
        type="button"
        className="client-catalog-color-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Couleur : ${selectedLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className="client-catalog-color-dot"
          style={{ backgroundColor: selectedHex || "#cbd5e1" }}
          aria-hidden="true"
        />
        <span className="client-catalog-color-trigger-label">{selectedLabel}</span>
        <ChevronDown size={16} className="client-catalog-color-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <ul className="client-catalog-color-menu" role="listbox" aria-label="Couleurs disponibles">
          {enriched.map((color, index) => {
            const label = resolveCatalogColorLabel(color);
            const hex = resolveCatalogColorHex(color);
            const isActive = value === label;
            return (
              <li key={`${label}-${index}`} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`client-catalog-color-option${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(label);
                    setOpen(false);
                  }}
                >
                  <span
                    className="client-catalog-color-dot"
                    style={{ backgroundColor: hex || "#cbd5e1" }}
                    aria-hidden="true"
                  />
                  <span className="client-catalog-color-option-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const ClientProductCard = memo(function ClientProductCard({
  product,
  draft,
  onUpdateDraft,
  onAddToCart,
}) {
  const sizes = resolveProductSizeOptions(product);
  const minQty = resolveProductMinQuantity(product);
  const description = product.description
    ? stripSourceFromDescription(product.description).split("\n")[0]
    : "";
  const displayImage = resolveProductDisplayImage(product, draft.color);
  const itemFolder = resolveCatalogFolder(product);
  const itemAudience = resolveCatalogAudience(product);

  return (
    <article className="client-catalog-card">
      <div className="client-catalog-card-media">
        {displayImage ? (
          <img src={displayImage} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          <div className="catalog-import-placeholder">Sans image</div>
        )}
        {itemAudience !== CATALOG_AUDIENCE_UNISEXE ? (
          <span className="client-catalog-audience-badge">{itemAudience}</span>
        ) : null}
      </div>
      <div className="client-catalog-card-body">
        <h3>{product.name}</h3>
        <p className="client-catalog-category">{itemFolder}</p>
        {product.sku ? <p className="client-catalog-sku">Réf. {product.sku}</p> : null}
        {description ? <p className="client-catalog-description">{description}</p> : null}
        {product.minOrderQty ? (
          <p className="client-catalog-min-qty">Commande minimum : x{product.minOrderQty}</p>
        ) : null}

        <div className="client-catalog-fields">
          <label>
            Couleur
            <ClientColorPicker
              colors={product.colors}
              value={draft.color}
              onChange={(color) => onUpdateDraft(product.id, { color })}
            />
          </label>
          <label>
            Taille
            <select
              value={draft.size || sizes[0]}
              onChange={(event) => onUpdateDraft(product.id, { size: event.target.value })}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantité
            <input
              type="number"
              min={minQty}
              value={draft.quantity || minQty}
              onChange={(event) =>
                onUpdateDraft(product.id, {
                  quantity: Math.max(minQty, Number(event.target.value) || minQty),
                })
              }
            />
          </label>
        </div>

        <button
          type="button"
          className="primary client-catalog-add-btn"
          onClick={() => onAddToCart(product.id)}
        >
          Ajouter à ma sélection
        </button>
      </div>
    </article>
  );
});

function ClientCatalogCartPanel({
  cart,
  productsById,
  onClear,
  onRemoveLine,
  onUpdateLine,
  onGenerateFiche,
}) {
  return (
    <>
      <div className="client-catalog-cart-header">
        <h2>Ma sélection ({cart.length})</h2>
        {cart.length ? (
          <button type="button" className="client-catalog-clear-btn" onClick={onClear}>
            Tout effacer
          </button>
        ) : null}
      </div>

      {cart.length === 0 ? (
        <p className="client-catalog-cart-empty">
          Parcourez les articles et cliquez sur « Ajouter à ma sélection ».
        </p>
      ) : (
        <ul className="client-catalog-cart-list">
          {cart.map((line) => {
            const product = productsById.get(line.productId);
            const sizes = resolveProductSizeOptions(product);
            const minQty = resolveProductMinQuantity(product);
            return (
              <li key={line.id} className="client-catalog-cart-item">
                <div className="client-catalog-cart-item-head">
                  <strong>{product?.name || "Article"}</strong>
                  <button
                    type="button"
                    className="client-catalog-icon-btn"
                    aria-label="Retirer"
                    onClick={() => onRemoveLine(line.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="client-catalog-cart-item-fields">
                  <label>
                    Couleur
                    <ClientColorPicker
                      colors={product?.colors}
                      value={line.color}
                      onChange={(color) => onUpdateLine(line.id, { color })}
                    />
                  </label>
                  <label>
                    Taille
                    <select
                      value={line.size || sizes[0]}
                      onChange={(event) => onUpdateLine(line.id, { size: event.target.value })}
                    >
                      {sizes.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qté
                    <input
                      type="number"
                      min={minQty}
                      value={line.quantity || minQty}
                      onChange={(event) =>
                        onUpdateLine(line.id, {
                          quantity: Math.max(minQty, Number(event.target.value) || minQty),
                        })
                      }
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="client-catalog-cart-actions">
        <button type="button" className="primary" disabled={!cart.length} onClick={onGenerateFiche}>
          Générer ma fiche produit
        </button>
      </div>
    </>
  );
}

export default function ClientCatalog() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cart, setCart] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [showFicheModal, setShowFicheModal] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [ficheText, setFicheText] = useState("");
  const [folderFilter, setFolderFilter] = useState(CATALOG_FOLDER_ALL);
  const [audienceFilter, setAudienceFilter] = useState(CATALOG_AUDIENCE_ALL);
  const [currentPage, setCurrentPage] = useState(1);
  const [contact, setContact] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    notes: "",
  });

  useEffect(() => {
    let active = true;
    let timedOut = false;

    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      timedOut = true;
      setError(
        "Le chargement du catalogue a pris trop de temps. Le serveur est peut-être surchargé — réessayez dans un instant."
      );
      setLoading(false);
    }, CATALOG_LOAD_TIMEOUT_MS);

    async function load() {
      setLoading(true);
      setError("");

      try {
        const loadedSelection = await fetchPublicCatalogSelection(shareId);
        if (!active || timedOut) return;

        if (!loadedSelection) {
          setError("Ce catalogue n'existe pas ou n'est plus disponible.");
          setSelection(null);
          setProducts([]);
          return;
        }

        const loadedProducts = await fetchPublicCatalogProducts(
          loadedSelection,
          loadedSelection.productIds || []
        );
        if (!active || timedOut) return;

        const visibleProducts = loadedProducts.filter((product) => product && !product.archived);
        setSelection(loadedSelection);
        setProducts(visibleProducts);

        if (!visibleProducts.length) {
          setError(
            "Aucun produit dans cette sélection. Recréez la sélection dans le CRM après avoir importé des produits."
          );
          return;
        }

        setSubmitted(loadedSelection.status === "submitted");

        const submission = loadedSelection.clientSubmission;
        if (submission?.clientName) {
          setContact({
            clientName: submission.clientName || "",
            clientEmail: submission.clientEmail || "",
            clientPhone: submission.clientPhone || "",
            notes: submission.notes || "",
          });
        } else if (loadedSelection.clientName) {
          setContact((current) => ({
            ...current,
            clientName: loadedSelection.clientName,
          }));
        }
      } catch (loadError) {
        if (!active || timedOut) return;
        setError(loadError.message || "Impossible de charger le catalogue.");
      } finally {
        if (active && !timedOut) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [shareId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [folderFilter, audienceFilter]);

  useEffect(() => {
    if (!showCartDrawer) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") setShowCartDrawer(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showCartDrawer]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const folderCounts = useMemo(() => countItemsByFolder(products), [products]);

  const folderScopedProducts = useMemo(
    () => filterProductsByFolder(products, folderFilter, resolveCatalogFolder),
    [products, folderFilter]
  );

  const filteredProducts = useMemo(() => {
    const byFolder = filterProductsByFolder(products, folderFilter, resolveCatalogFolder);
    return filterProductsByAudience(byFolder, audienceFilter, resolveCatalogAudience);
  }, [products, folderFilter, audienceFilter]);

  const totalPages = useMemo(
    () => getTotalPages(filteredProducts.length, CLIENT_CATALOG_PAGE_SIZE),
    [filteredProducts.length]
  );

  const paginatedProducts = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    return paginateItems(filteredProducts, safePage, CLIENT_CATALOG_PAGE_SIZE);
  }, [filteredProducts, currentPage, totalPages]);

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      let changed = false;
      for (const product of paginatedProducts) {
        if (!next[product.id]) {
          next[product.id] = createDraftForProduct(product);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [paginatedProducts]);

  const pageNumbers = useMemo(
    () => buildPageNumbers(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const paginationFrom = filteredProducts.length
    ? (Math.min(currentPage, totalPages) - 1) * CLIENT_CATALOG_PAGE_SIZE + 1
    : 0;
  const paginationTo = filteredProducts.length
    ? Math.min(Math.min(currentPage, totalPages) * CLIENT_CATALOG_PAGE_SIZE, filteredProducts.length)
    : 0;

  const recipientEmail = useMemo(
    () => resolveCatalogRecipientEmail(selection),
    [selection]
  );

  const updateDraft = useCallback((productId, patch) => {
    setDrafts((current) => {
      const product = products.find((entry) => entry.id === productId);
      const base = current[productId] || (product ? createDraftForProduct(product) : {});
      return {
        ...current,
        [productId]: {
          ...base,
          ...patch,
        },
      };
    });
  }, [products]);

  const addToCart = useCallback(
    (productId) => {
      const product = products.find((entry) => entry.id === productId);
      if (!product) return;

      const draft = drafts[productId] || createDraftForProduct(product);
      if (!drafts[productId]) {
        setDrafts((current) => ({ ...current, [productId]: draft }));
      }

      const minQty = resolveProductMinQuantity(product);
      const quantity = Math.max(minQty, Number(draft.quantity) || minQty);

      setCart((current) => [
        ...current,
        {
          id: createLineId(),
          productId,
          color: draft.color || "",
          size: draft.size || "",
          quantity,
        },
      ]);
      showToast(`${product.name} ajouté à votre sélection.`, "success");
    },
    [products, drafts]
  );

  function updateCartLine(lineId, patch) {
    setCart((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }

  function removeCartLine(lineId) {
    setCart((current) => current.filter((line) => line.id !== lineId));
  }

  function buildChoicesFromCart() {
    return cart.map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity) || 1,
      color: line.color || "",
      size: line.size || "",
    }));
  }

  function buildSheetText() {
    return buildCatalogProductSheet({
      selection,
      lines: cart,
      productsById,
      contact,
      includePrice: false,
    });
  }

  function openFicheModal() {
    if (!cart.length) {
      showToast("Ajoutez au moins un article à votre sélection.", "warning");
      return;
    }
    if (!contact.clientName.trim()) {
      showToast("Indiquez votre nom avant de générer la fiche.", "warning");
      return;
    }
    setFicheText(buildSheetText());
    setShowFicheModal(true);
    setShowCartDrawer(false);
  }

  async function copyFicheText(text = ficheText) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Fiche copiée dans le presse-papiers.", "success");
      return true;
    } catch {
      showToast("Copie impossible — sélectionnez le texte manuellement.", "warning");
      return false;
    }
  }

  function sendFicheByEmail() {
    const text = ficheText || buildSheetText();
    if (!recipientEmail) {
      copyFicheText(text);
      showToast(
        "Email AC Creation non configuré — la fiche a été copiée. Collez-la dans votre message.",
        "info"
      );
      return;
    }

    window.location.href = buildCatalogMailtoUrl({
      recipientEmail,
      selection,
      bodyText: text,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!cart.length) {
      showToast("Ajoutez au moins un article à votre sélection.", "warning");
      return;
    }

    if (!contact.clientName.trim()) {
      showToast("Indiquez votre nom.", "warning");
      return;
    }

    setSubmitting(true);
    try {
      await submitPublicCatalogSelection(shareId, {
        ...contact,
        choices: buildChoicesFromCart(),
        productSheet: buildSheetText(),
      });
      setSubmitted(true);
      setShowCartDrawer(false);
      showToast("Votre sélection a été enregistrée. Merci !", "success");
    } catch (submitError) {
      showToast(submitError.message || "Envoi impossible.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function renderProductCard(product) {
    const draft = drafts[product.id] || createDraftForProduct(product);

    return (
      <ClientProductCard
        key={product.id}
        product={product}
        draft={draft}
        onUpdateDraft={updateDraft}
        onAddToCart={addToCart}
      />
    );
  }

  function renderFolderNav() {
    return (
      <nav className="client-catalog-folder-nav" aria-label="Catégories produits">
        <div className="client-catalog-folder-nav-header">
          <strong>Catégories</strong>
          <span>{products.length} article(s)</span>
        </div>
        <div className="client-catalog-folder-nav-list">
          <button
            type="button"
            className={`client-catalog-folder-btn ${folderFilter === CATALOG_FOLDER_ALL ? "is-active" : ""}`}
            onClick={() => setFolderFilter(CATALOG_FOLDER_ALL)}
          >
            <span>Tous</span>
            <span className="client-catalog-folder-count">{products.length}</span>
          </button>
          {CATALOG_CLIENT_FOLDERS.map((folder) => (
            <button
              key={folder}
              type="button"
              className={`client-catalog-folder-btn ${folderFilter === folder ? "is-active" : ""}`}
              onClick={() => setFolderFilter(folder)}
            >
              <span>{folder}</span>
              <span className="client-catalog-folder-count">{folderCounts[folder] || 0}</span>
            </button>
          ))}
          {(folderCounts[CATALOG_FOLDER_OTHER] || 0) > 0 ? (
            <button
              type="button"
              className={`client-catalog-folder-btn ${folderFilter === CATALOG_FOLDER_OTHER ? "is-active" : ""}`}
              onClick={() => setFolderFilter(CATALOG_FOLDER_OTHER)}
            >
              <span>{CATALOG_FOLDER_OTHER}</span>
              <span className="client-catalog-folder-count">
                {folderCounts[CATALOG_FOLDER_OTHER] || 0}
              </span>
            </button>
          ) : null}
        </div>
      </nav>
    );
  }

  function renderAudienceNav() {
    const scopedCount = folderScopedProducts.length;

    return (
      <nav className="client-catalog-audience-nav" aria-label="Public cible">
        <div className="client-catalog-audience-nav-header">
          <strong>Public</strong>
          <span>{scopedCount} article(s)</span>
        </div>
        <div className="client-catalog-audience-nav-list">
          <button
            type="button"
            className={`client-catalog-audience-btn ${audienceFilter === CATALOG_AUDIENCE_ALL ? "is-active" : ""}`}
            onClick={() => setAudienceFilter(CATALOG_AUDIENCE_ALL)}
          >
            <span>Tous</span>
            <span className="client-catalog-audience-count">{scopedCount}</span>
          </button>
          {CATALOG_AUDIENCES.map((audience) => (
            <button
              key={audience}
              type="button"
              className={`client-catalog-audience-btn ${audienceFilter === audience ? "is-active" : ""}`}
              onClick={() => setAudienceFilter(audience)}
            >
              <span>{audience}</span>
              <span className="client-catalog-audience-count">
                {filterProductsByAudience(folderScopedProducts, audience, resolveCatalogAudience).length}
              </span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  function renderPagination() {
    if (filteredProducts.length <= CLIENT_CATALOG_PAGE_SIZE) return null;

    const safePage = Math.min(currentPage, totalPages);

    return (
      <nav className="client-catalog-pagination" aria-label="Pagination des produits">
        <p className="client-catalog-pagination-summary">
          {paginationFrom}–{paginationTo} sur {filteredProducts.length} article(s)
        </p>
        <div className="client-catalog-pagination-controls">
          <button
            type="button"
            className="client-catalog-pagination-btn"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            Précédent
          </button>
          {pageNumbers.map((page) => (
            <button
              key={page}
              type="button"
              className={`client-catalog-pagination-btn client-catalog-pagination-page${
                page === safePage ? " is-active" : ""
              }`}
              aria-current={page === safePage ? "page" : undefined}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          <button
            type="button"
            className="client-catalog-pagination-btn"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            Suivant
          </button>
        </div>
      </nav>
    );
  }

  const cartPanelProps = {
    cart,
    productsById,
    onClear: () => setCart([]),
    onRemoveLine: removeCartLine,
    onUpdateLine: updateCartLine,
    onGenerateFiche: openFicheModal,
  };

  if (loading) {
    return (
      <div className="client-catalog">
        <div className="client-catalog-shell">
          <p>Chargement du catalogue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="client-catalog">
        <div className="client-catalog-shell client-catalog-error">
          <img src={APP_LOGO_URL} alt="AC Creation" className="client-catalog-logo" />
          <h1>Catalogue indisponible</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="client-catalog">
      <div className="client-catalog-shell">
        <header className="client-catalog-header">
          <img src={APP_LOGO_URL} alt="AC Creation" className="client-catalog-logo" />
          <div>
            <p className="client-catalog-kicker">Sélection produits</p>
            <h1>{selection.title}</h1>
            {selection.message ? <p>{selection.message}</p> : null}
          </div>
        </header>

        {submitted ? (
          <div className="client-catalog-success card">
            <h2>Merci, votre choix a été transmis.</h2>
            <p>Nous revenons vers vous rapidement avec un devis.</p>
            {cart.length ? (
              <button type="button" className="primary" onClick={openFicheModal}>
                Voir ma fiche produit
              </button>
            ) : null}
          </div>
        ) : (
          <form className="client-catalog-form" onSubmit={handleSubmit}>
            <div className="client-catalog-layout">
              <div className="client-catalog-main">
                {renderFolderNav()}
                {renderAudienceNav()}

                {filteredProducts.length === 0 ? (
                  <div className="client-catalog-empty-folder card">
                    <strong>Aucun article dans cette catégorie</strong>
                    <span>Essayez une autre catégorie, un autre public ou « Tous ».</span>
                  </div>
                ) : (
                  <>
                    <div className="client-catalog-grid">
                      {paginatedProducts.map((product) => renderProductCard(product))}
                    </div>
                    {renderPagination()}
                  </>
                )}
              </div>

              <aside className="client-catalog-cart client-catalog-cart--sidebar card">
                <ClientCatalogCartPanel {...cartPanelProps} />
              </aside>
            </div>

            <div className="client-catalog-cart-bar" aria-live="polite">
              <button
                type="button"
                className="client-catalog-cart-bar-open"
                onClick={() => setShowCartDrawer(true)}
              >
                <ShoppingBag size={18} aria-hidden="true" />
                <span>Ma sélection ({cart.length})</span>
              </button>
              <button
                type="button"
                className="primary client-catalog-cart-bar-fiche"
                disabled={!cart.length}
                onClick={openFicheModal}
              >
                Générer fiche
              </button>
            </div>

            {showCartDrawer ? (
              <div
                className="client-catalog-cart-drawer-overlay"
                role="presentation"
                onClick={() => setShowCartDrawer(false)}
              >
                <aside
                  className="client-catalog-cart-drawer card"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="client-catalog-drawer-title"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="client-catalog-cart-drawer-header">
                    <h2 id="client-catalog-drawer-title">Ma sélection</h2>
                    <button
                      type="button"
                      className="client-catalog-icon-btn"
                      aria-label="Fermer"
                      onClick={() => setShowCartDrawer(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <ClientCatalogCartPanel {...cartPanelProps} />
                </aside>
              </div>
            ) : null}

            <section className="client-catalog-contact card">
              <h2>Vos coordonnées</h2>
              <div className="client-catalog-contact-grid">
                <label>
                  Nom *
                  <input
                    required
                    value={contact.clientName}
                    onChange={(event) =>
                      setContact({ ...contact, clientName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contact.clientEmail}
                    onChange={(event) =>
                      setContact({ ...contact, clientEmail: event.target.value })
                    }
                  />
                </label>
                <label>
                  Téléphone
                  <input
                    value={contact.clientPhone}
                    onChange={(event) =>
                      setContact({ ...contact, clientPhone: event.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Commentaire
                <textarea
                  rows={3}
                  value={contact.notes}
                  onChange={(event) => setContact({ ...contact, notes: event.target.value })}
                  placeholder="Précisions sur l'impression, livraison, deadline..."
                />
              </label>
              <div className="client-catalog-submit-row">
                <button type="submit" className="primary" disabled={submitting || !cart.length}>
                  {submitting ? "Envoi..." : "Enregistrer ma sélection"}
                </button>
                <button
                  type="button"
                  className="client-catalog-secondary-btn"
                  disabled={!cart.length}
                  onClick={openFicheModal}
                >
                  Générer ma fiche produit
                </button>
              </div>
            </section>
          </form>
        )}

        {showFicheModal ? (
          <div
            className="client-catalog-modal-overlay"
            role="presentation"
            onClick={() => setShowFicheModal(false)}
          >
            <div
              className="client-catalog-modal card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="client-catalog-fiche-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="client-catalog-modal-header">
                <h2 id="client-catalog-fiche-title">Ma fiche produit</h2>
                <button
                  type="button"
                  className="client-catalog-icon-btn"
                  aria-label="Fermer"
                  onClick={() => setShowFicheModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <pre className="client-catalog-fiche-text">{ficheText}</pre>
              <div className="client-catalog-modal-actions">
                <button type="button" className="primary" onClick={sendFicheByEmail}>
                  <Mail size={16} />
                  Envoyer par e-mail
                </button>
                <button type="button" onClick={() => copyFicheText()}>
                  <Copy size={16} />
                  Copier la fiche
                </button>
                {!submitted ? (
                  <button
                    type="button"
                    className="client-catalog-secondary-btn"
                    disabled={submitting}
                    onClick={async () => {
                      if (!contact.clientName.trim()) {
                        showToast("Indiquez votre nom.", "warning");
                        return;
                      }
                      setSubmitting(true);
                      try {
                        await submitPublicCatalogSelection(shareId, {
                          ...contact,
                          choices: buildChoicesFromCart(),
                          productSheet: ficheText || buildSheetText(),
                        });
                        setSubmitted(true);
                        showToast("Sélection enregistrée.", "success");
                      } catch (submitError) {
                        showToast(submitError.message || "Envoi impossible.", "error");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {submitting ? "Enregistrement..." : "Enregistrer dans le CRM"}
                  </button>
                ) : null}
              </div>
              {!recipientEmail ? (
                <p className="client-catalog-modal-hint">
                  Email AC Creation non disponible — utilisez « Copier la fiche » puis envoyez depuis
                  votre messagerie.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
