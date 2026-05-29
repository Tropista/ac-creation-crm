import { jsPDF } from "jspdf";
import { APP_LOGO_URL } from "./assets";
import {
  clientName,
  computeDepositTotals,
  getDocumentAmountDue,
  getDocumentFooterTotals,
} from "./documents";
import { formatLineDescriptionWithProduction } from "./quoteLines";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 7;
const GAP = 4;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_RESERVE = 20;
const BOX_PADDING = 3;
const TEXT_LINE_HEIGHT = 4;
const REF_COL_WIDTH = 22;

const STYLE_A = {
  logoSize: 20,
  logoGap: 3,
  cardRadius: 0,
  rose: [236, 72, 153],
  roseDark: [219, 39, 119],
  roseLight: [244, 114, 182],
  border: [245, 208, 229],
  rowBorder: [252, 231, 243],
  textPrimary: [17, 24, 39],
  textSecondary: [51, 65, 85],
  textMuted: [71, 85, 105],
  white: [255, 255, 255],
  companyNameSize: 11,
  companyBodySize: 7.5,
  titleSize: 12,
  titleLabelSize: 6.5,
  titleValueSize: 8,
  infoTitleSize: 7.5,
  infoBodySize: 8,
  tableHeaderSize: 7,
  tableBodySize: 7.5,
  paymentTitleSize: 7.5,
  paymentBodySize: 7.5,
  mentionsBodySize: 7.5,
  totalsLabelSize: 8,
  totalsFinalSize: 10,
  thanksSize: 8,
  footerSize: 7,
};

function getPdfStyleConfig() {
  return STYLE_A;
}

export function getDocumentFileName(doc, type) {
  if (type === "delivery") {
    return `bon-livraison-${String(doc.number || "document").replace(/[^\w.-]+/g, "_")}.pdf`;
  }
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

function getLineDescriptionForPdf(line, isQuote) {
  if (!isQuote) return line.description || "—";
  return formatLineDescriptionWithProduction(line);
}

function getLineSku(line, products = []) {
  if (line.sku) return line.sku;
  const product = products.find((p) => String(p.id) === String(line.productId));
  return product?.sku || "—";
}

function wrapText(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text || ""), maxWidth);
}

function headColumnWidths() {
  const inner = CONTENT_WIDTH - GAP;
  return {
    company: inner * (1.15 / 2),
    title: inner * (0.85 / 2),
  };
}

function drawFlatRect(pdf, x, y, width, height, { fill, stroke, lineWidth = 0.2 } = {}) {
  if (fill) {
    pdf.setFillColor(...fill);
  }
  if (stroke) {
    pdf.setDrawColor(...stroke);
    pdf.setLineWidth(lineWidth);
  }
  const mode = fill && stroke ? "FD" : fill ? "F" : "D";
  pdf.rect(x, y, width, height, mode);
}

function ensurePageSpace(pdf, y, neededHeight) {
  if (y + neededHeight > PAGE_HEIGHT - MARGIN - FOOTER_RESERVE) {
    pdf.addPage();
    return MARGIN;
  }
  return y;
}

function drawCompanyBox(pdf, settings, logoUrl, x, y, width, style) {
  const padding = BOX_PADDING;
  const logoX = x + padding;
  const textX = logoX + style.logoSize + style.logoGap;
  const textWidth = width - padding * 2 - style.logoSize - style.logoGap;

  const companyLines = [
    settings.companyAddress,
    settings.companyPhone,
    settings.companyEmail,
  ].filter(Boolean);

  const lineHeight = 3.8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.companyNameSize);
  const nameLines = wrapText(pdf, settings.companyName || "AC Creation", textWidth);
  const textHeight =
    nameLines.length * 4.2 +
    1 +
    companyLines.length * lineHeight +
    lineHeight;
  const boxHeight = Math.max(style.logoSize, textHeight) + padding * 2;

  drawFlatRect(pdf, x, y, width, boxHeight, { fill: style.white, stroke: style.border });
  pdf.setFillColor(...style.rose);
  pdf.rect(x, y, 0.8, boxHeight, "F");

  const logoY = y + padding;
  try {
    pdf.addImage(logoUrl, "PNG", logoX, logoY, style.logoSize, style.logoSize, undefined, "FAST");
  } catch {
    // Logo optional
  }

  let contentY = y + padding;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.companyNameSize);
  pdf.setTextColor(...style.textPrimary);
  nameLines.forEach((line, index) => {
    pdf.text(line, textX, contentY + index * 4.2);
  });
  contentY += nameLines.length * 4.2 + 1;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(style.companyBodySize);
  pdf.setTextColor(...style.textSecondary);
  companyLines.forEach((line) => {
    pdf.text(String(line), textX, contentY);
    contentY += lineHeight;
  });

  pdf.text(`N° TVA : ${settings.vatNumber || "-"}`, textX, contentY);

  return y + boxHeight;
}

