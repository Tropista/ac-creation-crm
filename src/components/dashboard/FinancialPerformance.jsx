import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { INVOICE_PERIOD_MODES } from "../../utils/invoicePeriodStats";
import { money } from "../../utils/money";

const euro = (value) => money(value || 0);
const rate = (value) => `${Number(value || 0).toLocaleString("fr-LU", { maximumFractionDigits: 1 })} %`;

function ResultCard({ title, result, detail, annual = false }) {
  const positive = result.resultHT >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;
  return (
    <article className={`financial-result-card ${positive ? "is-positive" : "is-negative"}`}>
      <div className="financial-result-card__head">
        <span>{title}</span>
        <TrendIcon size={19} aria-hidden="true" />
      </div>
      <strong>{euro(result.resultHT)}</strong>
      <p>{positive ? "Bénéficiaire" : "Déficitaire"} · marge {rate(result.marginRate)}</p>
      <dl>
        <div><dt>CA HT</dt><dd>{euro(result.revenueHT)}</dd></div>
        <div><dt>Dépenses HT</dt><dd>{euro(result.expensesHT)}</dd></div>
      </dl>
      {annual && detail != null ? (
        <em className={detail >= 0 ? "is-positive" : "is-negative"}>
          {detail >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {euro(Math.abs(detail))} vs année précédente
        </em>
      ) : null}
    </article>
  );
}

function MetricCard({ label, value, detail, danger = false }) {
  return <article className={`financial-metric ${danger ? "is-danger" : ""}`}><span>{label}</span><strong>{value}</strong>{detail ? <em>{detail}</em> : null}</article>;
}

export default function FinancialPerformance({
  performance,
  billingPeriodMode,
  setBillingPeriodMode,
  billingMonthValue,
  setBillingMonthValue,
  billingYear,
  setBillingYear,
  billingYearOptions,
}) {
  const { selected, annual, monthly, financeBreakdown, monthlyGoal, forecast } = performance;
  const trendData = monthly.map((row) => ({
    ...row,
    positiveResultHT: row.resultHT >= 0 ? row.resultHT : null,
    negativeResultHT: row.resultHT < 0 ? row.resultHT : null,
  }));
  const donutData = [
    { name: "Charges", value: Math.max(0, financeBreakdown.purchaseCostHT), color: "#f59e0b" },
    { name: financeBreakdown.resultHT >= 0 ? "Résultat" : "Déficit", value: Math.abs(financeBreakdown.resultHT), color: financeBreakdown.resultHT >= 0 ? "#34d399" : "#fb7185" },
  ].filter((entry) => entry.value > 0);
  const hasDonut = donutData.length > 0;

  return (
    <section className="financial-performance" data-testid="financial-performance">
      <div className="financial-performance__header">
        <div>
          <p className="financial-performance__eyebrow">Dashboard direction</p>
          <h3>Performance financière</h3>
          <p className="muted">Résultat d&apos;exploitation HT : factures moins dépenses enregistrées.</p>
        </div>
        <div className="financial-filters" aria-label="Période financière">
          <div className="financial-segmented" role="group" aria-label="Mode de période">
            {[
              [INVOICE_PERIOD_MODES.MONTH, "Mois"],
              [INVOICE_PERIOD_MODES.YEAR, "Année"],
              [INVOICE_PERIOD_MODES.ALL, "Depuis la création"],
            ].map(([mode, label]) => (
              <button key={mode} type="button" className={billingPeriodMode === mode ? "is-active" : ""} onClick={() => setBillingPeriodMode(mode)}>{label}</button>
            ))}
          </div>
          {billingPeriodMode === INVOICE_PERIOD_MODES.MONTH ? <input type="month" value={billingMonthValue} onChange={(event) => setBillingMonthValue(event.target.value)} aria-label="Mois financier" /> : null}
          {billingPeriodMode === INVOICE_PERIOD_MODES.YEAR ? <select value={billingYear} onChange={(event) => setBillingYear(event.target.value)} aria-label="Année financière">{billingYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select> : null}
        </div>
      </div>

      <div className="financial-results-grid">
        <ResultCard title={billingPeriodMode === INVOICE_PERIOD_MODES.MONTH ? "Résultat du mois" : "Résultat de la période"} result={selected} />
        <ResultCard title="Résultat annuel" result={annual} annual detail={performance.annualResultDeltaHT} />
        <article className="financial-goal-card">
          <div><Target size={19} aria-hidden="true" /><span>Objectif mensuel</span></div>
          <strong>{euro(monthlyGoal.revenueHT)} <small>/ {euro(monthlyGoal.targetHT)}</small></strong>
          <p>{rate(monthlyGoal.progress)} réalisé</p>
          <div className="financial-progress"><i style={{ width: `${Math.min(100, monthlyGoal.progress)}%` }} /></div>
        </article>
      </div>

      <div className="financial-metrics-grid">
        <MetricCard label="Marge brute" value={euro(selected.resultHT)} detail={rate(selected.marginRate)} danger={selected.resultHT < 0} />
        <MetricCard label="Charges de la période" value={euro(selected.expensesHT)} />
        <MetricCard label="Coût moyen par facture" value={euro(selected.averageCostPerInvoice)} />
        <MetricCard label="CA moyen par facture" value={euro(selected.averageRevenuePerInvoice)} />
        <MetricCard label="Dépenses / CA" value={rate(selected.revenueHT ? (selected.expensesHT / selected.revenueHT) * 100 : 0)} />
        <MetricCard label="Résultat estimé TTC" value={euro(performance.resultTtcEstimate)} danger={performance.resultTtcEstimate < 0} />
      </div>

      <div className="financial-visual-grid">
        <article className="financial-panel financial-panel--chart">
          <div className="financial-panel__head"><div><h4>Évolution mensuelle</h4><p>CA, dépenses et résultat HT</p></div><span>{euro(performance.averageMonthlyResultHT)} / mois</span></div>
          <ResponsiveContainer width="100%" height={245}>
            <LineChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgba(255,255,255,.55)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(value / 1000)}k`} tick={{ fontSize: 11, fill: "rgba(255,255,255,.55)" }} axisLine={false} tickLine={false} width={34} />
              <Tooltip formatter={(value) => euro(value)} contentStyle={{ background: "#17102d", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenueHT" name="CA HT" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="expensesHT" name="Dépenses HT" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="positiveResultHT" name="Résultat HT positif" stroke="#34d399" strokeWidth={2.5} dot={false} connectNulls />
              <Line type="monotone" dataKey="negativeResultHT" name="Résultat HT négatif" stroke="#fb7185" strokeWidth={2.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="financial-chart-summary"><span>Meilleur mois <b>{performance.bestMonth.label} · {euro(performance.bestMonth.resultHT)}</b></span><span>Plus faible <b>{performance.worstMonth.label} · {euro(performance.worstMonth.resultHT)}</b></span></div>
        </article>

        <article className="financial-panel financial-panel--donut">
          <div className="financial-panel__head"><div><h4>Répartition financière</h4><p>Sur la période sélectionnée</p></div></div>
          {hasDonut ? <ResponsiveContainer width="100%" height={175}><PieChart><Pie data={donutData} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={3}>{donutData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => euro(value)} /></PieChart></ResponsiveContainer> : <p className="muted">Aucune donnée financière.</p>}
          <dl className="financial-breakdown"><div><dt>CA HT</dt><dd>{euro(financeBreakdown.revenueHT)}</dd></div><div><dt>Coût achats / charges</dt><dd>{euro(financeBreakdown.purchaseCostHT)} · {rate(selected.revenueHT ? (financeBreakdown.purchaseCostHT / selected.revenueHT) * 100 : 0)}</dd></div><div><dt>Résultat</dt><dd className={financeBreakdown.resultHT < 0 ? "is-negative" : "is-positive"}>{euro(financeBreakdown.resultHT)}</dd></div></dl>
        </article>

        <article className="financial-panel">
          <div className="financial-panel__head"><div><h4>Prévision fin d&apos;année</h4><p>Au rythme actuel</p></div></div>
          <dl className="financial-insights"><div><dt>CA moyen mensuel</dt><dd>{euro(forecast.averageRevenueHT)}</dd></div><div><dt>CA projeté</dt><dd>{euro(forecast.projectedRevenueHT)}</dd></div><div><dt>Résultat projeté</dt><dd className={forecast.projectedResultHT < 0 ? "is-negative" : "is-positive"}>{euro(forecast.projectedResultHT)}</dd></div><div><dt>Reste projeté</dt><dd>{euro(forecast.remainingRevenueHT)}</dd></div></dl>
        </article>
      </div>

      {performance.alerts.length > 0 ? <div className="financial-alerts">{performance.alerts.map((alert) => <div key={alert.type} className={`is-${alert.severity}`}><AlertTriangle size={16} /><span>{alert.label}</span></div>)}</div> : null}

      <div className="financial-tables-grid">
        <article className="financial-panel"><h4>Rentabilité par technique</h4><div className="financial-table">{performance.techniquePerformance.map((row) => <div key={row.key}><span>{row.name}</span><span>{euro(row.revenueHT)}</span><span>{euro(row.expensesHT)}</span><strong className={row.resultHT < 0 ? "is-negative" : "is-positive"}>{euro(row.resultHT)} · {rate(row.marginRate)}</strong></div>)}</div></article>
        <article className="financial-panel"><h4>Top clients</h4><div className="financial-table">{performance.clientPerformance.map((row) => <div key={row.clientId}><span>{row.name}</span><span>{euro(row.revenueHT)}</span><strong className={row.resultHT < 0 ? "is-negative" : "is-positive"}>{euro(row.resultHT)} · {rate(row.marginRate)}</strong></div>)}</div></article>
        <article className="financial-panel"><h4>Top produits</h4><div className="financial-table">{performance.productPerformance.map((row) => <div key={row.key}><span>{row.name}</span><span>{euro(row.revenueHT)}</span><span>{euro(row.costHT)}</span><strong className={row.resultHT < 0 ? "is-negative" : "is-positive"}>{euro(row.resultHT)} · {rate(row.marginRate)}</strong></div>)}</div></article>
      </div>
    </section>
  );
}
