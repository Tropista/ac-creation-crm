import { useMemo, useState } from "react";
import { Download, Globe, RefreshCw } from "lucide-react";
import { fetchCatalogApiHealth, scrapeCatalogUrl } from "../utils/catalogApi";
import { importScrapedCatalogItems } from "../utils/lmdtImport";
import { showToast } from "../utils/toast";

function money(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CatalogItemImport({ data, setData, logActivity }) {
  const [url, setUrl] = useState("https://www.lamaisonduteeshirt.com/c-24-tee-shirts");
  const [importAll, setImportAll] = useState(true);
  const [maxPages, setMaxPages] = useState(5);
  const [maxProducts, setMaxProducts] = useState(200);
  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState(null);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selectedUrls, setSelectedUrls] = useState([]);

  const allSelected = products.length > 0 && selectedUrls.length === products.length;

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedUrls.includes(product.sourceUrl)),
    [products, selectedUrls]
  );

  async function checkApi() {
    try {
      await fetchCatalogApiHealth();
      setApiReady(true);
      showToast("API catalogue disponible.", "success");
    } catch {
      setApiReady(false);
      showToast(
        "Lancez l'API locale avec npm run bank (port 3001) pour importer depuis le web.",
        "warning"
      );
    }
  }

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

  function handleImport() {
    if (!selectedProducts.length) {
      showToast("Sélectionnez au moins un article.", "warning");
      return;
    }

    const { nextData, created, updated } = importScrapedCatalogItems(data, selectedProducts);
    setData(nextData);
    logActivity?.(
      "Import catalogue client",
      url,
      `${created} créé(s), ${updated} mis à jour`
    );
    showToast(
      `${created} créé(s), ${updated} mis à jour dans le catalogue client.`,
      "success"
    );
    setProducts([]);
    setMeta(null);
    setSelectedUrls([]);
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
            ? "Le site affiche 16 articles par page. Cochez « Importer toute la catégorie » pour tout récupérer."
            : apiReady
              ? "API catalogue connectée (npm run bank)."
              : "API indisponible — lancez npm run bank."}
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
          {meta.totalResults ? ` — ${meta.totalResults} au total sur le site` : ""}.
        </p>
      ) : null}

      {products.length > 0 ? (
        <div className="catalog-import-results">
          <div className="catalog-import-results-header">
            <label className="checkbox-inline">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Tout sélectionner
            </label>
            <button type="button" className="primary" onClick={handleImport}>
              <Download size={16} />
              Ajouter au catalogue ({selectedProducts.length})
            </button>
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
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
