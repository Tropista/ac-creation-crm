import { Trash2 } from "lucide-react";
import SupplierCatalogPool from "./SupplierCatalogPool";
import { INTERNAL_CATALOG_KEY, resolveActiveCatalogItems } from "../utils/catalogCollections";
import { promoteSupplierItemsToCollection } from "../utils/catalogPromote";
import { showToast } from "../utils/toast";
import "../styles/client-catalog.css";

export default function CatalogueInterne({ data, setData, logActivity }) {
  const internalItems = resolveActiveCatalogItems(data.internalCatalogItems);

  async function handlePromote(itemIds) {
    let created = 0;
    let updated = 0;

    await setData((current) => {
      const result = promoteSupplierItemsToCollection(
        current,
        itemIds,
        INTERNAL_CATALOG_KEY
      );
      created = result.created;
      updated = result.updated;
      return result.nextData;
    });

    logActivity?.(
      "Promotion catalogue interne",
      `${itemIds.length} article(s)`,
      `${created} créé(s), ${updated} mis à jour`
    );
    showToast(
      `${created} créé(s), ${updated} mis à jour dans vos références internes.`,
      "success"
    );
  }

  function removeItem(itemId) {
    const item = internalItems.find((entry) => entry.id === itemId);
    if (!item || !confirm(`Retirer « ${item.name} » du catalogue interne ?`)) return;

    setData({
      ...data,
      internalCatalogItems: (data.internalCatalogItems || []).filter(
        (entry) => entry.id !== itemId
      ),
    });
    logActivity?.("Suppression catalogue interne", item.name, item.sku || "");
    showToast("Article retiré du catalogue interne.", "success");
  }

  return (
    <div className="catalog-selections-page">
      <div className="page-header">
        <div>
          <h2>Catalogue interne</h2>
          <p className="page-subtitle">
            Vos références fournisseur pour l&apos;atelier : prix d&apos;achat, specs, infos
            techniques. Séparé des produits CRM et des catalogues client.
          </p>
        </div>
      </div>

      <SupplierCatalogPool
        data={data}
        onPromote={handlePromote}
        targetLabel="le catalogue interne"
        promoteLabel="Ajouter au catalogue interne"
      />

      <section className="card">
        <h3>Mes références ({internalItems.length})</h3>
        {internalItems.length === 0 ? (
          <p className="page-subtitle">
            Aucune référence interne. Ajoutez des articles depuis le pool fournisseur ci-dessus.
          </p>
        ) : (
          <div className="catalog-import-grid">
            {internalItems.map((item) => (
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
                  {item.grammage ? <span>{item.grammage}</span> : null}
                </div>
                <button type="button" className="danger" onClick={() => removeItem(item.id)}>
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
