import { useMemo, useState } from "react";
import { SALE_TAX_CATEGORY } from "../../utils/vatDeclaration";
import { centsMoney, linePartner } from "./vatUiUtils";

const SALE_CATEGORY_OPTIONS = [
  { value: SALE_TAX_CATEGORY.MANUFACTURED_PRODUCT, label: "Produit fabriqué / transformé" },
  { value: SALE_TAX_CATEGORY.RESOLD_GOODS, label: "Marchandise revendue" },
  { value: SALE_TAX_CATEGORY.SERVICE, label: "Prestation de services" },
  { value: SALE_TAX_CATEGORY.FIXED_ASSET_DISPOSAL, label: "Cession d'immobilisation" },
];

function uniqueValues(lines, getter) {
  return [...new Set(lines.map(getter).filter(Boolean))].sort();
}

function saleCategoryLabel(value) {
  return SALE_CATEGORY_OPTIONS.find((option) => option.value === value)?.label || value;
}

export default function VatSourceLinesTable({
  lines = [],
  filters,
  setFilters,
  showOnlyFixes,
  setShowOnlyFixes,
  onUpdateSaleCategories = null,
}) {
  const [selectedSaleIds, setSelectedSaleIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const countries = uniqueValues(lines, (line) => line.country);
  const origins = uniqueValues(lines, (line) => line.vatOrigin);
  const categories = uniqueValues(lines, (line) => line.sale_tax_category || line.category);
  const rates = uniqueValues(lines, (line) => String(line.rate ?? ""));
  const visibleLines = useMemo(() => lines.slice(0, 200), [lines]);
  const editableSaleIds = useMemo(
    () => visibleLines.filter((line) => line.type === "sale").map((line) => String(line.sourceId)),
    [visibleLines]
  );
  const canEditSales = typeof onUpdateSaleCategories === "function" && editableSaleIds.length > 0;
  const selectedVisibleSaleIds = selectedSaleIds.filter((id) => editableSaleIds.includes(id));

  function toggleSaleSelection(sourceId, checked) {
    const id = String(sourceId);
    setSelectedSaleIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((entry) => entry !== id);
    });
  }

  function toggleAllVisibleSales(checked) {
    setSelectedSaleIds((current) => {
      if (!checked) return current.filter((id) => !editableSaleIds.includes(id));
      return [...new Set([...current, ...editableSaleIds])];
    });
  }

  async function updateSaleCategory(sourceIds, category) {
    if (!category || !sourceIds.length) return;
    await onUpdateSaleCategories?.(sourceIds, category);
    const updatedIds = new Set(sourceIds.map(String));
    setSelectedSaleIds((current) => current.filter((id) => !updatedIds.has(id)));
    setBulkCategory("");
  }

  return (
    <div className="table card vat-source-lines">
      <div className="section-title-row">
        <h3>Lignes sources</h3>
        <button
          type="button"
          onClick={() => {
            setFilters((current) => ({ ...current, ecdfBox: "" }));
            setShowOnlyFixes(false);
          }}
        >
          Toutes les lignes
        </button>
      </div>

      <div className="filters-row">
        <input
          className="search"
          placeholder="Rechercher..."
          value={filters.text}
          onChange={(e) => setFilters((current) => ({ ...current, text: e.target.value }))}
        />
        <select value={filters.type} onChange={(e) => setFilters((current) => ({ ...current, type: e.target.value }))}>
          <option value="">Vente / dépense</option>
          <option value="sale">Ventes</option>
          <option value="expense">Dépenses</option>
        </select>
        <select value={filters.country} onChange={(e) => setFilters((current) => ({ ...current, country: e.target.value }))}>
          <option value="">Pays</option>
          {countries.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.origin} onChange={(e) => setFilters((current) => ({ ...current, origin: e.target.value }))}>
          <option value="">Origine</option>
          {origins.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.category} onChange={(e) => setFilters((current) => ({ ...current, category: e.target.value }))}>
          <option value="">Catégorie</option>
          {categories.map((value) => <option key={value} value={value}>{saleCategoryLabel(value)}</option>)}
        </select>
        <select value={filters.rate} onChange={(e) => setFilters((current) => ({ ...current, rate: e.target.value }))}>
          <option value="">Taux</option>
          {rates.map((value) => <option key={value} value={value}>{value} %</option>)}
        </select>
        <input
          placeholder="Case eCDF"
          value={filters.ecdfBox}
          onChange={(e) => setFilters((current) => ({ ...current, ecdfBox: e.target.value }))}
        />
        <label className="checkbox-line">
          <input
            type="checkbox"
            checked={showOnlyFixes}
            onChange={(e) => setShowOnlyFixes(e.target.checked)}
          />
          Éléments à corriger
        </label>
      </div>

      {canEditSales ? (
        <div className="filters-row">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={selectedVisibleSaleIds.length > 0 && selectedVisibleSaleIds.length === editableSaleIds.length}
              onChange={(e) => toggleAllVisibleSales(e.target.checked)}
            />
            Sélectionner les ventes visibles
          </label>
          <select
            aria-label="Catégorie à appliquer aux ventes sélectionnées"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
          >
            <option value="">Catégorie à appliquer</option>
            {SALE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bulkCategory || selectedVisibleSaleIds.length === 0}
            onClick={() => updateSaleCategory(selectedVisibleSaleIds, bulkCategory)}
          >
            Appliquer aux lignes sélectionnées
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {canEditSales ? <th>Choix</th> : null}
              <th>Date</th>
              <th>Type</th>
              <th>Numéro</th>
              <th>Client/Fournisseur</th>
              <th>Pays</th>
              <th>Description</th>
              <th>HT</th>
              <th>Taux</th>
              <th>TVA</th>
              <th>TTC</th>
              <th>Catégorie</th>
              <th>Origine</th>
              <th>Type UE</th>
              <th>Déductibilité</th>
              <th>Statut</th>
              <th>Cases</th>
              <th>Anomalies</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={canEditSales ? 18 : 17} className="muted">Aucune ligne source.</td>
              </tr>
            )}
            {visibleLines.map((line) => {
              const isEditableSale = canEditSales && line.type === "sale";
              const sourceId = String(line.sourceId);
              const saleCategory = line.sale_tax_category || "";
              return (
                <tr key={line.id}>
                  {canEditSales ? (
                    <td>
                      {isEditableSale ? (
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${line.number || line.sourceId}`}
                          checked={selectedSaleIds.includes(sourceId)}
                          onChange={(e) => toggleSaleSelection(sourceId, e.target.checked)}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                  ) : null}
                  <td>{line.date || "-"}</td>
                  <td>{line.type === "sale" ? "Vente" : "Dépense"}</td>
                  <td>{line.number || line.sourceId}</td>
                  <td>{linePartner(line)}</td>
                  <td>{line.country || "-"}</td>
                  <td>{line.description || "-"}</td>
                  <td>{centsMoney(line.htCents)}</td>
                  <td>{line.rate ?? "-"} %</td>
                  <td>{centsMoney(line.vatCents)}</td>
                  <td>{centsMoney(line.ttcCents)}</td>
                  <td>
                    {isEditableSale ? (
                      <select
                        aria-label={`Catégorie fiscale ${line.number || line.sourceId}`}
                        value={saleCategory === SALE_TAX_CATEGORY.TO_REVIEW ? "" : saleCategory}
                        onChange={(e) => updateSaleCategory([line.sourceId], e.target.value)}
                      >
                        <option value="">À vérifier</option>
                        {SALE_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      saleCategoryLabel(line.sale_tax_category || line.category || "-")
                    )}
                  </td>
                  <td>{line.vatOrigin || "-"}</td>
                  <td>{line.euTransactionType || "-"}</td>
                  <td>{line.deductiblePercentage ?? "-"} %</td>
                  <td>{line.officialExcluded ? "exclu" : line.anomalies?.length ? "à vérifier" : "calculé"}</td>
                  <td>{(line.ecdfBoxes || []).join(", ") || "-"}</td>
                  <td>{(line.anomalies || []).map((entry) => entry.code).join(", ") || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lines.length > 200 ? <p className="muted">Affichage limité aux 200 premières lignes filtrées.</p> : null}
    </div>
  );
}
