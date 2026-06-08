import { useMemo, useState } from "react";
import {
  buildMonthlyAccountingCsvRows,
  exportMonthlyAccountingPack,
  formatAccountingMonthInput,
  parseAccountingMonthInput,
} from "../utils/exportCsv";
import { buildFiduciaryExportPack, downloadFiduciaryCsv } from "../utils/fiduciaryExport";
import { showToast } from "../utils/toast";

function useSelectedAccountingPeriod() {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth();
  const [monthValue, setMonthValue] = useState(() =>
    formatAccountingMonthInput(fallbackYear, fallbackMonth)
  );
  const parsed =
    parseAccountingMonthInput(monthValue) ||
    ({ year: fallbackYear, month: fallbackMonth });

  return {
    monthValue,
    setMonthValue,
    year: parsed.year,
    month: parsed.month,
  };
}

function MonthPicker({ id, monthValue, onChange }) {
  return (
    <label className="accounting-export-month" htmlFor={id}>
      <span>Mois</span>
      <input
        id={id}
        type="month"
        value={monthValue}
        onChange={(event) => onChange(event.target.value)}
        data-testid="accounting-export-month"
      />
    </label>
  );
}

export default function MonthlyAccountingExport({
  data,
  logActivity,
  layout = "inline",
  testId,
}) {
  const { monthValue, setMonthValue, year, month } = useSelectedAccountingPeriod();
  const pickerId = `accounting-export-month-${layout}`;

  const preview = useMemo(() => {
    const built = buildMonthlyAccountingCsvRows(data, { year, month });
    if (!built) {
      return { monthLabel: "", invoiceCount: 0, expenseCount: 0 };
    }
    return {
      monthLabel: built.monthLabel,
      invoiceCount: built.invoiceCount,
      expenseCount: built.expenseCount,
      fiduciary: buildFiduciaryExportPack(data, { year, month }),
    };
  }, [data, year, month]);

  function handleExport() {
    const result = exportMonthlyAccountingPack(data, { year, month });
    if (!result) {
      showToast("Impossible de générer l'export comptable.", "error");
      return;
    }
    logActivity?.(
      "Export mensuel comptable",
      `${result.monthLabel} · ${result.invoiceCount} vente(s) · ${result.expenseCount} achat(s)`
    );
    showToast(
      `Export comptable ${result.monthLabel} téléchargé (${result.invoiceCount} vente(s), ${result.expenseCount} achat(s)).`,
      "success"
    );
  }

  function handleFiduciaryExport() {
    const filename = downloadFiduciaryCsv(data, { year, month });
    logActivity?.("Export fiduciaire Luxembourg", filename);
    showToast("Export fiduciaire Luxembourg téléchargé.", "success");
  }

  const controls = (
    <div className="accounting-export-controls" data-testid={testId}>
      <MonthPicker
        id={pickerId}
        monthValue={monthValue}
        onChange={setMonthValue}
      />
      <button type="button" className="primary" onClick={handleExport}>
        Export mensuel comptable
      </button>
      <button type="button" onClick={handleFiduciaryExport}>
        Export fiduciaire LU
      </button>
    </div>
  );

  if (layout === "card") {
    return (
      <>
        <div className="dashboard-action-card__header">
          <div>
            <h3>Export mensuel comptable</h3>
            <p className="muted">
              Pack CSV {preview.monthLabel} : journal des ventes, journal des achats et
              récapitulatif TVA (UTF-8 BOM).
            </p>
          </div>
          {controls}
        </div>
        <p className="muted dashboard-accounting-export__hint">
          {preview.invoiceCount} facture(s) vente · {preview.expenseCount} achat(s) pour
          ce mois
        </p>
      </>
    );
  }

  if (layout === "settings") {
    return (
      <>
        <h3>Export mensuel comptable</h3>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          Pack CSV mensuel (UTF-8 avec BOM) : journal des ventes, journal des achats,
          récapitulatif TVA et colonnes acompte / solde / devis parent.
        </p>
        <div className="accounting-export-controls accounting-export-controls--settings">
          <MonthPicker
            id={pickerId}
            monthValue={monthValue}
            onChange={setMonthValue}
          />
          <button type="button" className="primary" onClick={handleExport}>
            Export mensuel comptable
          </button>
        </div>
        <p className="muted accounting-export-preview">
          {preview.invoiceCount} facture(s) vente · {preview.expenseCount} achat(s) —{" "}
          {preview.monthLabel}
        </p>
      </>
    );
  }

  return controls;
}
