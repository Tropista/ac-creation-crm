import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getExpenseDate } from "../utils/expenseSuppliers";

const ROSE   = "#ec4899";
const ORANGE = "#f97316";
const TEAL   = "#14b8a6";
const BLUE   = "#3b82f6";
const SLATE  = "#94a3b8";

function euroFormatter(value) {
  return `${Number(value || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border, #e5e7eb)",
      borderRadius: 8,
      padding: "16px",
      minHeight: 260,
    }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--text, #111827)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p style={{ color: SLATE, fontSize: 13, margin: 0 }}>{text}</p>;
}

export default function DashboardCharts({
  annualStats,
  processTypeStats = [],
  leads = [],
  quotes = [],
  invoices = [],
  expenses = [],
  year,
}) {
  const safeYear = Number(year) || new Date().getFullYear();

  // ── 1. CA mensuel + dépenses ─────────────────────────────────────────
  const monthlyData = (annualStats?.monthlyRevenue ?? []).map(({ month, label, ht }) => {
    const dep = expenses
      .filter((e) => {
        try {
          const d = getExpenseDate(e);
          return d && d.getFullYear() === safeYear && d.getMonth() === month;
        } catch { return false; }
      })
      .reduce((s, e) => s + Number(e.amountHT || 0), 0);
    return {
      label,
      "CA HT":       Math.round((ht || 0) * 100) / 100,
      "Dépenses HT": Math.round(dep * 100) / 100,
    };
  });

  const hasMonthlyData = monthlyData.some((d) => d["CA HT"] > 0 || d["Dépenses HT"] > 0);

  // ── 2. CA par technique ──────────────────────────────────────────────
  const processData = (processTypeStats || [])
    .filter((p) => (p.revenueHT || 0) > 0)
    .map((p) => ({
      name: p.label || "?",
      "CA HT":    Math.round((p.revenueHT  || 0) * 100) / 100,
      "Marge HT": Math.round((p.marginHT   || 0) * 100) / 100,
    }));

  // ── 3. Entonnoir de conversion ───────────────────────────────────────
  const sentQuotes     = quotes.filter((q) => q.sentAt || ["Envoyé", "Accepté", "Refusé"].includes(q.status));
  const acceptedQuotes = quotes.filter((q) => q.status === "Accepté");
  const funnelData = [
    { name: "Leads",           value: leads.length,          fill: BLUE   },
    { name: "Devis envoyés",   value: sentQuotes.length,     fill: TEAL   },
    { name: "Devis acceptés",  value: acceptedQuotes.length, fill: ROSE   },
    { name: "Factures",        value: invoices.length,       fill: ORANGE },
  ];
  const funnelMax = Math.max(1, ...funnelData.map((d) => d.value));

  // ── 4. Payé / Impayé ─────────────────────────────────────────────────
  let paidTTC = 0;
  let unpaidTTC = 0;
  for (const inv of invoices) {
    const ttc = Number(inv.totalTTC || 0);
    const st  = String(inv.status || "").toLowerCase();
    if (st.includes("payée") || st.includes("payee")) paidTTC   += ttc;
    else                                               unpaidTTC += ttc;
  }
  paidTTC   = Math.round(paidTTC   * 100) / 100;
  unpaidTTC = Math.round(unpaidTTC * 100) / 100;
  const totalTTC = paidTTC + unpaidTTC;
  const pieData  = [
    { name: "Payé",   value: paidTTC,   fill: TEAL },
    { name: "Impayé", value: unpaidTTC, fill: ROSE },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>

      {/* ── Courbe CA 12 mois ── */}
      <ChartCard title={`Évolution mensuelle ${safeYear}`}>
        {!hasMonthlyData ? (
          <Empty text="Aucune facture pour cette année." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={euroFormatter} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="CA HT"       stroke={ROSE}   strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Dépenses HT" stroke={ORANGE} strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── CA par technique ── */}
      <ChartCard title="CA par technique">
        {processData.length === 0 ? (
          <Empty text="Aucune donnée de technique pour la période sélectionnée." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={processData} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} />
              <Tooltip formatter={euroFormatter} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="CA HT"    fill={ROSE} radius={[0, 4, 4, 0]} />
              <Bar dataKey="Marge HT" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Entonnoir de conversion ── */}
      <ChartCard title="Entonnoir de conversion">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
          {funnelData.map((step) => {
            const pct = Math.round((step.value / funnelMax) * 100);
            return (
              <div key={step.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span style={{ color: "var(--text-muted, #6b7280)" }}>{step.name}</span>
                  <strong style={{ color: step.fill }}>{step.value}</strong>
                </div>
                <div style={{ background: "var(--border)", borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${pct}%`, minWidth: pct > 0 ? 4 : 0, background: step.fill, borderRadius: 4, height: "100%", transition: "width .4s" }} />
                </div>
              </div>
            );
          })}
          {leads.length > 0 && acceptedQuotes.length > 0 && (
            <p style={{ fontSize: 11, color: SLATE, margin: "6px 0 0" }}>
              Taux leads → acceptés : <strong>{Math.round((acceptedQuotes.length / leads.length) * 100)} %</strong>
            </p>
          )}
        </div>
      </ChartCard>

      {/* ── Payé / Impayé ── */}
      <ChartCard title="Trésorerie factures TTC">
        {totalTTC === 0 ? (
          <Empty text="Aucune facture enregistrée." />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <PieChart width={150} height={150}>
              <Pie data={pieData} dataKey="value" cx={75} cy={75} innerRadius={38} outerRadius={65} paddingAngle={3}>
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip formatter={euroFormatter} />
            </PieChart>
            <div style={{ flex: 1 }}>
              {pieData.map((entry) => (
                <div key={entry.name} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: entry.fill, display: "inline-block" }} />
                      {entry.name}
                    </span>
                    <strong>{euroFormatter(entry.value)}</strong>
                  </div>
                  <div style={{ background: "var(--border)", borderRadius: 4, height: 6 }}>
                    <div style={{ width: `${Math.round((entry.value / totalTTC) * 100)}%`, background: entry.fill, borderRadius: 4, height: "100%" }} />
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 11, color: SLATE, margin: 0 }}>
                Encaissement : <strong style={{ color: TEAL }}>{Math.round((paidTTC / totalTTC) * 100)} %</strong>
              </p>
            </div>
          </div>
        )}
      </ChartCard>

    </div>
  );
}
