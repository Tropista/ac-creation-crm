import { useState } from "react";
import { collectAnnualYears, computeAnnualStats } from "../../utils/annualStats";
import { money } from "../../utils/money";

export default function AnnualStatsCard({ quotes, invoices, expenses, data }) {
  const [annualStatsYear, setAnnualStatsYear] = useState(() =>
    String(new Date().getFullYear())
  );

  const annualYearOptions = collectAnnualYears(quotes, invoices, expenses);
  const annualStats = computeAnnualStats({
    quotes,
    invoices,
    expenses,
    data,
    year: Number(annualStatsYear) || new Date().getFullYear(),
  });

  return (
    <div className="card dashboard-annual-stats" data-testid="dashboard-annual-stats">
      <div className="dashboard-annual-stats__head">
        <div>
          <h3>Statistiques annuelles</h3>
          <p className="muted">
            CA HT, marge, taux d&apos;acceptation des devis et top clients.
          </p>
        </div>
        <label className="accounting-export-month" htmlFor="dashboard-annual-year">
          <span>Année</span>
          <select
            id="dashboard-annual-year"
            value={annualStatsYear}
            onChange={(event) => setAnnualStatsYear(event.target.value)}
            data-testid="dashboard-annual-year"
          >
            {annualYearOptions.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-annual-stats__kpis">
        <div>
          <span className="muted">CA HT</span>
          <strong>{money(annualStats.revenueHT)}</strong>
        </div>
        <div>
          <span className="muted">Marge HT</span>
          <strong className={annualStats.marginHT < 0 ? "stat--danger" : ""}>
            {money(annualStats.marginHT)}
          </strong>
        </div>
        <div>
          <span className="muted">Taux acceptation devis</span>
          <strong>
            {annualStats.acceptance.rate == null
              ? "—"
              : `${Math.round(annualStats.acceptance.rate * 100)} %`}
          </strong>
          <em className="stat-detail">
            {annualStats.acceptance.acceptedCount}/{annualStats.acceptance.sentCount} acceptés
          </em>
        </div>
      </div>
      <div className="dashboard-annual-stats__grid">
        <div>
          <h4>CA HT par mois</h4>
          <ul className="dashboard-annual-monthly">
            {annualStats.monthlyRevenue.map((entry) => (
              <li key={entry.month}>
                <span>{entry.label}</span>
                <strong>{money(entry.ht)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Top clients</h4>
          {annualStats.topClients.length === 0 ? (
            <p className="muted">Aucune facture sur cette année.</p>
          ) : (
            <ul className="dashboard-annual-top-clients">
              {annualStats.topClients.map((client) => (
                <li key={client.clientId}>
                  <span>{client.name}</span>
                  <strong>{money(client.revenueHT)} HT</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
