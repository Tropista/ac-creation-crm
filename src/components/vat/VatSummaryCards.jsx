import { centsMoney } from "./vatUiUtils";

function SummaryCard({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`card vat-summary-card ${tone}`}>
      <span className="vat-summary-label">{label}</span>
      <strong className="vat-summary-value">{value}</strong>
      {detail ? <small className="muted">{detail}</small> : null}
    </div>
  );
}

function VatResultBreakdown({ report }) {
  const totals = report.totals || {};
  const reliable = report.is_final_balance_reliable !== false;
  const balanceCents = totals.balanceCents || 0;
  const finalLabel = balanceCents < 0 ? "Crédit TVA" : "À payer";
  const finalValue = reliable ? centsMoney(Math.abs(balanceCents)) : "Solde TVA provisoire non disponible";
  const rows = [
    { label: "TVA collectée", value: totals.salesOutputVatCents || 0, sign: "+" },
    { label: "TVA due sur acquisitions UE", value: totals.reverseChargeGoodsVatCents || 0, sign: "+" },
    { label: "TVA due sur services UE", value: totals.reverseChargeServicesVatCents || 0, sign: "+" },
    { label: "TVA déductible Luxembourg", value: totals.luDeductibleVatCents || 0, sign: "-" },
    { label: "TVA déductible sur autoliquidation", value: totals.reverseChargeDeductibleVatCents || 0, sign: "-" },
    { label: "Reports antérieurs éventuels", value: totals.previousVatReportsCents || 0, sign: "-" },
  ];

  return (
    <div className="card vat-result-breakdown">
      <div className="section-title-row">
        <h3>Résultat TVA</h3>
        <span className={`badge ${reliable ? "success" : "error"}`}>
          {reliable ? "Calcul fiable" : "Provisoire"}
        </span>
      </div>
      <div className="vat-result-rows">
        {rows.map((row) => (
          <div key={row.label} className="vat-result-row">
            <span>{row.sign} {row.label}</span>
            <strong>{centsMoney(row.value)}</strong>
          </div>
        ))}
      </div>
      <div className={`vat-result-total ${balanceCents < 0 ? "credit" : "due"}`}>
        <span>{finalLabel}</span>
        <strong>{finalValue}</strong>
      </div>
    </div>
  );
}

export default function VatSummaryCards({ report }) {
  const boxes = Object.fromEntries((report.ecdfBoxes || []).map((box) => [box.box, box.amountCents]));
  const luDeductibleCents = report.totals?.luDeductibleVatCents ?? ((boxes["077"] || 0) + (boxes["081"] || 0) + (boxes["085"] || 0));
  const balanceCents = report.totals?.balanceCents || 0;
  const reliable = report.is_final_balance_reliable !== false;
  const balanceLabel = balanceCents > 0 ? "Solde TVA" : balanceCents < 0 ? "Crédit de TVA" : "Solde TVA";
  const balanceValue = reliable ? centsMoney(Math.abs(balanceCents)) : "Solde TVA provisoire non disponible";
  const balanceDetail = reliable
    ? "Montant calculé selon les classifications validées."
    : "Des ventes ou dépenses doivent encore être classées avant de calculer un montant fiable.";

  return (
    <>
      <div className="stats vat-summary-cards">
        <SummaryCard label="Chiffre d'affaires HT" value={centsMoney(report.totals?.salesHTCents)} tone="neutral" />
        <SummaryCard label="TVA collectée" value={centsMoney(report.totals?.salesOutputVatCents ?? report.totals?.outputVatCents)} tone="neutral" />
        <SummaryCard label="Dépenses HT" value={centsMoney(report.totals?.expensesHTCents)} tone="neutral" />
        <SummaryCard label="TVA déductible LU" value={centsMoney(luDeductibleCents)} tone="success" />
        <SummaryCard label="Acquisitions UE - biens" value={centsMoney(boxes["711"] || 0)} tone="accent" />
        <SummaryCard label="Services UE reçus" value={centsMoney(boxes["741"] || 0)} tone="accent" />
        <SummaryCard label="TVA étrangère" value={centsMoney(report.totals?.foreignVatNonDeductibleCents)} tone="warning" />
        <SummaryCard label={balanceLabel} value={balanceValue} detail={balanceDetail} tone={reliable ? "neutral" : "danger"} />
      </div>
      <VatResultBreakdown report={report} />
    </>
  );
}
