import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, Mail, Trash2, X } from "lucide-react";
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
  resolveProductMinQuantity,
  resolveProductSizeOptions,
} from "../utils/catalogShare";
import { stripSourceFromDescription } from "../utils/catalogDescription";
import {
  enrichCatalogColors,
  resolveCatalogColorHex,
  resolveCatalogColorLabel,
} from "../utils/colorNameToHex";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

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

  if (!enriched.length) {
    return (
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex. Blanc"
      />
    );
  }

  return (
    <div className="client-catalog-color-picker">
      <div className="client-catalog-color-swatches">
        {enriched.map((color, index) => {
          const label = resolveCatalogColorLabel(color);
          const hex = resolveCatalogColorHex(color);
          const isActive = value === label;
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              className={`client-catalog-color-swatch${isActive ? " is-active" : ""}`}
              title={label}
              aria-label={`Couleur : ${label}`}
              aria-pressed={isActive}
              onClick={() => onChange(label)}
            >
              <span
                className="client-catalog-color-dot"
                style={{ backgroundColor: hex || "#cbd5e1" }}
              />
              <span className="client-catalog-color-label">{label}</span>
            </button>
          );
        })}
      </div>
      <select value={value || enriched[0]?.name || ""} onChange={(event) => onChange(event.target.value)}>
        {enriched.map((color, index) => {
          const label = resolveCatalogColorLabel(color);
          return (
            <option key={`${label}-${index}`} value={label}>
              {label}
            </option>
          );
        })}
      </select>
    </div>
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
  const [ficheText, setFicheText] = useState("");
  const [contact, setContact] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    notes: "",
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const loadedSelection = await fetchPublicCatalogSelection(shareId);
        if (!active) return;

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
        if (!active) return;

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

        const initialDrafts = {};
        for (const product of visibleProducts) {
          initialDrafts[product.id] = createDraftForProduct(product);
        }
        setDrafts(initialDrafts);

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
        if (!active) return;
        setError(loadError.message || "Impossible de charger le catalogue.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [shareId]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const recipientEmail = useMemo(
    () => resolveCatalogRecipientEmail(selection),
    [selection]
  );

  function updateDraft(productId, patch) {
    setDrafts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...patch,
      },
    }));
  }

  function addToCart(productId) {
    const product = productsById.get(productId);
    const draft = drafts[productId];
    if (!product || !draft) return;

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
  }

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
      showToast("Votre sélection a été enregistrée. Merci !", "success");
    } catch (submitError) {
      showToast(submitError.message || "Envoi impossible.", "error");
    } finally {
      setSubmitting(false);
    }
  }

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
            <div className="client-catalog-grid">
              {products.map((product) => {
                const draft = drafts[product.id] || createDraftForProduct(product);
                const sizes = resolveProductSizeOptions(product);
                const minQty = resolveProductMinQuantity(product);
                const description = product.description
                  ? stripSourceFromDescription(product.description).split("\n")[0]
                  : "";

                return (
                  <article key={product.id} className="client-catalog-card">
                    <div className="client-catalog-card-media">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} loading="lazy" />
                      ) : (
                        <div className="catalog-import-placeholder">Sans image</div>
                      )}
                    </div>
                    <div className="client-catalog-card-body">
                      <h3>{product.name}</h3>
                      <p>{product.category}</p>
                      {product.sku ? <p className="client-catalog-sku">Réf. {product.sku}</p> : null}
                      {description ? (
                        <p className="client-catalog-description">{description}</p>
                      ) : null}
                      {product.minOrderQty ? (
                        <p className="client-catalog-min-qty">
                          Commande minimum : x{product.minOrderQty}
                        </p>
                      ) : null}

                      <div className="client-catalog-fields">
                        <label>
                          Couleur
                          <ClientColorPicker
                            colors={product.colors}
                            value={draft.color}
                            onChange={(color) => updateDraft(product.id, { color })}
                          />
                        </label>
                        <label>
                          Taille
                          <select
                            value={draft.size || sizes[0]}
                            onChange={(event) =>
                              updateDraft(product.id, { size: event.target.value })
                            }
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
                              updateDraft(product.id, {
                                quantity: Math.max(
                                  minQty,
                                  Number(event.target.value) || minQty
                                ),
                              })
                            }
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        className="primary client-catalog-add-btn"
                        onClick={() => addToCart(product.id)}
                      >
                        Ajouter à ma sélection
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="client-catalog-cart card">
              <div className="client-catalog-cart-header">
                <h2>Ma sélection ({cart.length})</h2>
                {cart.length ? (
                  <button
                    type="button"
                    className="client-catalog-clear-btn"
                    onClick={() => setCart([])}
                  >
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
                            onClick={() => removeCartLine(line.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="client-catalog-cart-item-fields">
                          <label>
                            Couleur
                            <input
                              value={line.color || ""}
                              onChange={(event) =>
                                updateCartLine(line.id, { color: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            Taille
                            <select
                              value={line.size || sizes[0]}
                              onChange={(event) =>
                                updateCartLine(line.id, { size: event.target.value })
                              }
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
                                updateCartLine(line.id, {
                                  quantity: Math.max(
                                    minQty,
                                    Number(event.target.value) || minQty
                                  ),
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
                <button
                  type="button"
                  className="primary"
                  disabled={!cart.length}
                  onClick={openFicheModal}
                >
                  Générer ma fiche produit
                </button>
              </div>
            </aside>

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
