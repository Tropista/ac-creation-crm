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

export default function VatSummaryCards({ report }) {
  const boxes = Object.fromEntries((report.ecdfBoxes || []).map((box) => [box.box, box.amountCents]));
  const luDeductibleCents = (boxes["077"] || 0) + (boxes["081"] || 0) + (boxes["085"] || 0);
  const balanceCents = report.totals?.balanceCents || 0;
  const reliable = report.is_final_balance_reliable !== false;
  const balanceLabel = balanceCents > 0 ? "Solde TVA" : balanceCents < 0 ? "Crédit de TVA" : "Solde TVA";
  const balanceValue = reliable ? centsMoney(Math.abs(balanceCents)) : "Solde TVA provisoire non disponible";
  const balanceDetail = reliable
    ? "Montant calculé selon les classifications validées."
    : "Des ventes ou dépenses doivent encore être classées avant de calculer un montant fiable.";

  return (
    <div className="stats vat-summary-cards">
      <SummaryCard label="Chiffre d'affaires HT" value={centsMoney(report.totals?.salesHTCents)} tone="neutral" />
      <SummaryCard label="TVA collectée" value={centsMoney(report.totals?.outputVatCents)} tone="neutral" />
      <SummaryCard label="Dépenses HT" value={centsMoney(report.totals?.expensesHTCents)} tone="neutral" />
      <SummaryCard label="TVA déductible LU" value={centsMoney(luDeductibleCents)} tone="success" />
      <SummaryCard label="Acquisitions UE - biens" value={centsMoney(boxes["711"] || 0)} tone="accent" />
      <SummaryCard label="Services UE reçus" value={centsMoney(boxes["741"] || 0)} tone="accent" />
      <SummaryCard label="TVA étrangère" value={centsMoney(report.totals?.foreignVatNonDeductibleCents)} tone="warning" />
      <SummaryCard label={balanceLabel} value={balanceValue} detail={balanceDetail} tone={reliable ? "neutral" : "danger"} />
    </div>
  );
}
