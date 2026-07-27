import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { money } from "../utils/money";
import { exportVatWorkbook } from "../utils/vatWorkbookExport";
import {
  VAT_WORKBOOK_SHEETS,
  addVatWorkbookSnapshots,
  calculateVatWorkbookDeductible,
  createVatWorkbookPeriod,
  findVatWorkbookPlacement,
  getVatWorkbookDocumentCandidates,
  normalizeVatWorkbookPeriod,
  removeVatWorkbookLine,
  updateVatWorkbookLine,
} from "../utils/vatWorkbook";

const sheetByKey = Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, sheet]));
const ACTIVE_PERIOD_STORAGE_KEY = "ac_creation_active_vat_workbook_period_id";
const euro = (value) => money(Number(value || 0));

function lineValues(line, key) {
  const base = [line.date, line.partner, line.number, line.nature];
  if (key === "achatsLux") return [...base, euro(line.amountHT), `${line.vatRate || 0} %`, euro(line.vatAmount), euro(line.totalTTC)];
  if (key === "chidaLux") return [...base, euro(line.amountCurrency), line.currency, line.exchangeRate, euro(line.amountHT), `${line.vatRate || 0} %`, euro(line.vatAmount), euro(line.totalTTC)];
  if (key === "chidaUeTaxable") return [...base, line.country, line.vatNumber, euro(line.amountCurrency), line.currency, line.exchangeRate, euro(line.amountHT)];
  if (key === "chidaUeExempt") return [line.date, line.partner, line.country, line.nature, euro(line.amountCurrency), line.currency, line.exchangeRate, euro(line.amountHT)];
  if (key === "chidaHue") return [...base, line.country, euro(line.amountCurrency), line.currency, line.exchangeRate, euro(line.amountHT)];
  return [...base, line.country, euro(line.amountCurrency), line.currency, line.exchangeRate, euro(line.amountHT), `${line.vatRate || 0} %`, euro(line.vatAmount), euro(line.totalTTC)];
}

function DeductibleSheet({ period, onChange }) {
  const totals = calculateVatWorkbookDeductible(period);
  const rows = [
    ["Taxe en amont - Biens/Services au Luxembourg", totals.localBase, totals.localVat],
    ["Taxe en amont sur les acquisitions intracommunautaires", totals.aicBase, totals.aicVat],
    ["Taxe en amont sur les importations", totals.importBase, totals.importVat],
    ["Taxe declaree comme debiteur", totals.debtorBase, totals.debtorVat],
  ];
  return <div className="vat-workbook-deductible">
    <label>Prorata general de deduction <input type="number" min="0" max="100" value={period.prorataGeneral} onChange={(event) => onChange({ ...period, prorataGeneral: event.target.value })} /> %</label>
    <table><thead><tr><th>Calcul de la taxe en amont deductible</th><th>Base HTVA</th><th>TVA</th></tr></thead><tbody>
      {rows.map(([label, base, vat]) => <tr key={label}><td>{label}</td><td>{euro(base)}</td><td>{euro(vat)}</td></tr>)}
      <tr><th>Total soumis au prorata</th><td /><th>{euro(totals.subjectToProrata)}</th></tr>
      <tr><th>Total deductible</th><td>(A) x (B)</td><th>{euro(totals.deductible)}</th></tr>
      <tr><th>Total non deductible</th><td /><th>{euro(totals.nonDeductible)}</th></tr>
    </tbody></table>
  </div>;
}