const TITLE_LINE_BLOCK = 7.5;

function drawTitleBox(pdf, documentTitle, doc, x, y, width, style, { isQuote, isDelivery } = {}) {
  const padding = BOX_PADDING;
  const titleLines = [
    { label: `N° ${documentTitle}`, value: doc.number || "—" },
    { label: "Date d'émission", value: doc.date || "—" },
  ];
  if (isQuote && doc.promisedDeliveryDate) {
    titleLines.push({ label: "Livraison prévue", value: doc.promisedDeliveryDate });
  }
  if (isDelivery && doc.quoteNumber) {
    titleLines.push({ label: "Devis", value: doc.quoteNumber });
  }

  const boxHeight = padding * 2 + 9 + titleLines.length * TITLE_LINE_BLOCK;

  drawFlatRect(pdf, x, y, width, boxHeight, { fill: style.rose });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.titleSize);
  pdf.setTextColor(...style.white);
  pdf.text(documentTitle, x + padding, y + padding + 5);

  let lineY = y + padding + 9;
  titleLines.forEach(({ label, value }) => {
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.1);
    pdf.line(x + padding, lineY, x + width - padding, lineY);
    lineY += 2;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(style.titleLabelSize);
    pdf.setTextColor(255, 255, 255);
    pdf.text(label.toUpperCase(), x + padding, lineY + 3);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(style.titleValueSize);
    pdf.text(String(value), x + width - padding, lineY + 3, { align: "right" });

    lineY += TITLE_LINE_BLOCK;
  });

  return y + boxHeight;
}

function measureInfoCardHeight(pdf, title, entries, width, _style) {
  const innerWidth = width - BOX_PADDING * 2;
  let height = BOX_PADDING * 2 + 6;
  entries.forEach(({ label, value, bold }) => {
    if (label) height += 4.5;
    const lines = wrapText(pdf, bold ? value : value, innerWidth);
    height += Math.max(4, lines.length * TEXT_LINE_HEIGHT);
    if (bold && !label) height += 1;
  });
  return Math.max(height, 24);
}

function drawInfoCard(pdf, title, entries, x, y, width, height, style) {
  const padding = BOX_PADDING;
  const innerX = x + padding;
  const innerWidth = width - padding * 2;

  drawFlatRect(pdf, x, y, width, height, { fill: style.white, stroke: style.border });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.infoTitleSize);
  pdf.setTextColor(...style.roseDark);
  pdf.text(title, innerX, y + padding + 4);

  pdf.setDrawColor(...style.rowBorder);
  pdf.setLineWidth(0.2);
  pdf.line(innerX, y + padding + 6.5, innerX + innerWidth, y + padding + 6.5);

  let cursor = y + padding + 11;
  entries.forEach(({ label, value, bold }) => {
    if (label) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(style.infoBodySize - 0.5);
      pdf.setTextColor(...style.textMuted);
      pdf.text(`${label} :`, innerX, cursor);
      cursor += 4.5;
    }

    const color = bold ? style.textPrimary : style.textMuted;
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(style.infoBodySize);
    pdf.setTextColor(...color);
    const lines = wrapText(pdf, value, innerWidth);
    lines.forEach((line) => {
      pdf.text(line, innerX, cursor);
      cursor += TEXT_LINE_HEIGHT;
    });
    if (bold && !label) cursor += 1;
  });
}

