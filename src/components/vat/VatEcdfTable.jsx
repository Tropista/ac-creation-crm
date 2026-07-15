import { boxStatus, boxType, centsMoney } from "./vatUiUtils";

export default function VatEcdfTable({ report, onShowSources }) {
  return (
    <div className="table card vat-table-card">
      <h3>Cases eCDF</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Intitulé</th>
              <th>Montant</th>
              <th>Type</th>
              <th>Statut</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {(report.ecdfBoxes || []).length === 0 && (
              <tr>
                <td colSpan="6" className="muted">Aucune case calculée.</td>
              </tr>
            )}
            {(report.ecdfBoxes || []).map((entry) => (
              <tr key={entry.box}>
                <td><strong>{entry.box}</strong></td>
                <td>{entry.label}</td>
                <td>{centsMoney(entry.amountCents)}</td>
                <td>{boxType(entry.box)}</td>
                <td>{boxStatus(report, entry)}</td>
                <td>
                  <button type="button" onClick={() => onShowSources(entry.box)}>
                    Voir les lignes sources
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