function Selector({ data, period, sheetKey, onClose, onAdd }) {
  const sourceType = sheetByKey[sheetKey].sourceType;
  const [query, setQuery] = useState("");
  const [outside, setOutside] = useState(false);
  const [selected, setSelected] = useState([]);
  const candidates = useMemo(() => getVatWorkbookDocumentCandidates(data, period, sourceType, { includeOutsidePeriod: outside })
    .filter(({ snapshot }) => `${snapshot.partner} ${snapshot.number} ${snapshot.country}`.toLowerCase().includes(query.toLowerCase())), [data, period, sourceType, outside, query]);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const apply = () => {
    const chosen = candidates.filter((candidate) => selected.includes(candidate.sourceId));
    if (chosen.some((candidate) => !candidate.inPeriod) && !window.confirm("Des documents hors periode vont etre ajoutes. Continuer ?")) return;
    onAdd(chosen);
  };
  return <div className="modal-backdrop"><section className="modal vat-workbook-selector">
    <h3>Ajouter des {sourceType === "expense" ? "depenses" : "factures"} du CRM</h3>
    <input placeholder="Rechercher..." value={query} onChange={(event) => setQuery(event.target.value)} />
    <label><input type="checkbox" checked={outside} onChange={(event) => setOutside(event.target.checked)} /> Afficher les documents hors periode</label>
    <div className="toolbar"><button type="button" onClick={() => setSelected(candidates.filter((item) => item.inPeriod).map((item) => item.sourceId))}>Tout selectionner</button><button type="button" onClick={() => setSelected([])}>Tout deselectionner</button></div>
    <div className="table-scroll"><table><thead><tr><th>Choix</th><th>Document</th><th>Partenaire</th><th>Date</th><th>HT</th><th>Annexe recommandee</th><th>Utilisation</th></tr></thead><tbody>
      {candidates.map((item) => { const placement = findVatWorkbookPlacement(period, sourceType, item.sourceId); return <tr key={item.sourceId}><td><input type="checkbox" checked={selected.includes(item.sourceId)} onChange={() => toggle(item.sourceId)} /></td><td>{item.snapshot.number}</td><td>{item.snapshot.partner}</td><td>{item.snapshot.date} {!item.inPeriod ? <span className="badge">Hors periode</span> : null}</td><td>{euro(item.snapshot.amountHT)}</td><td>{sheetByKey[item.recommendedSheet]?.label}</td><td>{placement ? `Deja dans ${sheetByKey[placement.sheetKey]?.label}` : "-"}</td></tr>; })}
    </tbody></table></div>
    <footer><button type="button" onClick={onClose}>Annuler</button><button type="button" onClick={apply}>Ajouter la selection</button></footer>
  </section></div>;
}

