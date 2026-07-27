import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { normalizeVatWorkbookPeriod, VAT_WORKBOOK_SHEETS } from "./vatWorkbook";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/TVA-Carla-draft-1.xlsx`;
const SHEET_PATHS = {
  Achats_LUX: "xl/worksheets/sheet1.xml",
  AIC: "xl/worksheets/sheet2.xml",
  Chida_LUX: "xl/worksheets/sheet3.xml",
  Chida_UE: "xl/worksheets/sheet4.xml",
  "Importations 1": "xl/worksheets/sheet5.xml",
  Chida_HUE: "xl/worksheets/sheet6.xml",
  Importations: "xl/worksheets/sheet7.xml",
};
const START_ROWS = { achatsLux: 12, aic: 13, chidaLux: 12, chidaUeTaxable: 14, chidaUeExempt: 27, importations1: 12, chidaHue: 13, importations: 12 };
const END_ROWS = { achatsLux: 49, aic: 48, chidaLux: 60, chidaUeTaxable: 25, chidaUeExempt: 47, importations1: 13, chidaHue: 47, importations: 13 };

const valuesFor = (line, key) => {
  const common = [line.date, line.partner, line.number, line.nature];
  const rate = Number(line.vatRate || 0) / 100;
  if (key === "achatsLux") return [...common, line.amountHT, rate, line.vatAmount, line.totalTTC];
  if (key === "chidaLux") return [...common, line.amountCurrency, line.currency, line.exchangeRate, line.amountHT, rate, line.vatAmount, line.totalTTC];
  if (key === "chidaUeTaxable") return [...common, line.country, line.vatNumber, line.amountCurrency, line.currency, line.exchangeRate, line.amountHT];
  if (key === "chidaUeExempt") return [line.date, line.partner, line.country, line.nature, line.amountCurrency, line.currency, line.exchangeRate, line.amountHT];
  if (key === "chidaHue") return [...common, line.country, line.amountCurrency, line.currency, line.exchangeRate, line.amountHT];
  return [...common, line.country, line.amountCurrency, line.currency, line.exchangeRate, line.amountHT, rate, line.vatAmount, line.totalTTC];
};

function column(index) {
  let value = index + 1;
  let label = "";
  while (value) {
    const rest = (value - 1) % 26;
    label = String.fromCharCode(65 + rest) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function createCell(reference, value, style) {
  const styleAttribute = style ? ` s="${style}"` : "";
  if (value === undefined || value === null || value === "") return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value === "number") return `<c r="${reference}"${styleAttribute} t="n"><v>${value}</v></c>`;
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t>${String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</t></is></c>`;
}

function normalizeExcelValue(value, { sheetKey, rowIndex, line } = {}) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Valeur Excel invalide dans ${sheetKey}, ligne ${rowIndex + 1} (${line?.id || "sans snapshot"}) : date invalide.`);
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Valeur Excel invalide dans ${sheetKey}, ligne ${rowIndex + 1} (${line?.id || "sans snapshot"}, source ${line?.sourceId || "inconnue"}) : nombre non fini.`);
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  throw new Error(`Valeur Excel invalide dans ${sheetKey}, ligne ${rowIndex + 1} (${line?.id || "sans snapshot"}, source ${line?.sourceId || "inconnue"}) : ${typeof value} non exportable.`);
}

function rowNumber(rowXml) {
  return Number(rowXml.match(/<row\b(?=[^>]*\br="(\d+)")/)?.[1] || 0);
}

function shiftFormulaRows(formula, firstShiftedRow, insertedRows) {
  return formula.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/g, (reference, columnReference, row) => {
    const currentRow = Number(row);
    return currentRow >= firstShiftedRow ? `${columnReference}${currentRow + insertedRows}` : reference;
  });
}