function drawInvoiceTable(pdf, lines, y, style, { isQuote, products, isDelivery }) {
  const tableX = MARGIN;
  const tableTop = y;
  const headers = isDelivery
    ? ["Réf.", "Désignation", "Quantité"]
    : ["Réf.", "Désignation", "Prix unitaire HT", "Quantité", "Montant total"];
  const colWidths = isDelivery
    ? [REF_COL_WIDTH, CONTENT_WIDTH - REF_COL_WIDTH - 22, 22]
    : [REF_COL_WIDTH, CONTENT_WIDTH - REF_COL_WIDTH - 22 - 14 - 22, 22, 14, 22];
  const headerHeight = 7;

  drawFlatRect(pdf, tableX, y, CONTENT_WIDTH, headerHeight, { fill: style.rose });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.tableHeaderSize);
  pdf.setTextColor(...style.white);

  let headerX = tableX + 2;
  headers.forEach((header, index) => {
    const align = index >= (isDelivery ? 2 : 2) ? "right" : "left";
    const cellX = align === "right" ? headerX + colWidths[index] - 2 : headerX;
    pdf.text(header.toUpperCase(), cellX, y + 4.8, { align });
    headerX += colWidths[index];
  });

  y += headerHeight;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(style.tableBodySize);
  pdf.setTextColor(...style.textPrimary);

  lines.forEach((line, rowIndex) => {
    const descriptionText = isDelivery ? line.description || "—" : getLineDescriptionForPdf(line, isQuote);
    const descriptionLines = wrapText(pdf, descriptionText, colWidths[1] - 4);
    const rowHeight = Math.max(7.5, descriptionLines.length * 3.8 + 3);

    y = ensurePageSpace(pdf, y, rowHeight + 2);

    if (rowIndex > 0) {
      pdf.setDrawColor(...style.rowBorder);
      pdf.line(tableX, y, tableX + CONTENT_WIDTH, y);
    }

    pdf.setFillColor(...style.white);
    pdf.rect(tableX, y, CONTENT_WIDTH, rowHeight, "F");

    let cellX = tableX + 2;
    const sku = getLineSku(line, products);
    pdf.text(String(sku), cellX, y + 5);
    cellX += colWidths[0];

    descriptionLines.forEach((textLine, lineIndex) => {
      pdf.text(textLine, cellX, y + 4.5 + lineIndex * 3.8);
    });
    cellX += colWidths[1];

    if (isDelivery) {
      pdf.text(formatPdfQuantity(line.quantity), cellX + colWidths[2] - 2, y + 5, { align: "right" });
    } else {
      const cells = [
        `${formatPdfMoney(line.price)} €`,
        formatPdfQuantity(line.quantity),
        `${formatPdfMoney(line.totalHT || line.subtotal)} €`,
      ];
      cells.forEach((cell, index) => {
        pdf.text(cell, cellX + colWidths[index + 2] - 2, y + 5, { align: "right" });
        cellX += colWidths[index + 2];
      });
    }

    y += rowHeight;
  });

  pdf.setDrawColor(...style.border);
  pdf.setLineWidth(0.2);
  pdf.rect(tableX, tableTop, CONTENT_WIDTH, y - tableTop, "D");

  return y + GAP;
}

