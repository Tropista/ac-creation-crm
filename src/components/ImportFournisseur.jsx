import { Trash2 } from "lucide-react";
import CatalogItemImport from "./CatalogItemImport";
import {
  CLIENT_CATALOG_KEY,
  resolveActiveCatalogItems,
} from "../utils/catalogCollections";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

export default function ImportFournisseur({ data, setData, logActivity }) {
  const supplierItems = resolveActiveCatalogItems(data.supplierCatalogItems);

  function removeItem(itemId) {
    const item = supplierItems.find((entry) => entry.id === itemId);
    if (!item || !confirm(`Retirer « ${item.name} » du pool fournisseur ?`)) return;

    setData({
      ...data,
      supplierCatalogItems: (data.supplierCatalogItems || []).filter(
        (entry) => entry.id !== itemId
      ),
    });
    logActivity?.("Suppression pool fournisseur", item.name, item.sku || "");
    showToast("Article retiré du pool fournisseur.", "success");
  }

  return (
    <div className="catalog-import-page">
      <div className="page-header">
        <div>
          <h2>Import fournisseur</h2>
          <p className="page-subtitle">
            Scrapez un site fournisseur (La Maison du Tee-shirt, etc.) et ajoutez les articles
            au pool fournisseur ou directement au catalogue client. Aucun article n&apos;est
            ajouté à vos produits internes.
          </p>
        </div>
      </div>

      <CatalogItemImport
        data={data}
        setData={setData}
        logActivity={logActivity}
        secondaryTargetCollection={CLIENT_CATALOG_KEY}
      />

      <section className="card">
        <h3>Pool fournisseur ({supplierItems.length})</h3>
        {supplierItems.length === 0 ? (
          <p className="page-subtitle">
            Aucun article importé. Utilisez le formulaire ci-dessus pour analyser une page
            fournisseur.
          </p>
        ) : (
          <div className="catalog-import-grid">
            {supplierItems.slice(0, 48).map((item) => (
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
                <button type="button" className="danger" onClick={() => removeItem(item.id)}>
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        )}
        {supplierItems.length > 48 ? (
          <p className="catalog-import-meta">
            {supplierItems.length - 48} autre(s) article(s) — copiez-les vers le catalogue
            client ou interne.
          </p>
        ) : null}
      </section>
    </div>
  );
}