function shiftRowXml(rowXml, firstShiftedRow, insertedRows) {
  const currentRow = rowNumber(rowXml);
  if (currentRow < firstShiftedRow) return rowXml;
  const nextRow = currentRow + insertedRows;
  return rowXml
    .replace(/(<row\b[^>]*\br=")\d+(")/, `$1${nextRow}$2`)
    .replace(/(<c\b[^>]*\br="[A-Z]+)\d+(")/g, `$1${nextRow}$2`)
    .replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/g, (full, open, formula, close) => `${open}${shiftFormulaRows(formula, firstShiftedRow, insertedRows)}${close}`);
}

function extendFormulaRange(formula, templateLastDataRow, insertedRows) {
  if (!insertedRows) return formula;
  const nextLastDataRow = templateLastDataRow + insertedRows;
  return formula.replace(/(\$?[A-Z]{1,3}\$?)\d+/g, (reference, columnReference) => {
    const row = Number(reference.slice(columnReference.length));
    return row === templateLastDataRow ? `${columnReference}${nextLastDataRow}` : reference;
  });
}

function extendTotalsFormulas(rowXml, templateLastDataRow, insertedRows) {
  return rowXml.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/g, (full, open, formula, close) => `${open}${extendFormulaRange(formula, templateLastDataRow, insertedRows)}${close}`);
}

function shiftWorksheetReferences(xml, firstShiftedRow, insertedRows) {
  if (!insertedRows) return xml;
  return xml.replace(/\b(ref|sqref)="([^"]+)"/g, (full, attribute, reference) => `${attribute}="${shiftFormulaRows(reference, firstShiftedRow, insertedRows)}"`);
}

function extendValidationRanges(xml, templateLastDataRow, insertedRows) {
  if (!insertedRows) return xml;
  return xml.replace(/\bsqref="([^"]+)"/g, (full, reference) => `sqref="${extendFormulaRange(reference, templateLastDataRow, insertedRows)}"`);
}

function cloneEmptyDataRow(templateRow, targetRow, columnCount) {
  const rowOpen = templateRow.match(/^<row\b[^>]*>/)?.[0] || `<row r="${targetRow}">`;
  const nextOpen = rowOpen.replace(/\br="\d+"/, `r="${targetRow}"`);
  const styles = Array.from({ length: columnCount }, (_, index) => templateRow.match(new RegExp(`<c\\b(?=[^>]*\\br="${column(index + 1)}${rowNumber(templateRow)}")[^>]*\\bs="([^"]+)"`))?.[1] || null);
  return `${nextOpen}${styles.map((style, index) => createCell(`${column(index + 1)}${targetRow}`, "", style)).join("")}</row>`;
}

function updateDimension(xml, lastRow) {
  return xml.replace(/<dimension\b[^>]*\bref="([A-Z]+\d+):([A-Z]+)(\d+)"[^>]*\/>/, (full, start, endColumn, currentLastRow) => {
    return `<dimension ref="${start}:${endColumn}${Math.max(Number(currentLastRow), lastRow)}"/>`;
  });
}

