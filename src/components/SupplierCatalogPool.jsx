import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { resolveActiveCatalogItems } from "../utils/catalogCollections";
import { showToast } from "../utils/toast";

function money(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SupplierCatalogPool({
  data,
  onPromote,
  targetLabel = "catalogue",
  promoteLabel = "Ajouter",
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const supplierItems = resolveActiveCatalogItems(data.supplierCatalogItems);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return supplierItems.slice(0, 60);
    return supplierItems
      .filter((item) =>
        [item.name, item.sku, item.category, item.brand]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 60);
  }, [supplierItems, search]);

  function toggleItem(itemId) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredItems.map((item) => item.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }

  async function handlePromote() {
    if (!selectedIds.length) {
      showToast("Sélectionnez au moins un article du pool fournisseur.", "warning");
      return;
    }
    await onPromote?.(selectedIds);
    setSelectedIds([]);
  }

  if (!supplierItems.length) {
    return (
      <section className="card">
        <h3>Pool fournisseur</h3>
        <p className="page-subtitle">
          Aucun article importé. Allez dans « Import fournisseur » pour scraper un site
          (La Maison du Tee-shirt, etc.).
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>Ajouter depuis le pool fournisseur ({supplierItems.length})</h3>
      <p className="page-subtitle">
        Sélectionnez des articles déjà importés pour les copier vers {targetLabel}.
      </p>

      <label>
        Rechercher
        <div className="catalog-import-results-header">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, SKU, catégorie..."
          />
          <Search size={16} />
        </div>
      </label>

      <div className="catalog-import-results-header">
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={
              filteredItems.length > 0 &&
              filteredItems.every((item) => selectedIds.includes(item.id))
            }
            onChange={toggleAllVisible}
          />
          Tout sélectionner ({filteredItems.length} visible(s))
        </label>
        <button type="button" className="primary" onClick={handlePromote}>
          <ArrowRight size={16} />
          {promoteLabel} ({selectedIds.length})
        </button>
      </div>

      <div className="catalog-import-grid">
        {filteredItems.map((item) => (
          <label key={item.id} className="catalog-import-item">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleItem(item.id)}
            />
            <div className="catalog-import-item-media">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} loading="lazy" />
              ) : (
                <div className="catalog-import-placeholder">Sans image</div>
              )}
            </div>
            <div className="catalog-import-item-body">
              <strong>{item.name}</strong>
              <span>{item.category}</span>
              <span>{item.sku}</span>
              <span>{money(item.price)} € HT</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
