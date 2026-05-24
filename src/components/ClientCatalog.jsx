import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicCatalogProducts,
  fetchPublicCatalogSelection,
  submitPublicCatalogSelection,
} from "../services/catalogService";
import { APP_LOGO_URL } from "../utils/assets";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

export default function ClientCatalog() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [contact, setContact] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    notes: "",
  });
  const [choices, setChoices] = useState({});

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

        setSelection(loadedSelection);
        setProducts(loadedProducts.filter((product) => product && !product.archived));

        if (!loadedProducts.length) {
          setError(
            "Aucun produit dans cette sélection. Recréez la sélection dans le CRM après avoir importé des produits."
          );
          return;
        }
        setSubmitted(loadedSelection.status === "submitted");

        const initialChoices = {};
        for (const product of loadedProducts) {
          initialChoices[product.id] = {
            selected: false,
            quantity: 1,
            color: product.colors?.[0] || "",
            size: "M",
          };
        }
        setChoices(initialChoices);
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

  const selectedChoices = useMemo(
    () =>
      products
        .filter((product) => choices[product.id]?.selected)
        .map((product) => ({
          productId: product.id,
          quantity: Number(choices[product.id]?.quantity) || 1,
          color: choices[product.id]?.color || "",
          size: choices[product.id]?.size || "",
        })),
    [products, choices]
  );

  function updateChoice(productId, patch) {
    setChoices((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        ...patch,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedChoices.length) {
      showToast("Sélectionnez au moins un produit.", "warning");
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
        choices: selectedChoices,
      });
      setSubmitted(true);
      showToast("Votre sélection a été envoyée. Merci !", "success");
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
          </div>
        ) : (
          <form className="client-catalog-form" onSubmit={handleSubmit}>
            <div className="client-catalog-grid">
              {products.map((product) => {
                const choice = choices[product.id] || {};
                return (
                  <article
                    key={product.id}
                    className={`client-catalog-card ${choice.selected ? "is-selected" : ""}`}
                  >
                    <label className="client-catalog-select">
                      <input
                        type="checkbox"
                        checked={Boolean(choice.selected)}
                        onChange={(event) =>
                          updateChoice(product.id, { selected: event.target.checked })
                        }
                      />
                      Choisir
                    </label>
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
                      {product.description ? (
                        <p className="client-catalog-description">{product.description.split("\n")[0]}</p>
                      ) : null}

                      <div className="client-catalog-fields">
                        <label>
                          Quantité
                          <input
                            type="number"
                            min="1"
                            value={choice.quantity || 1}
                            onChange={(event) =>
                              updateChoice(product.id, {
                                quantity: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </label>
                        <label>
                          Taille
                          <select
                            value={choice.size || "M"}
                            onChange={(event) =>
                              updateChoice(product.id, { size: event.target.value })
                            }
                          >
                            {SIZE_OPTIONS.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Couleur
                          {product.colors?.length ? (
                            <select
                              value={choice.color || product.colors[0]}
                              onChange={(event) =>
                                updateChoice(product.id, { color: event.target.value })
                              }
                            >
                              {product.colors.map((color) => (
                                <option key={color} value={color}>
                                  {color}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={choice.color || ""}
                              onChange={(event) =>
                                updateChoice(product.id, { color: event.target.value })
                              }
                              placeholder="Ex. Blanc"
                            />
                          )}
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

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
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? "Envoi..." : `Envoyer ma sélection (${selectedChoices.length})`}
              </button>
            </section>
          </form>
        )}
      </div>
    </div>
  );
}