// Extends one contiguous table before its totals. The model formatting stays the source of truth.
export function ensureSheetCapacity({ worksheet, firstDataRow, templateLastDataRow, requiredRowCount, columnCount }) {
  const initialCapacity = templateLastDataRow - firstDataRow + 1;
  const insertedRows = Math.max(0, requiredRowCount - initialCapacity);
  const insertionRow = templateLastDataRow + 1;
  const rows = Array.from(worksheet.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)).map((match) => match[0]);
  const templateRow = rows.filter((row) => rowNumber(row) <= templateLastDataRow).at(-1);
  if (!templateRow) throw new Error(`Le modele Excel ne contient pas la ligne de style ${templateLastDataRow}.`);

  const expandedRows = [];
  for (const row of rows) {
    const currentRow = rowNumber(row);
    if (currentRow === insertionRow) {
      for (let index = 0; index < insertedRows; index += 1) {
        expandedRows.push(cloneEmptyDataRow(templateRow, insertionRow + index, columnCount));
      }
    }
    const shifted = shiftRowXml(row, insertionRow, insertedRows);
    expandedRows.push(currentRow >= insertionRow ? extendTotalsFormulas(shifted, templateLastDataRow, insertedRows) : shifted);
  }
  if (!rows.some((row) => rowNumber(row) === insertionRow)) {
    for (let index = 0; index < insertedRows; index += 1) expandedRows.push(cloneEmptyDataRow(templateRow, insertionRow + index, columnCount));
  }

  const finalLastDataRow = templateLastDataRow + insertedRows;
  const presentRows = new Set(expandedRows.map(rowNumber));
  for (let row = firstDataRow; row <= finalLastDataRow; row += 1) {
    if (!presentRows.has(row)) expandedRows.push(cloneEmptyDataRow(templateRow, row, columnCount));
  }
  expandedRows.sort((left, right) => rowNumber(left) - rowNumber(right));

  const sheetData = `<sheetData>${expandedRows.join("")}</sheetData>`;
  const nextWorksheet = updateDimension(
    extendValidationRanges(
      shiftWorksheetReferences(worksheet.replace(/<sheetData>[\s\S]*?<\/sheetData>/, sheetData), insertionRow, insertedRows),
      templateLastDataRow,
      insertedRows,
    ),
    finalLastDataRow,
  );
  return {
    worksheet: nextWorksheet,
    initialCapacity,
    requiredRowCount,
    insertedRows,
    finalCapacity: initialCapacity + insertedRows,
    lastDataRow: finalLastDataRow,
  };
}

function updateSheet(xml, key, lines, { start, end }) {
  const columnCount = valuesFor({}, key).length;
  const capacity = ensureSheetCapacity({ worksheet: xml, firstDataRow: start, templateLastDataRow: end, requiredRowCount: lines.length, columnCount });
  const valuesByRow = new Map();
  for (let row = start; row <= capacity.lastDataRow; row += 1) valuesByRow.set(row, valuesFor({}, key).map(() => ""));
  lines.forEach((line, index) => {
    try {
      valuesByRow.set(start + index, valuesFor(line, key).map((value) => normalizeExcelValue(value, { sheetKey: key, rowIndex: index, line })));
    } catch (error) {
      console.error("VAT_EXPORT_LINE_INVALID", { sheetName: key, rowIndex: index, snapshotId: line?.id, sourceId: line?.sourceId, values: valuesFor(line, key) });
      throw error;
    }
  });
  const styles = valuesFor({}, key).map((_, index) => capacity.worksheet.match(new RegExp(`<c\\b(?=[^>]*\\br="${column(index + 1)}${start}")[^>]*\\bs="([^"]+)"`))?.[1] || null);
  return {
    ...capacity,
    worksheet: capacity.worksheet.replace(/(<row\b(?=[^>]*\br="(\d+)")[^>]*>)[\s\S]*?(<\/row>)/g, (full, open, row, close) => {
      const values = valuesByRow.get(Number(row));
      if (!values) return full;
      return `${open}${values.map((value, index) => createCell(`${column(index + 1)}${row}`, value, styles[index])).join("")}${close}`;
    }).replace(/<f\b(?=[^>]*\bt="shared")[^>]*>[^<]*<\/f>/g, ""),
  };
}

