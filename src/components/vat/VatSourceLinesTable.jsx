import { centsMoney, linePartner } from "./vatUiUtils";

function uniqueValues(lines, getter) {
  return [...new Set(lines.map(getter).filter(Boolean))].sort();
}

export default function VatSourceLinesTable({
  lines = [],
  filters,
  setFilters,
  showOnlyFixes,
  setShowOnlyFixes,
}) {
  const countries = uniqueValues(lines, (line) => line.country);
  const origins = uniqueValues(lines, (line) => line.vatOrigin);
  const categories = uniqueValues(lines, (line) => line.sale_tax_category || line.category);
  const rates = uniqueValues(lines, (line) => String(line.rate ?? ""));

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
          {categories.map((value) => <option key={value} value={value}>{value}</option>)}
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

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
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
                <td colSpan="17" className="muted">Aucune ligne source.</td>
              </tr>
            )}
            {lines.slice(0, 200).map((line) => (
              <tr key={line.id}>
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
                <td>{line.sale_tax_category || line.category || "-"}</td>
                <td>{line.vatOrigin || "-"}</td>
                <td>{line.euTransactionType || "-"}</td>
                <td>{line.deductiblePercentage ?? "-"} %</td>
                <td>{line.officialExcluded ? "exclu" : line.anomalies?.length ? "à vérifier" : "calculé"}</td>
                <td>{(line.ecdfBoxes || []).join(", ") || "-"}</td>
                <td>{(line.anomalies || []).map((entry) => entry.code).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > 200 ? <p className="muted">Affichage limité aux 200 premières lignes filtrées.</p> : null}
    </div>
  );
}
