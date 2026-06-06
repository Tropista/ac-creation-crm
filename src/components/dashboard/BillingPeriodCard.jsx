import DashboardStatCard from "./DashboardStatCard";
import { INVOICE_PERIOD_MODES } from "../../utils/invoicePeriodStats";
import { money } from "../../utils/money";

export default function BillingPeriodCard({
  billingPeriodMode,
  setBillingPeriodMode,
  billingMonthValue,
  setBillingMonthValue,
  billingYear,
  setBillingYear,
  billingPeriodLabel,
  billingYearOptions,
  periodInvoiceTotals,
  processTypeStats,
  canManageInvoices,
  goToInvoices,
}) {
  return (
    <div
      className="card dashboard-billing-period"
      data-testid="dashboard-billing-period"
    >
      <div className="dashboard-billing-period__head">
        <div>
          <h3>Facturation</h3>
          <p className="muted">
            Montants TTC pour la période : {billingPeriodLabel}
            {periodInvoiceTotals.count > 0
              ? ` · ${periodInvoiceTotals.count} facture(s)`
              : ""}
          </p>
        </div>
        <div className="dashboard-period-tabs" role="tablist" aria-label="Période">
          <button
            type="button"
            role="tab"
            aria-selected={billingPeriodMode === INVOICE_PERIOD_MODES.MONTH}
            className={billingPeriodMode === INVOICE_PERIOD_MODES.MONTH ? "active" : ""}
            onClick={() => setBillingPeriodMode(INVOICE_PERIOD_MODES.MONTH)}
          >
            Mois
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={billingPeriodMode === INVOICE_PERIOD_MODES.YEAR}
            className={billingPeriodMode === INVOICE_PERIOD_MODES.YEAR ? "active" : ""}
            onClick={() => setBillingPeriodMode(INVOICE_PERIOD_MODES.YEAR)}
          >
            Année
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={billingPeriodMode === INVOICE_PERIOD_MODES.ALL}
            className={billingPeriodMode === INVOICE_PERIOD_MODES.ALL ? "active" : ""}
            onClick={() => setBillingPeriodMode(INVOICE_PERIOD_MODES.ALL)}
          >
            Depuis la création
          </button>
        </div>
      </div>
      <div className="dashboard-billing-period__controls">
        {billingPeriodMode === INVOICE_PERIOD_MODES.MONTH && (
          <label className="accounting-export-month" htmlFor="dashboard-billing-month">
            <span>Mois</span>
            <input
              id="dashboard-billing-month"
              type="month"
              value={billingMonthValue}
              onChange={(event) => setBillingMonthValue(event.target.value)}
              data-testid="dashboard-billing-month"
            />
          </label>
        )}
        {billingPeriodMode === INVOICE_PERIOD_MODES.YEAR && (
          <label className="accounting-export-month" htmlFor="dashboard-billing-year">
            <span>Année</span>
            <select
              id="dashboard-billing-year"
              value={billingYear}
              onChange={(event) => setBillingYear(event.target.value)}
              data-testid="dashboard-billing-year"
            >
              {billingYearOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="stats dashboard-billing-period__stats">
        <DashboardStatCard
          label="Total facturé"
          value={money(periodInvoiceTotals.billedTTC)}
          detail={`TTC · ${billingPeriodLabel}`}
          onClick={() => goToInvoices()}
        />
        <DashboardStatCard
          label="Total payé"
          value={money(periodInvoiceTotals.paidTTC)}
          detail={`TTC · ${billingPeriodLabel}`}
          onClick={() => goToInvoices("paid")}
        />
        <DashboardStatCard
          label="À encaisser"
          value={money(periodInvoiceTotals.unpaidTTC)}
          detail={`TTC · ${billingPeriodLabel}`}
          className={periodInvoiceTotals.unpaidTTC > 0 ? "stat--danger" : ""}
          onClick={() => goToInvoices("unpaid")}
        />
      </div>
      {canManageInvoices && processTypeStats.length > 0 ? (
        <div
          className="dashboard-process-stats"
          data-testid="dashboard-process-stats"
        >
          <h4>CA et marge par technique ({billingPeriodLabel})</h4>
          <ul className="dashboard-process-stats__list">
            {processTypeStats.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.label}</strong>
                <span>{entry.count} facture(s)</span>
                <span>{money(entry.revenueHT)} HT</span>
                <span className={entry.marginHT < 0 ? "stat--danger" : ""}>
                  Marge {money(entry.marginHT)} HT
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
