import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { APP_LOGO_URL } from "./assets";
import { clientName } from "./documents";
import { formatPdfQuantity } from "./documentPdf";
import { resolveProcessType } from "./production";
import { buildQuoteOpenUrl } from "./quoteOpenUrl";
import { normalizeProductionSheet } from "./profitability";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  rose: [236, 72, 153],
  border: [245, 208, 229],
  text: [17, 24, 39],
  muted: [71, 85, 105],
  white: [255, 255, 255],
  overdue: [220, 38, 38],
};

export const PRODUCTION_SHEET_STATUSES = ["En production", "Prêt"];

export function isProductionSheetEligible(quote) {
  return PRODUCTION_SHEET_STATUSES.includes(String(quote?.status || "").trim());
}

export function getProductionSheetFileName(quote) {
  const number = String(quote?.number || "commande").replace(/[^\w.-]+/g, "_");
  return `fiche-atelier-${number}.pdf`;
}

function wrapText(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text || "—"), maxWidth);
}

function normalizeLines(quote) {
  if (quote.lines?.length) return quote.lines;
  return [
    {
      description: quote.description,
      quantity: quote.quantity || 1,
    },
  ];
}

export function buildProductionSheetPdf({ quote, data, logoDataUrl = null, qrDataUrl = null }) {
  const settings = data?.settings || {};
  const process = resolveProcessType(quote);
  const sheet = normalizeProductionSheet(quote);
  const lines = normalizeLines(quote);
  const logoUrl =
    logoDataUrl ||
    (settings.logoUrl && settings.logoUrl.trim() !== "" ? settings.logoUrl : APP_LOGO_URL);

  const pdf = new jsPDF("p", "mm", "a4");
  let y = MARGIN;

  pdf.setFillColor(...COLORS.rose);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, 14, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.white);
  pdf.text("FICHE ATELIER", MARGIN + 4, y + 9);
  pdf.setFontSize(9);
  pdf.text(settings.companyName || "AC Creation", PAGE_WIDTH - MARGIN - 4, y + 9, {
    align: "right",
  });
  y += 18;

  try {
    pdf.addImage(logoUrl, "PNG", MARGIN, y, 16, 16, undefined, "FAST");
  } catch {
    // Logo optional
  }

  const metaX = MARGIN + 20;
  const metaEntries = [
    ["Devis", quote.number || "—"],
    ["Client", clientName(data, quote.clientId)],
    ["Statut", quote.status || "—"],
    ["Processus", process.label],
    ["Machine", sheet.machine || "—"],
    ["Matériau", sheet.material || "—"],
    ["Temps estimé", sheet.estimatedMinutes ? `${sheet.estimatedMinutes} min` : "—"],
    ["Temps réel", sheet.realMinutes ? `${sheet.realMinutes} min` : "—"],
    ["Livraison prévue", quote.promisedDeliveryDate || "—"],
  ];
  if (quote.priority && quote.priority !== "normal") {
    metaEntries.push(["Priorité", quote.priority]);
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  metaEntries.forEach(([label, value]) => {
    pdf.setTextColor(...COLORS.muted);
    pdf.text(`${label} :`, metaX, y + 4);
    pdf.setTextColor(...COLORS.text);
    pdf.setFont("helvetica", "bold");
    const valueLines = wrapText(pdf, value, CONTENT_WIDTH - 52);
    valueLines.forEach((line, index) => {
      pdf.text(line, metaX + 28, y + 4 + index * 4.2);
    });
    pdf.setFont("helvetica", "normal");
    y += Math.max(6, valueLines.length * 4.2 + 2);
  });

  y += 4;

  if (quote.atelierNotes || sheet.productionNote) {
    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.2);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, 14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...COLORS.muted);
    pdf.text("NOTES ATELIER", MARGIN + 3, y + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...COLORS.text);
    wrapText(pdf, sheet.productionNote || quote.atelierNotes, CONTENT_WIDTH - 6).forEach(
      (line, index) => {
        pdf.text(line, MARGIN + 3, y + 9 + index * 4);
      }
    );
    y += 18;
  }

  const doneChecks = sheet.checklist.filter((item) => item.done).length;
  if (sheet.checklist.length) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(`Checklist (${doneChecks}/${sheet.checklist.length})`, MARGIN, y + 4);
    y += 6;
    pdf.setFont("helvetica", "normal");
    sheet.checklist.forEach((item) => {
      pdf.text(`${item.done ? "[x]" : "[ ]"} ${item.label}`, MARGIN + 2, y + 4);
      y += 5;
    });
    y += 2;
  }

  if (sheet.files.length) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Fichiers", MARGIN, y + 4);
    y += 5;
    pdf.setFont("helvetica", "normal");
    sheet.files.forEach((file) => {
      pdf.text(`• ${file.name}`, MARGIN + 2, y + 4);
      y += 5;
    });
    y += 2;
  }

  const colWidths = {
    qty: 12,
    desc: 52,
    taille: 22,
    couleur: 28,
    emplacement: 38,
    technique: 34,
  };
  const headers = ["Qté", "Description", "Taille", "Couleur", "Emplacement", "Technique"];
  const widths = Object.values(colWidths);
  const rowHeight = 7;

  pdf.setFillColor(...COLORS.rose);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...COLORS.white);

  let colX = MARGIN + 2;
  headers.forEach((header, index) => {
    pdf.text(header, colX, y + 4.8);
    colX += widths[index];
  });
  y += rowHeight;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);

  lines.forEach((line, lineIndex) => {
    const cells = [
      formatPdfQuantity(line.quantity),
      line.description || "—",
      line.taille || "—",
      line.couleur || "—",
      line.emplacementMarquage || "—",
      line.technique || process.label,
    ];

    const cellLines = cells.map((cell, index) =>
      wrapText(pdf, cell, colWidths[Object.keys(colWidths)[index]] - 2)
    );
    const maxLines = Math.max(...cellLines.map((entry) => entry.length), 1);
    const dynamicHeight = Math.max(rowHeight, maxLines * 4 + 3);

    if (lineIndex % 2 === 0) {
      pdf.setFillColor(252, 231, 243);
      pdf.rect(MARGIN, y, CONTENT_WIDTH, dynamicHeight, "F");
    }

    pdf.setDrawColor(...COLORS.border);
    pdf.setLineWidth(0.1);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, dynamicHeight);

    colX = MARGIN + 2;
    pdf.setTextColor(...COLORS.text);
    cellLines.forEach((wrapped, index) => {
      wrapped.forEach((textLine, textIndex) => {
        pdf.text(textLine, colX, y + 4.5 + textIndex * 4);
      });
      colX += widths[index];
    });

    y += dynamicHeight;
  });

  y += 6;
  pdf.setFontSize(7);
  pdf.setTextColor(...COLORS.muted);

  if (qrDataUrl) {
    try {
      pdf.setFontSize(6);
      pdf.text("Scanner → devis", PAGE_WIDTH - MARGIN - 22, PAGE_HEIGHT - MARGIN - 24);
      pdf.addImage(qrDataUrl, "PNG", PAGE_WIDTH - MARGIN - 22, PAGE_HEIGHT - MARGIN - 22, 20, 20);
    } catch {
      // QR optional
    }
  }

  pdf.text(
    `Généré le ${new Date().toLocaleDateString("fr-FR")} — ${settings.companyName || "AC Creation"}`,
    MARGIN,
    PAGE_HEIGHT - MARGIN
  );

  return pdf;
}

export async function buildProductionSheetQrDataUrl(quote, options = {}) {
  if (!quote?.id) return null;
  try {
    return await QRCode.toDataURL(
      buildQuoteOpenUrl(quote.id, { settings: options.settings }),
      {
        margin: 1,
        width: 160,
        errorCorrectionLevel: "M",
      }
    );
  } catch {
    return null;
  }
}

export async function downloadProductionSheetPdf({ quote, data }) {
  const qrDataUrl = await buildProductionSheetQrDataUrl(quote, {
    settings: data?.settings,
  });
  const pdf = buildProductionSheetPdf({ quote, data, qrDataUrl });
  pdf.save(getProductionSheetFileName(quote));
}
