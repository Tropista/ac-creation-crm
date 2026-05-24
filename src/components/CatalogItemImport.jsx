import { useEffect, useMemo, useState } from "react";
import { Download, Globe, RefreshCw } from "lucide-react";
import { getCatalogApiUrl, probeCatalogApi, scrapeCatalogUrl } from "../utils/catalogApi";
import { importScrapedToCollection } from "../utils/lmdtImport";
import { decodeLmdtMediaPath } from "../utils/lmdtImages";
import { SUPPLIER_CATALOG_KEY } from "../utils/catalogCollections";
import { showToast } from "../utils/toast";

function imagePathDebug(url = "") {
  const decoded = decodeLmdtMediaPath(url);
  if (!decoded) return "";
  const parts = decoded.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function money(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CatalogItemImport({
  data,
  setData,
  logActivity,
  targetCollection = SUPPLIER_CATALOG_KEY,
  saveLabel = "Ajouter au pool fournisseur",
  logAction = "Import fournisseur",
  successMessage = "pool fournisseur",
  secondaryTargetCollection = null,
  secondarySaveLabel = "Ajouter au catalogue client",
  secondaryLogAction = "Import catalogue client",
  secondarySuccessMessage = "catalogue client",
}) {
  const [url, setUrl] = useState("https://www.lamaisonduteeshirt.com/c-24-tee-shirts");
  const [importAll, setImportAll] = useState(true);
  const [maxPages, setMaxPages] = useState(5);
  const [maxProducts, setMaxProducts] = useState(200);
  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState(null);
  const [apiMessage, setApiMessage] = useState("");
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selectedUrls, setSelectedUrls] = useState([]);

  const allSelected = products.length > 0 && selectedUrls.length === products.length;

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedUrls.includes(product.sourceUrl)),
    [products, selectedUrls]
  );

  async function checkApi({ silent = false } = {}) {
    const probe = await probeCatalogApi();
    setApiMessage(probe.message || "");

    if (probe.status === "ok") {
      setApiReady(true);
      if (!silent) {
        showToast("API catalogue disponible.", "success");
      }
      return probe;
    }

    setApiReady(false);
    if (!silent) {
      showToast(
        probe.message ||
          `Lancez l'API locale avec npm run bank (${getCatalogApiUrl()}) pour importer depuis le web.`,
        probe.status === "outdated" ? "error" : "warning"
      );
    }
    return probe;
  }

  useEffect(() => {
    checkApi({ silent: true });
  }, []);

  async function handlePreview(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const result = await scrapeCatalogUrl({
        url,
        maxPages: importAll ? undefined : maxPages,
        maxProducts: importAll ? undefined : maxProducts,
        importAll,
      });
      setProducts(result.products || []);
      setMeta(result.meta || null);
      setSelectedUrls((result.products || []).map((product) => product.sourceUrl));
      showToast(`${result.products?.length || 0} article(s) trouvé(s).`, "success");
      setApiReady(true);
    } catch (error) {
      setApiReady(false);
      showToast(error.message || "Import impossible.", "error");
    } finally {
      setLoading(false);
    }
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedUrls([]);
      return;
    }
    setSelectedUrls(products.map((product) => product.sourceUrl));
  }

  function toggleProduct(sourceUrl) {
    setSelectedUrls((current) =>
      current.includes(sourceUrl)
        ? current.filter((item) => item !== sourceUrl)
        : [...current, sourceUrl]
    );
  }

  async function importToCollection(collectionKey, actionLabel, messageLabel) {
    if (!selectedProducts.length) {
      showToast("Sélectionnez au moins un article.", "warning");
      return;
    }

    let created = 0;
    let updated = 0;

    await setData((current) => {
      const result = importScrapedToCollection(current, selectedProducts, collectionKey);
      created = result.created;
      updated = result.updated;
      return result.nextData;
    });

    await logActivity?.(
      actionLabel,
      url,
      `${created} créé(s), ${updated} mis à jour`
    );
    showToast(
      `${created} créé(s), ${updated} mis à jour dans le ${messageLabel}.`,
      "success"
    );
    setProducts([]);
    setMeta(null);
    setSelectedUrls([]);
  }

  function handleImport() {
    return importToCollection(targetCollection, logAction, successMessage);
  }

  function handleSecondaryImport() {
    if (!secondaryTargetCollection) return;
    return importToCollection(
      secondaryTargetCollection,
      secondaryLogAction,
      secondarySuccessMessage
    );
  }

  return (
    <section className="card catalog-import-form">
      <h3>Importer depuis le web</h3>
      <p className="page-subtitle">
        Articles fournisseur (La Maison du Tee-shirt, etc.) — séparés de vos produits internes.
      </p>

      <div className={`catalog-api-banner ${apiReady === false ? "is-error" : apiReady ? "is-ok" : ""}`}>
        <Globe size={18} />
        <span>
          {apiReady === null
            ? `Vérification de l'API locale (${getCatalogApiUrl()})…`
            : apiReady
              ? `API catalogue connectée (${getCatalogApiUrl()}).`
              : apiMessage ||
                `API indisponible sur ${getCatalogApiUrl()} — lancez npm run bank dans un autre terminal.`}
        </span>
        <button type="button" className="primary" onClick={checkApi}>
          <RefreshCw size={16} />
          Tester
        </button>
      </div>

      <form onSubmit={handlePreview}>
        <label>
          URL de la page
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.lamaisonduteeshirt.com/c-24-tee-shirts"
            required
          />
        </label>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={importAll}
            onChange={(event) => setImportAll(event.target.checked)}
          />
          Importer toute la catégorie (toutes les pages)
        </label>

        {!importAll ? (
          <div className="catalog-import-options">
            <label>
              Pages max
              <input
                type="number"
                min="1"
                max="100"
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              Articles max
              <input
                type="number"
                min="1"
                max="2000"
                value={maxProducts}
                onChange={(event) => setMaxProducts(Number(event.target.value) || 200)}
              />
            </label>
          </div>
        ) : null}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "Analyse en cours..." : importAll ? "Analyser toute la catégorie" : "Analyser la page"}
        </button>
      </form>

      {meta ? (
        <p className="catalog-import-meta">
          {meta.totalFound} article(s) sur {meta.pagesScraped} page(s)
          {meta.totalResults ? ` — ${meta.totalResults} au total sur le site` : ""}
          {meta.parserVersion ? ` — parseur v${meta.parserVersion}` : ""}.
        </p>
      ) : null}

      {products.length > 0 ? (
        <div className="catalog-import-results">
          <div className="catalog-import-results-header">
            <label className="checkbox-inline">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Tout sélectionner
            </label>
            <div className="catalog-import-actions">
              <button type="button" className="primary" onClick={handleImport}>
                <Download size={16} />
                {saveLabel} ({selectedProducts.length})
              </button>
              {secondaryTargetCollection ? (
                <button type="button" className="primary" onClick={handleSecondaryImport}>
                  <Download size={16} />
                  {secondarySaveLabel} ({selectedProducts.length})
                </button>
              ) : null}
            </div>
          </div>

          <div className="catalog-import-grid">
            {products.map((product) => (
              <label key={product.sourceUrl} className="catalog-import-item">
                <input
                  type="checkbox"
                  checked={selectedUrls.includes(product.sourceUrl)}
                  onChange={() => toggleProduct(product.sourceUrl)}
                />
                <div className="catalog-import-item-media">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} loading="lazy" />
                  ) : (
                    <div className="catalog-import-placeholder">Sans image</div>
                  )}
                </div>
                <div className="catalog-import-item-body">
                  <strong>{product.name}</strong>
                  <span>{product.category}</span>
                  <span>{product.sku}</span>
                  <span>{money(product.priceHT)} € HT · {product.colorCount} couleur(s)</span>
                  {product.imageKind ? (
                    <span className="catalog-import-image-kind">{product.imageKind}</span>
                  ) : null}
                  {product.imageUrl ? (
                    <span className="catalog-import-image-path" title={decodeLmdtMediaPath(product.imageUrl)}>
                      {imagePathDebug(product.imageUrl)}
                    </span>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