function drawPaymentCard(pdf, settings, x, y, width, style) {
  const padding = BOX_PADDING;
  let cursor = y + padding;
  let contentHeight = padding * 2 + 6;

  if (settings.paymentTerms) {
    const paymentLines = wrapText(pdf, settings.paymentTerms, width - padding * 2);
    contentHeight += paymentLines.length * TEXT_LINE_HEIGHT + 2;
  }
  if (settings.bankInfo) {
    const bankLines = wrapText(pdf, settings.bankInfo, width - padding * 2 - 4);
    contentHeight += bankLines.length * TEXT_LINE_HEIGHT + 10;
  }

  drawFlatRect(pdf, x, y, width, contentHeight, { fill: style.white, stroke: style.border });

  const centerX = x + width / 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.paymentTitleSize);
  pdf.setTextColor(...style.roseDark);
  pdf.text("CONDITIONS DE PAIEMENT", centerX, cursor + 3, { align: "center" });
  cursor += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(style.paymentBodySize);
  pdf.setTextColor(...style.textSecondary);

  if (settings.paymentTerms) {
    const paymentLines = wrapText(pdf, settings.paymentTerms, width - padding * 2);
    paymentLines.forEach((line, index) => {
      pdf.text(line, centerX, cursor + 3 + index * TEXT_LINE_HEIGHT, { align: "center" });
    });
    cursor += paymentLines.length * TEXT_LINE_HEIGHT + 2;
  }

  if (settings.bankInfo) {
    const bankBoxX = x + padding;
    const bankBoxWidth = width - padding * 2;
    const bankLines = wrapText(pdf, settings.bankInfo, bankBoxWidth - 4);
    const bankBoxHeight = bankLines.length * TEXT_LINE_HEIGHT + 4;
    drawFlatRect(pdf, bankBoxX, cursor, bankBoxWidth, bankBoxHeight, {
      fill: style.white,
      stroke: [229, 231, 235],
    });
    bankLines.forEach((line, index) => {
      pdf.text(line, bankBoxX + bankBoxWidth / 2, cursor + 4 + index * TEXT_LINE_HEIGHT, {
        align: "center",
      });
    });
    cursor += bankBoxHeight + 2;
  }

  return y + contentHeight;
}

const DEFAULT_MENTIONS_BODY =
  "Document généré électroniquement. Aucun escompte accordé sauf indication contraire. En cas de retard de paiement, des pénalités peuvent être appliquées selon les conditions convenues.";

function measurePaymentCardHeight(pdf, settings, width) {
  const padding = BOX_PADDING;
  let contentHeight = padding * 2 + 6;

  if (settings.paymentTerms) {
    const paymentLines = wrapText(pdf, settings.paymentTerms, width - padding * 2);
    contentHeight += paymentLines.length * TEXT_LINE_HEIGHT + 2;
  }
  if (settings.bankInfo) {
    const bankLines = wrapText(pdf, settings.bankInfo, width - padding * 2 - 4);
    contentHeight += bankLines.length * TEXT_LINE_HEIGHT + 10;
  }

  return contentHeight;
}

function measureMentionsCardHeight(pdf, width, body = DEFAULT_MENTIONS_BODY) {
  const padding = BOX_PADDING;
  const bodyLines = wrapText(pdf, body, width - padding * 2);
  return padding * 2 + 5 + bodyLines.length * TEXT_LINE_HEIGHT + 2;
}

function measureTotalsCardHeight(totals) {
  return (totals.length - 1) * 7 + 10;
}

function measureThanksBlockHeight() {
  return BOX_PADDING * 2 + TEXT_LINE_HEIGHT * 2 + 1 + 2;
}

function measureDocumentFooterHeight(settings) {
  let height = 3.5 + 4 + 3.5;
  const contactParts = [
    settings.companyAddress,
    settings.companyPhone,
    settings.companyEmail,
  ].filter(Boolean);
  if (contactParts.length) height += 3.5;
  return height + 3.5 + 3.5;
}

function measureInvoiceBottomBlockHeight(pdf, settings, style, totals, leftColumnWidth) {
  const paymentHeight = measurePaymentCardHeight(pdf, settings, leftColumnWidth);
  const mentionsHeight = measureMentionsCardHeight(pdf, leftColumnWidth);
  const leftColumnHeight = paymentHeight + 2 + mentionsHeight;
  const totalsHeight = measureTotalsCardHeight(totals);
  const afterTableHeight = Math.max(leftColumnHeight, totalsHeight);
  return afterTableHeight + GAP + measureThanksBlockHeight() + measureDocumentFooterHeight(settings);
}

