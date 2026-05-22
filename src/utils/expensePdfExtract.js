import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  isPartialExpenseExtraction,
  parseExpenseFromText,
} from "./expensePdfParser.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const LINE_Y_TOLERANCE = 4;

function getItemPosition(item) {
  const transform = item.transform || [1, 0, 0, 1, 0, 0];
  return { x: transform[4], y: transform[5] };
}

function groupItemsIntoLines(items) {
  const sorted = [...items].sort((a, b) => {
    const posA = getItemPosition(a);
    const posB = getItemPosition(b);
    const yDiff = posB.y - posA.y;
    if (Math.abs(yDiff) > LINE_Y_TOLERANCE) return yDiff;
    return posA.x - posB.x;
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const item of sorted) {
    const { y } = getItemPosition(item);
    if (currentY == null || Math.abs(y - currentY) <= LINE_Y_TOLERANCE) {
      currentLine.push(item);
      if (currentY == null) currentY = y;
    } else {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [item];
      currentY = y;
    }
  }

  if (currentLine.length) lines.push(currentLine);

  return lines
    .map((lineItems) =>
      lineItems
        .sort((a, b) => getItemPosition(a).x - getItemPosition(b).x)
        .map((item) => item.str)
        .join(" ")
        .trim()
    )
    .filter(Boolean);
}

function parsePdfMetadataDate(raw) {
  if (!raw || typeof raw !== "string") return "";

  const match = raw.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (day < 1 || day > 31 || month < 1 || month > 12) return "";

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return iso;
}

function extractFallbackDateFromMetadata(metadata) {
  const info = metadata?.info;
  if (!info) return "";

  for (const key of ["CreationDate", "ModDate"]) {
    const parsed = parsePdfMetadataDate(info[key]);
    if (parsed) return parsed;
  }

  return "";
}

export async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let metadata = null;
  try {
    metadata = await pdf.getMetadata();
  } catch {
    metadata = null;
  }

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = groupItemsIntoLines(content.items);
    pages.push(pageLines.join("\n"));
  }

  return {
    text: pages.join("\n"),
    fallbackDate: extractFallbackDateFromMetadata(metadata),
  };
}

export async function parseExpenseFromPdf(file) {
  const { text, fallbackDate } = await extractTextFromPdf(file);
  const parsed = parseExpenseFromText(text, { fallbackDate });

  if (import.meta.env.DEV && isPartialExpenseExtraction(parsed)) {
    console.debug(
      "[expense PDF] extraction incomplete — raw text preview:",
      text.slice(0, 500)
    );
    console.debug("[expense PDF] parsed fields:", {
      supplierName: parsed.supplierName,
      purchaseDate: parsed.purchaseDate,
      invoiceNumber: parsed.invoiceNumber,
      totalTTC: parsed.totalTTC,
    });
  }

  return {
    ...parsed,
    rawText: text,
  };
}