function removeCalculationChain(files) {
  delete files["xl/calcChain.xml"];
  files["xl/_rels/workbook.xml.rels"] = strToU8(strFromU8(files["xl/_rels/workbook.xml.rels"]).replace(/<Relationship\b(?=[^>]*\bType="[^"]*\/calcChain")[^>]*\/>/g, ""));
  files["[Content_Types].xml"] = strToU8(strFromU8(files["[Content_Types].xml"]).replace(/<Override\b(?=[^>]*\bPartName="\/xl\/calcChain\.xml")[^>]*\/>/g, ""));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const calcPr = '<calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  files["xl/workbook.xml"] = strToU8(/<calcPr\b[^>]*\/\s*>|<calcPr\b[^>]*>.*?<\/calcPr>/.test(workbook)
    ? workbook.replace(/<calcPr\b[^>]*\/\s*>|<calcPr\b[^>]*>.*?<\/calcPr>/, calcPr)
    : workbook.replace("</workbook>", `${calcPr}</workbook>`));
}

function periodFilename(period = {}) {
  const start = period.startDate || "";
  const end = period.endDate || "";
  if (/^\d{4}-01-01$/.test(start) && end === `${start.slice(0, 4)}-12-31`) return `TVA_AC-Creation_${start.slice(0, 4)}.xlsx`;
  if (/^\d{4}-\d{2}-01$/.test(start)) {
    const lastDay = new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0).getDate();
    if (end === `${start.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`) return `TVA_AC-Creation_${start.slice(0, 7)}.xlsx`;
  }
  if (/^\d{4}-(01|04|07|10)-01$/.test(start)) {
    const quarter = Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1;
    const expectedEnd = [`${start.slice(0, 4)}-03-31`, `${start.slice(0, 4)}-06-30`, `${start.slice(0, 4)}-09-30`, `${start.slice(0, 4)}-12-31`][quarter - 1];
    if (end === expectedEnd) return `TVA_AC-Creation_${start.slice(0, 4)}-T${quarter}.xlsx`;
  }
  return `TVA_AC-Creation_${start || "periode"}.xlsx`;
}

export function buildVatWorkbookExport(templateBytes, period = {}) {
  const files = unzipSync(templateBytes);
  removeCalculationChain(files);
  const selectedSheetCounts = Object.fromEntries(VAT_WORKBOOK_SHEETS.map((sheet) => [sheet.key, (period.sheets?.[sheet.key] || []).length]));
  const normalizedPaths = new Set(["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]);
  const sheetOffsets = {};
  const sheetCapacities = {};
  for (const sheet of VAT_WORKBOOK_SHEETS) {
    const path = SHEET_PATHS[sheet.excelName];
    if (!path) continue;
    const lines = period.sheets?.[sheet.key] || [];
    if (!lines.length && !normalizedPaths.has(path)) continue;
    const offset = sheetOffsets[path] || 0;
    const result = updateSheet(strFromU8(files[path]), sheet.key, lines, { start: START_ROWS[sheet.key] + offset, end: END_ROWS[sheet.key] + offset });
    files[path] = strToU8(result.worksheet);
    sheetOffsets[path] = offset + result.insertedRows;
    sheetCapacities[sheet.key] = result;
    console.log("VAT_EXPORT_SHEET_CAPACITY", { sheet: sheet.excelName, initialCapacity: result.initialCapacity, requiredRows: result.requiredRowCount, insertedRows: result.insertedRows, finalCapacity: result.finalCapacity });
    normalizedPaths.delete(path);
  }
  return { bytes: zipSync(files, { level: 6 }), filename: periodFilename(period), workbookPeriodId: period.id || null, selectedSheetCounts, sheetCapacities };
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  console.log("VAT_EXPORT_BLOB_CREATED", { size: blob.size, filename });
  if (!blob.size || !filename) throw new Error("Le fichier TVA genere est vide ou son nom est invalide.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  console.log("VAT_EXPORT_DOWNLOAD_TRIGGERED", { filename, size: blob.size });
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

export async function exportVatWorkbook(period = {}) {
  try {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error("Le modele Excel TVA est introuvable.");
    const templateBytes = new Uint8Array(await response.arrayBuffer());
    console.log("VAT_EXPORT_MODEL_LOADED", { size: templateBytes.length });
    const result = buildVatWorkbookExport(templateBytes, normalizeVatWorkbookPeriod(period));
    console.log("VAT_EXPORT_WORKBOOK_FILLED", { workbookPeriodId: result.workbookPeriodId, selectedSheetCounts: result.selectedSheetCounts, sheetCapacities: Object.fromEntries(Object.entries(result.sheetCapacities).map(([key, value]) => [key, { requiredRows: value.requiredRowCount, insertedRows: value.insertedRows }])) });
    console.log("VAT_EXPORT_BUFFER_CREATED", { size: result.bytes.length, filename: result.filename });
    download(result.bytes, result.filename);
    return result;
  } catch (error) {
    console.error("VAT_EXPORT_FAILED", error);
    throw error;
  }
}