function layoutBottomAtPageFoot(pdf, contentStartY, blockHeight) {
  const pageBottom = PAGE_HEIGHT - MARGIN;
  const pageTop = MARGIN;

  if (blockHeight > pageBottom - pageTop) {
    pdf.addPage();
    contentStartY = pageTop;
  } else {
    const availableHeight = pageBottom - contentStartY;
    if (blockHeight > availableHeight) {
      pdf.addPage();
      contentStartY = pageTop;
    }
  }

  const minStartY = contentStartY === pageTop ? pageTop : contentStartY + GAP;
  const bottomAlignedStartY = pageBottom - blockHeight;
  return Math.max(minStartY, bottomAlignedStartY);
}

function drawMentionsCard(pdf, x, y, width, style, body = DEFAULT_MENTIONS_BODY) {
  const padding = BOX_PADDING;
  const bodyLines = wrapText(pdf, body, width - padding * 2);
  const boxHeight = measureMentionsCardHeight(pdf, width, body);

  drawFlatRect(pdf, x, y, width, boxHeight, { fill: style.white, stroke: style.border });

  const centerX = x + width / 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.paymentTitleSize);
  pdf.setTextColor(...style.roseDark);
  pdf.text("Mentions", centerX, y + padding + 3.5, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(style.mentionsBodySize);
  pdf.setTextColor(...style.textMuted);
  bodyLines.forEach((line, index) => {
    pdf.text(line, centerX, y + padding + 9 + index * TEXT_LINE_HEIGHT, { align: "center" });
  });

  return y + boxHeight;
}

