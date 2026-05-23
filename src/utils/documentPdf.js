import { jsPDF } from "jspdf";
import { APP_LOGO_URL } from "./assets";
import { clientName } from "./documents";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVE = 22;
const BOX_PADDING = 3;
const TEXT_LINE_HEIGHT = 4.2;

export function getDocumentFileName(doc, type) {
  const isQuote = type === "quote";
  return `${isQuote ? "devis" : "facture"}-${String(doc.number || "document").replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function formatPdfMoney(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPdfQuantity(value) {
  return Number(value || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function normalizeLines(doc) {
  if (doc.lines?.length) return doc.lines;
  return [
    {
      description: doc.description,
      quantity: doc.quantity,
      price: doc.price,
      discount: doc.discount || 0,
      subtotal: doc.subtotal,
      totalHT: doc.totalHT,
    },
  ];
}

function getLineSku(line, products = []) {
  if (line.sku) return line.sku;
  const product = products.find((p) => String(p.id) === String(line.productId));
  return product?.sku || "—";
}

function wrapText(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text || ""), maxWidth);
}

function drawCenteredLines(pdf, lines, centerX, startY, lineHeight = TEXT_LINE_HEIGHT) {
  lines.forEach((line, index) => {
    pdf.text(line, centerX, startY + index * lineHeight, { align: "center" });
  });
}

function drawBorderedTextBox(
  pdf,
  {
    x,
    y,
    width,
    lines,
    padding = BOX_PADDING,
    lineHeight = TEXT_LINE_HEIGHT,
    title = null,
    titleFontSize = 8.5,
    bodyFontSize = 8,
    fillColor,
    drawColor,
    titleColor,
    bodyColor,
  }
) {
  const titleBlockHeight = title ? lineHeight + 1.5 : 0;
  const bodyHeight = lines.length * lineHeight;
  const boxHeight = padding * 2 + titleBlockHeight + bodyHeight;
  const centerX = x + width / 2;

  pdf.setDrawColor(...drawColor);
  pdf.setFillColor(...fillColor);
  pdf.roundedRect(x, y, width, boxHeight, 2, 2, "FD");

  let textY = y + padding + lineHeight * 0.75;

  if (title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(titleFontSize);
    pdf.setTextColor(...titleColor);
    pdf.text(title, centerX, textY, { align: "center" });
    textY += titleBlockHeight;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(bodyFontSize);
  pdf.setTextColor(...bodyColor);
  drawCenteredLines(pdf, lines, centerX, textY, lineHeight);

  return y + boxHeight;
}

function ensurePageSpace(pdf, y, neededHeight) {
  if (y + neededHeight > PAGE_HEIGHT - MARGIN - FOOTER_RESERVE) {
    pdf.addPage();
    return MARGIN;
  }
  return y;
}

function drawSectionTitle(pdf, title, y, width = CONTENT_WIDTH) {
  pdf.setFillColor(244, 114, 182);
  pdf.setTextColor(255, 255, 255);
  pdf.roundedRect(MARGIN, y, width, 8, 2, 2, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(title, MARGIN + 3, y + 5.5);
  pdf.setTextColor(17, 24, 39);
  return y + 12;
}

function drawKeyValue(pdf, label, value, x, y, width) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  if (label) pdf.text(label, x, y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(17, 24, 39);
  const lines = wrapText(pdf, value, width);
  pdf.text(lines, x, y + (label ? 4.5 : 0));
  return y + (label ? 4.5 : 0) + lines.length * 4.2;
}

function drawTotalsBlock(pdf, totals, x, y, width = 62) {
  let cursor = y;

  totals.forEach(([label, value], index) => {
    const isFinal = index === totals.length - 1;
    if (isFinal) {
      pdf.setFillColor(236, 72, 153);
      pdf.roundedRect(x, cursor, width, 9, 2, 2, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(label, x + 3, cursor + 6);
      pdf.text(value, x + width - 3, cursor + 6, { align: "right" });
      cursor += 10;
      return;
    }

    pdf.setTextColor(71, 85, 105);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(label, x + 3, cursor + 4);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(17, 24, 39);
    pdf.text(value, x + width - 3, cursor + 4, { align: "right" });
    pdf.setDrawColor(241, 245, 249);
    pdf.line(x, cursor + 6, x + width, cursor + 6);
    cursor += 7;
  });

  return cursor;
}

function drawPaymentAndMentions(pdf, settings, y, width) {
  let cursor = y;
  const columnCenterX = MARGIN + width / 2;
  const innerBoxWidth = width - 4;
  const innerBoxX = MARGIN + 2;
  const innerTextWidth = innerBoxWidth - BOX_PADDING * 2;

  if (settings.paymentTerms || settings.bankInfo) {
    cursor = drawSectionTitle(pdf, "CONDITIONS DE PAIEMENT", cursor, width);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(51, 65, 85);

    if (settings.paymentTerms) {
      const paymentLines = wrapText(
        pdf,
        `Échéance de paiement : ${settings.paymentTerms}`,
        width - BOX_PADDING * 2
      );
      paymentLines.forEach((line) => {
        pdf.text(line, columnCenterX, cursor + TEXT_LINE_HEIGHT * 0.75, { align: "center" });
        cursor += TEXT_LINE_HEIGHT;
      });
      cursor += 1;
    }

    if (settings.bankInfo) {
      pdf.setFontSize(8.5);
      const bankLines = wrapText(pdf, settings.bankInfo, innerTextWidth);
      cursor =
        drawBorderedTextBox(pdf, {
          x: innerBoxX,
          y: cursor,
          width: innerBoxWidth,
          lines: bankLines,
          bodyFontSize: 8.5,
          fillColor: [255, 255, 255],
          drawColor: [229, 231, 235],
          bodyColor: [51, 65, 85],
        }) + 3;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(51, 65, 85);
    }
  }

  const mentionsBody =
    "Document généré électroniquement. Aucun escompte accordé sauf indication contraire. En cas de retard de paiement, des pénalités peuvent être appliquées selon les conditions convenues.";
  pdf.setFontSize(8);
  const mentionsLines = wrapText(pdf, mentionsBody, innerTextWidth);
  cursor =
    drawBorderedTextBox(pdf, {
      x: innerBoxX,
      y: cursor,
      width: innerBoxWidth,
      lines: mentionsLines,
      title: "Mentions",
      fillColor: [255, 247, 237],
      drawColor: [254, 215, 170],
      titleColor: [124, 45, 18],
      bodyColor: [124, 45, 18],
    }) + 4;

  return cursor;
}

function drawThanksBlock(pdf, y) {
  const padding = BOX_PADDING;
  const lineGap = 1;
  const line1Height = TEXT_LINE_HEIGHT;
  const line2Height = TEXT_LINE_HEIGHT;
  const blockHeight = padding * 2 + line1Height + lineGap + line2Height;
  const centerX = MARGIN + CONTENT_WIDTH / 2;

  pdf.setDrawColor(245, 208, 229);
  pdf.setFillColor(255, 241, 247);
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, blockHeight, 2, 2, "FD");

  const line1Y = y + padding + line1Height * 0.75;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(17, 24, 39);
  pdf.text("Merci pour votre confiance.", centerX, line1Y, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Pour toute question, n'hésitez pas à nous contacter.", centerX, line1Y + line1Height + lineGap, {
    align: "center",
  });

  return y + blockHeight + 4;
}

function drawDocumentFooter(pdf, settings, y) {
  pdf.setDrawColor(229, 231, 235);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 4;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.8);
  pdf.setTextColor(17, 24, 39);
  pdf.text(`${settings.companyName || "AC Creation"} — Personnalisation`, PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 4.5;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  const contactParts = [
    settings.companyAddress,
    settings.companyPhone,
    settings.companyEmail,
  ].filter(Boolean);
  if (contactParts.length) {
    pdf.text(contactParts.join(" — "), PAGE_WIDTH / 2, y, { align: "center" });
    y += 4;
  }
  if (settings.vatNumber) {
    pdf.text(`N° TVA : ${settings.vatNumber}`, PAGE_WIDTH / 2, y, { align: "center" });
    y += 4;
  }

  return y;
}

export function buildDocumentPdf({ doc, type, data, logoDataUrl = null }) {
  const isQuote = type === "quote";
  const settings = data.settings || {};
  const client = (data.clients || []).find((c) => c.id === doc.clientId);
  const lines = normalizeLines(doc);
  const amountDue = doc.status === "Payée" ? 0 : doc.totalTTC || 0;
  const documentTitle = isQuote ? "DEVIS" : "FACTURE";

  const pdf = new jsPDF("p", "mm", "a4");
  let y = MARGIN;

  const logoUrl =
    logoDataUrl ||
    (settings.logoUrl && settings.logoUrl.trim() !== "" ? settings.logoUrl : APP_LOGO_URL);

  try {
    pdf.addImage(logoUrl, "PNG", MARGIN, y, 18, 18, undefined, "FAST");
  } catch {
    // Logo optional — continue without image
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(17, 24, 39);
  pdf.text(settings.companyName || "AC Creation", MARGIN + 22, y + 6);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  const companyLines = [
    settings.companyAddress,
    settings.companyPhone,
    settings.companyEmail,
    settings.vatNumber ? `N° TVA : ${settings.vatNumber}` : null,
  ].filter(Boolean);

  let companyY = y + 11;
  companyLines.forEach((line) => {
    pdf.text(String(line), MARGIN + 22, companyY);
    companyY += 4;
  });

  pdf.setFillColor(236, 72, 153);
  pdf.roundedRect(PAGE_WIDTH - MARGIN - 58, y, 58, 28, 3, 3, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(documentTitle, PAGE_WIDTH - MARGIN - 31, y + 10, { align: "center" });
  pdf.setFontSize(9);
  pdf.text(`N° ${doc.number || "—"}`, PAGE_WIDTH - MARGIN - 31, y + 17, { align: "center" });
  pdf.text(`Date : ${doc.date || "—"}`, PAGE_WIDTH - MARGIN - 31, y + 23, { align: "center" });

  y = Math.max(companyY + 4, y + 32);

  pdf.setDrawColor(245, 208, 229);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH / 2 - 3, 34, 2, 2, "FD");
  pdf.roundedRect(MARGIN + CONTENT_WIDTH / 2 + 3, y, CONTENT_WIDTH / 2 - 3, 34, 2, 2, "FD");

  let leftBottom = drawKeyValue(
    pdf,
    "FACTURÉ À",
    client?.name || clientName(data, doc.clientId),
    MARGIN + 4,
    y + 7,
    CONTENT_WIDTH / 2 - 12
  );
  [client?.company, client?.address, client?.email, client?.phone]
    .filter(Boolean)
    .forEach((value) => {
      leftBottom = drawKeyValue(pdf, "", value, MARGIN + 4, leftBottom + 1, CONTENT_WIDTH / 2 - 12);
    });

  drawKeyValue(
    pdf,
    "RÉFÉRENCE",
    doc.convertedFrom || doc.number || "—",
    MARGIN + CONTENT_WIDTH / 2 + 7,
    y + 7,
    CONTENT_WIDTH / 2 - 12
  );
  drawKeyValue(
    pdf,
    "Statut",
    doc.status || "—",
    MARGIN + CONTENT_WIDTH / 2 + 7,
    y + 18,
    CONTENT_WIDTH / 2 - 12
  );
  if (!isQuote && doc.dueDate) {
    drawKeyValue(
      pdf,
      "Échéance",
      doc.dueDate,
      MARGIN + CONTENT_WIDTH / 2 + 7,
      y + 27,
      CONTENT_WIDTH / 2 - 12
    );
  }

  y += 40;
  y = drawSectionTitle(pdf, "DÉTAIL DES PRESTATIONS", y);

  const colWidths = [18, 62, 24, 16, 16, 26];
  const headers = ["Réf.", "Désignation", "P.U. HT", "Qté", "Rem.", "Total HT"];
  const tableX = MARGIN;

  pdf.setFillColor(249, 168, 212);
  pdf.rect(tableX, y, CONTENT_WIDTH, 7, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(17, 24, 39);

  let x = tableX + 2;
  headers.forEach((header, index) => {
    pdf.text(header, x, y + 4.8);
    x += colWidths[index];
  });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  lines.forEach((line, rowIndex) => {
    const descriptionLines = wrapText(pdf, line.description || "—", colWidths[1] - 2);
    const rowHeight = Math.max(8, descriptionLines.length * 4 + 2);

    y = ensurePageSpace(pdf, y, rowHeight + 4);

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(253, 244, 255);
      pdf.rect(tableX, y, CONTENT_WIDTH, rowHeight, "F");
    }

    const row = [
      getLineSku(line, data.products),
      line.description || "—",
      `${formatPdfMoney(line.price)} €`,
      formatPdfQuantity(line.quantity),
      `${line.discount || 0}%`,
      `${formatPdfMoney(line.totalHT || line.subtotal)} €`,
    ];

    x = tableX + 2;
    row.forEach((cell, index) => {
      if (index === 1) {
        descriptionLines.forEach((textLine, lineIndex) => {
          pdf.text(textLine, x, y + 5 + lineIndex * 4);
        });
      } else {
        pdf.text(String(cell), x, y + 5.5);
      }
      x += colWidths[index];
    });
    y += rowHeight;
  });

  y += 4;

  const totalsX = PAGE_WIDTH - MARGIN - 62;
  const totalsWidth = 62;
  const leftColumnWidth = CONTENT_WIDTH - totalsWidth - 6;
  const totals = [
    ["Sous-total HT", `${formatPdfMoney(doc.subtotal || doc.totalHT)} €`],
    ["Remise lignes", `${formatPdfMoney(doc.lineDiscountAmount || 0)} €`],
    [
      `Remise globale${doc.globalDiscount ? ` (${doc.globalDiscount}%)` : ""}`,
      `${formatPdfMoney(doc.globalDiscountAmount || 0)} €`,
    ],
    ["Total HT", `${formatPdfMoney(doc.totalHT)} €`],
    [`TVA à ${doc.taxRate || settings.taxRate || 0}%`, `${formatPdfMoney(doc.taxAmount)} €`],
    ["Total TTC", `${formatPdfMoney(doc.totalTTC)} €`],
    ["À PAYER", `${formatPdfMoney(amountDue)} €`],
  ];
  const totalsHeight = 7 * 6 + 10;

  y = ensurePageSpace(pdf, y, totalsHeight + 40);

  const blockStartY = y;
  const leftEndY = drawPaymentAndMentions(pdf, settings, blockStartY, leftColumnWidth);
  const rightEndY = drawTotalsBlock(pdf, totals, totalsX, blockStartY, totalsWidth);
  y = Math.max(leftEndY, rightEndY) + 6;

  y = ensurePageSpace(pdf, y, 22);
  y = drawThanksBlock(pdf, y);

  y = ensurePageSpace(pdf, y, 18);
  drawDocumentFooter(pdf, settings, y);

  return pdf;
}

export async function downloadDocumentPdf({ doc, type, data }) {
  const pdf = buildDocumentPdf({ doc, type, data });
  pdf.save(getDocumentFileName(doc, type));
}