export default function VatWorkbook({ data = {}, setData, logActivity }) {
  const periods = useMemo(() => data.vatWorkbookPeriods || [], [data.vatWorkbookPeriods]);
  const [activeVatWorkbookPeriodId, setActiveVatWorkbookPeriodId] = useState(() => window.localStorage?.getItem(ACTIVE_PERIOD_STORAGE_KEY) || "");
  const [active, setActive] = useState("achatsLux");
  const [selector, setSelector] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setActiveVatWorkbookPeriodId((current) => periods.some((item) => item.id === current) ? current : periods[0]?.id || "");
  }, [periods]);
  useEffect(() => {
    if (activeVatWorkbookPeriodId) window.localStorage?.setItem(ACTIVE_PERIOD_STORAGE_KEY, activeVatWorkbookPeriodId);
  }, [activeVatWorkbookPeriodId]);

  const activePeriod = useMemo(() => periods.find((item) => item.id === activeVatWorkbookPeriodId) || null, [periods, activeVatWorkbookPeriodId]);
  const draftPeriod = useMemo(() => createVatWorkbookPeriod({ startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31` }), []);
  const period = normalizeVatWorkbookPeriod(activePeriod || draftPeriod);
  const currentSheet = sheetByKey[active];
  const visibleSheets = VAT_WORKBOOK_SHEETS.filter((sheet, index, entries) => entries.findIndex((entry) => entry.excelName === sheet.excelName) === index);

  const save = (next) => {
    const exists = periods.some((item) => item.id === next.id);
    setData?.({ ...data, vatWorkbookPeriods: exists ? periods.map((item) => item.id === next.id ? next : item) : [next, ...periods] });
    setActiveVatWorkbookPeriodId(next.id);
  };
  const handleExport = useCallback(async () => {
    if (!activePeriod) return;
    setExportError("");
    console.log("VAT_EXPORT_START", { activePeriodId: activePeriod.id, startDate: activePeriod.startDate, endDate: activePeriod.endDate, status: activePeriod.status, sheets: activePeriod.sheets });
    try {
      const exportPeriod = normalizeVatWorkbookPeriod(activePeriod);
      const sheetCounts = Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, exportPeriod.sheets[sheet.key].length]));
      console.log("VAT_EXPORT_VALIDATED", { activeVatWorkbookPeriodId, activePeriodId: exportPeriod.id, startDate: exportPeriod.startDate, endDate: exportPeriod.endDate, sheetCounts });
      console.log("VAT_EXPORT_PERIOD_COMPARISON", periods.map((item) => ({ id: item.id, startDate: item.startDate, endDate: item.endDate, status: item.status, sheetCounts: Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, Array.isArray(item.sheets?.[sheet.key]) ? item.sheets[sheet.key].length : 0])) })));
      await exportVatWorkbook(exportPeriod);
      console.log("VAT_EXPORT_DONE", { activePeriodId: exportPeriod.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue lors de l'export TVA.";
      console.error("VAT_EXPORT_FAILED", error);
      setExportError(message);
    }
  }, [activeVatWorkbookPeriodId, activePeriod, periods]);
  const edit = (line) => { const nature = window.prompt("Nature", line.nature); if (nature != null) save(updateVatWorkbookLine(period, active, line.id, { nature })); };
  const add = (items) => {
    const existingElsewhere = items.find((item) => findVatWorkbookPlacement(period, item.sourceType, item.sourceId));
    const moveExisting = existingElsewhere ? window.confirm("Un document est deja utilise dans une autre annexe. Voulez-vous le deplacer ?") : false;
    const result = addVatWorkbookSnapshots(period, active, items.map((item) => item.snapshot), { moveExisting });
    save(result.period); setSelector(false); logActivity?.("Ajout annexe TVA", currentSheet.label);
  };

  return <section className="vat-workbook">
    <div className="page-header"><div><h2>Declaration TVA</h2><p>Classeur de preparation TVA</p></div><button type="button" disabled={!activePeriod} onClick={handleExport}><FileDown size={16} /> Exporter le classeur TVA</button></div>
    {exportError ? <p className="form-error" role="alert">Export TVA impossible : {exportError}</p> : null}
    <div className="card vat-workbook-period"><label>Dossier TVA <select value={activeVatWorkbookPeriodId} onChange={(event) => setActiveVatWorkbookPeriodId(event.target.value)}><option value="">Nouveau dossier</option>{periods.map((item) => <option key={item.id} value={item.id}>{item.name || `${item.startDate} - ${item.endDate}`}</option>)}</select></label><label>Date de debut <input type="date" value={period.startDate} onChange={(event) => save({ ...period, startDate: event.target.value })} /></label><label>Date de fin <input type="date" value={period.endDate} onChange={(event) => save({ ...period, endDate: event.target.value })} /></label><span className="badge">{period.status}</span></div>
    <div className="vat-workbook-tabs">{visibleSheets.map((sheet) => <button type="button" className={active === sheet.key ? "is-active" : ""} key={sheet.key} onClick={() => setActive(sheet.key)}>{sheet.excelName}</button>)}<button type="button" className={active === "deductible" ? "is-active" : ""} onClick={() => setActive("deductible")}>Montant TVA deductible</button></div>
    {active === "deductible" ? <DeductibleSheet period={period} onChange={save} /> : <section className="card vat-workbook-sheet"><div className="vat-workbook-sheet__head"><div><h3>{currentSheet.label}</h3>{currentSheet.section ? <p>{currentSheet.section}</p> : null}</div><button type="button" onClick={() => setSelector(true)}><Plus size={16} /> Ajouter des {currentSheet.sourceType === "expense" ? "depenses" : "factures"} du CRM</button></div><div className="table-scroll"><table><thead><tr>{currentSheet.columns.map((column) => <th key={column}>{column}</th>)}<th>Actions</th></tr></thead><tbody>{period.sheets[active].map((line) => <tr key={line.id}>{lineValues(line, active).map((value, index) => <td key={index}>{value}</td>)}<td><button type="button" aria-label="Modifier" onClick={() => edit(line)}><Pencil size={15} /></button><button type="button" aria-label="Ouvrir le document source" onClick={() => window.location.assign(line.sourceType === "expense" ? "/expenses" : "/documents")}><ExternalLink size={15} /></button><button type="button" aria-label="Supprimer de l'annexe" onClick={() => save(removeVatWorkbookLine(period, active, line.id))}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></section>}
    {selector ? <Selector data={data} period={period} sheetKey={active} onClose={() => setSelector(false)} onAdd={add} /> : null}
  </section>;
}