function drawTotalsCard(pdf, totals, x, y, width, style) {
  let cursor = y;
  const rowHeight = 7;
  const finalHeight = 10;
  const cardHeight = (totals.length - 1) * rowHeight + finalHeight;

  drawFlatRect(pdf, x, cursor, width, cardHeight, { fill: style.white, stroke: style.border });

  totals.forEach(([label, value], index) => {
    const isFinal = index === totals.length - 1;
    if (isFinal) {
      pdf.setFillColor(...style.rose);
      pdf.rect(x, cursor, width, finalHeight, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(style.totalsFinalSize);
      pdf.setTextColor(...style.white);
      const labelWidth = pdf.getTextWidth(label);
      const valueWidth = pdf.getTextWidth(value);
      const gap = 6;
      const totalTextWidth = labelWidth + gap + valueWidth;
      const startX = x + (width - totalTextWidth) / 2;
      pdf.text(label, startX, cursor + 6.5);
      pdf.text(value, startX + labelWidth + gap, cursor + 6.5);
      cursor += finalHeight;
      return;
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(style.totalsLabelSize);
    pdf.setTextColor(...style.textMuted);
    pdf.text(label, x + BOX_PADDING, cursor + 4.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...style.textPrimary);
    pdf.text(value, x + width - BOX_PADDING, cursor + 4.5, { align: "right" });

    pdf.setDrawColor(241, 245, 249);
    pdf.line(x, cursor + rowHeight - 0.5, x + width, cursor + rowHeight - 0.5);
    cursor += rowHeight;
  });

  return y + cardHeight;
}

function drawThanksBlock(pdf, y, style) {
  const padding = BOX_PADDING;
  const boxHeight = padding * 2 + TEXT_LINE_HEIGHT * 2 + 1;

  drawFlatRect(pdf, MARGIN, y, CONTENT_WIDTH, boxHeight, { fill: style.white, stroke: style.border });

  const centerX = MARGIN + CONTENT_WIDTH / 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.thanksSize);
  pdf.setTextColor(...style.textPrimary);
  pdf.text("Merci pour votre confiance.", centerX, y + padding + 3.5, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  pdf.text("Pour toute question, n'hésitez pas à nous contacter.", centerX, y + padding + 3.5 + TEXT_LINE_HEIGHT + 1, {
    align: "center",
  });

  return y + boxHeight + 2;
}

function drawDocumentFooter(pdf, settings, y, style) {
  pdf.setDrawColor(229, 231, 235);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 3.5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.footerSize);
  pdf.setTextColor(...style.textPrimary);
  pdf.text(`${settings.companyName || "AC Creation"} — Personnalisation`, PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 4;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 116, 139);
  const contactParts = [
    settings.companyAddress,
    settings.companyPhone,
    settings.companyEmail,
  ].filter(Boolean);
  if (contactParts.length) {
    pdf.text(contactParts.join(" — "), PAGE_WIDTH / 2, y, { align: "center" });
    y += 3.5;
  }
  pdf.text(`N° TVA : ${settings.vatNumber || "-"}`, PAGE_WIDTH / 2, y, { align: "center" });

  return y + 3.5;
}

function drawDocumentHeader(pdf, settings, logoUrl, documentTitle, doc, style, options = {}) {
  const { company: companyWidth, title: titleWidth } = headColumnWidths();
  const companyX = MARGIN;
  const titleX = MARGIN + companyWidth + GAP;

  const companyBottom = drawCompanyBox(pdf, settings, logoUrl, companyX, MARGIN, companyWidth, style);
  const titleBottom = drawTitleBox(
    pdf,
    documentTitle,
    doc,
    titleX,
    MARGIN,
    titleWidth,
    style,
    options
  );

  return Math.max(companyBottom, titleBottom) + GAP;
}

function drawClientInfoGrid(pdf, doc, data, y, style, { isQuote, isDelivery }) {
  const cardWidth = (CONTENT_WIDTH - GAP) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + cardWidth + GAP;
  const client = (data.clients || []).find((c) => c.id === doc.clientId);

  const leftEntries = [{ value: client?.name || clientName(data, doc.clientId), bold: true }];
  [client?.company, client?.address, client?.email, client?.phone]
    .filter(Boolean)
    .forEach((value) => leftEntries.push({ value }));

  const rightEntries = [];
  if (isDelivery) {
    if (doc.deliveryAddress) rightEntries.push({ label: "Adresse", value: doc.deliveryAddress });
    if (doc.deliveryInfo) rightEntries.push({ label: "Infos", value: doc.deliveryInfo });
    rightEntries.push({ label: "Statut", value: doc.status || "—" });
  } else {
    rightEntries.push({ value: doc.convertedFrom || doc.number || "—", bold: true });
    rightEntries.push({ label: "Statut", value: doc.status || "—" });
    if (!isQuote && doc.invoiceType === "acompte" && doc.depositPercent) {
      rightEntries.push({ label: "Acompte", value: `${doc.depositPercent}%` });
    } else if (!isQuote && doc.invoiceType === "solde") {
      rightEntries.push({ label: "Type", value: "Facture de solde" });
      if (doc.depositPaidAmount != null) {
        rightEntries.push({
          label: "Acomptes payés",
          value: `${formatPdfMoney(doc.depositPaidAmount)} €`,
        });
      }
      if (doc.convertedFrom) {
        rightEntries.push({ label: "Devis", value: doc.convertedFrom });
      }
    } else {
      const deposit = computeDepositTotals(doc.totalTTC, doc.depositPercent);
      if (deposit.depositPercent > 0) {
        rightEntries.push({
          label: "Acompte",
          value: `${deposit.depositPercent}% (${formatPdfMoney(deposit.depositAmount)} €)`,
        });
      }
    }
    if (!isQuote && doc.dueDate) {
      rightEntries.push({ label: "Échéance", value: doc.dueDate });
    }
    if (isQuote && doc.promisedDeliveryDate) {
      rightEntries.push({ label: "Livraison prévue", value: doc.promisedDeliveryDate });
    }
  }

  const leftHeight = measureInfoCardHeight(
    pdf,
    isDelivery ? "LIVRÉ À" : "FACTURÉ À",
    leftEntries,
    cardWidth,
    style
  );
  const rightHeight = measureInfoCardHeight(
    pdf,
    isDelivery ? "LIVRAISON" : "RÉFÉRENCE",
    rightEntries,
    cardWidth,
    style
  );
  const cardHeight = Math.max(leftHeight, rightHeight, 24);

  drawInfoCard(pdf, isDelivery ? "LIVRÉ À" : "FACTURÉ À", leftEntries, leftX, y, cardWidth, cardHeight, style);
  drawInfoCard(
    pdf,
    isDelivery ? "LIVRAISON" : "RÉFÉRENCE",
    rightEntries,
    rightX,
    y,
    cardWidth,
    cardHeight,
    style
  );

  return y + cardHeight + GAP;
}

export function buildDeliveryNotePdf({ doc, data, logoDataUrl = null }) {
  const settings = data.settings || {};
  const style = getPdfStyleConfig();
  const lines = doc.lines?.length ? doc.lines : [];
  const documentTitle = "BON DE LIVRAISON";
  const logoUrl =
    logoDataUrl ||
    (settings.logoUrl && settings.logoUrl.trim() !== "" ? settings.logoUrl : APP_LOGO_URL);

  const pdf = new jsPDF("p", "mm", "a4");
  let y = drawDocumentHeader(pdf, settings, logoUrl, documentTitle, doc, style, { isDelivery: true });
  y = drawClientInfoGrid(pdf, doc, data, y, style, { isDelivery: true });
  y = drawInvoiceTable(pdf, lines, y, style, { isDelivery: true, products: data.products });

  const deliveryMentionsBody =
    "Le client reconnaît avoir reçu les articles ci-dessus en bon état. Date et signature du client : _______________________________";
  const mentionHeight = measureMentionsCardHeight(pdf, CONTENT_WIDTH, deliveryMentionsBody);
  const notesHeight = doc.notes
    ? wrapText(pdf, doc.notes, CONTENT_WIDTH - 8).length * TEXT_LINE_HEIGHT + 10
    : 0;
  const bottomBlockHeight =
    mentionHeight +
    GAP +
    notesHeight +
    measureThanksBlockHeight() +
    measureDocumentFooterHeight(settings);
  y = layoutBottomAtPageFoot(pdf, y, bottomBlockHeight);

  const mentionLines = wrapText(pdf, deliveryMentionsBody, CONTENT_WIDTH - BOX_PADDING * 2);
  drawFlatRect(pdf, MARGIN, y, CONTENT_WIDTH, mentionHeight, { fill: [255, 241, 247], stroke: style.border });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(style.paymentTitleSize);
  pdf.setTextColor(...style.roseDark);
  const mentionCenterX = MARGIN + CONTENT_WIDTH / 2;
  pdf.text("Réception", mentionCenterX, y + BOX_PADDING + 3.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(style.mentionsBodySize);
  pdf.setTextColor(...style.textMuted);
  mentionLines.forEach((line, index) => {
    pdf.text(line, mentionCenterX, y + BOX_PADDING + 9 + index * TEXT_LINE_HEIGHT, { align: "center" });
  });
  y += mentionHeight + GAP;

  if (doc.notes) {
    pdf.setFontSize(style.mentionsBodySize);
    pdf.setTextColor(...style.textMuted);
    wrapText(pdf, doc.notes, CONTENT_WIDTH - 8).forEach((line, index) => {
      pdf.text(line, MARGIN + 4, y + 4 + index * TEXT_LINE_HEIGHT);
    });
    y += notesHeight;
  }

  y = drawThanksBlock(pdf, y, style);
  drawDocumentFooter(pdf, settings, y, style);

  return pdf;
}

export function buildDocumentPdf({ doc, type, data, logoDataUrl = null }) {
  if (type === "delivery") {
    return buildDeliveryNotePdf({ doc, data, logoDataUrl });
  }

  const isQuote = type === "quote";
  const settings = data.settings || {};
  const style = getPdfStyleConfig();
  const lines = normalizeLines(doc);
  const paidAmount = Number(doc.paidAmount || 0);
  const remaining = doc.remaining != null ? Number(doc.remaining) : null;
  const footerTotals = getDocumentFooterTotals(doc, type);
  const amountDue = getDocumentAmountDue(doc, type, { remaining });
  const documentTitle =
    type === "invoice" && doc.invoiceType === "acompte"
      ? "FACTURE D'ACOMPTE"
      : type === "invoice" && doc.invoiceType === "solde"
        ? "FACTURE DE SOLDE"
      : isQuote
        ? "DEVIS"
        : "FACTURE";

  const logoUrl =
    logoDataUrl ||
    (settings.logoUrl && settings.logoUrl.trim() !== "" ? settings.logoUrl : APP_LOGO_URL);

  const pdf = new jsPDF("p", "mm", "a4");
  let y = drawDocumentHeader(pdf, settings, logoUrl, documentTitle, doc, style, { isQuote });
  y = drawClientInfoGrid(pdf, doc, data, y, style, { isQuote });
  y = drawInvoiceTable(pdf, lines, y, style, { isQuote, products: data.products });

  const totalsWidth = 72;
  const leftColumnWidth = CONTENT_WIDTH - totalsWidth - GAP;
  const totalsX = MARGIN + leftColumnWidth + GAP;
  const totals = [
    ["Sous-total HT", `${formatPdfMoney(doc.subtotal || doc.totalHT)} €`],
    [
      `Remise globale${doc.globalDiscount ? ` (${doc.globalDiscount}%)` : ""}`,
      `${formatPdfMoney(doc.globalDiscountAmount || 0)} €`,
    ],
    ["Total HT", `${formatPdfMoney(doc.totalHT)} €`],
    [`TVA à ${doc.taxRate || settings.taxRate || 0}%`, `${formatPdfMoney(doc.taxAmount)} €`],
  ];
  if (footerTotals.showQuoteDepositSplit) {
    const { quoteDeposit } = footerTotals;
    totals.push(["Total TTC", `${formatPdfMoney(doc.totalTTC)} €`]);
    totals.push([
      `Acompte (${quoteDeposit.depositPercent}%)`,
      `${formatPdfMoney(quoteDeposit.depositAmount)} €`,
    ]);
    totals.push(["Solde", `${formatPdfMoney(quoteDeposit.balanceAfterDeposit)} €`]);
  } else if (footerTotals.showSoldeBreakdown) {
    totals.push([
      "Total TTC devis",
      `${formatPdfMoney(footerTotals.quoteTotalTTCForSolde)} €`,
    ]);
    totals.push([
      "Acomptes payés",
      `− ${formatPdfMoney(footerTotals.depositPaidAmount)} €`,
    ]);
    totals.push(["Total TTC", `${formatPdfMoney(doc.totalTTC)} €`]);
  } else {
    totals.push(["Total TTC", `${formatPdfMoney(doc.totalTTC)} €`]);
  }
  if (paidAmount > 0.01 && amountDue > 0.01) {
    totals.push(["Déjà payé", `${formatPdfMoney(paidAmount)} €`]);
  }
  totals.push([
    isQuote && footerTotals.showQuoteDepositSplit ? "À PAYER (ACOMPTE)" : "À PAYER",
    `${formatPdfMoney(amountDue)} €`,
  ]);

  const bottomBlockHeight = measureInvoiceBottomBlockHeight(
    pdf,
    settings,
    style,
    totals,
    leftColumnWidth
  );
  y = layoutBottomAtPageFoot(pdf, y, bottomBlockHeight);

  const blockStartY = y;
  const paymentEnd = drawPaymentCard(pdf, settings, MARGIN, blockStartY, leftColumnWidth, style);
  const mentionsEnd = drawMentionsCard(pdf, MARGIN, paymentEnd + 2, leftColumnWidth, style);
  const totalsEnd = drawTotalsCard(pdf, totals, totalsX, blockStartY, totalsWidth, style);
  y = Math.max(mentionsEnd, totalsEnd) + GAP;

  y = drawThanksBlock(pdf, y, style);
  drawDocumentFooter(pdf, settings, y, style);

  return pdf;
}

export async function downloadDocumentPdf({ doc, type, data }) {
  const pdf = buildDocumentPdf({ doc, type, data });
  pdf.save(getDocumentFileName(doc, type));
}
