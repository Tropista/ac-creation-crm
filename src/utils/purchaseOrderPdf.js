import { jsPDF } from "jspdf";
import {
  getLowStockProducts,
  resolveProductSupplier,
  suggestedReorderQty,
} from "./stock";

const PAGE_WIDTH = 210;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  header: [17, 24, 39],
  muted: [100, 116, 139],
  border: [226, 232, 240],
  accent: [236, 72, 153],
};

function wrapText(pdf, text, maxWidth) {
  return pdf.splitTextToSize(String(text || "—"), maxWidth);
}

function formatPoDate() {
  return new Date().toLocaleDateString("fr-FR");
}

export function getPurchaseOrderPdfFileName(date = new Date()) {
  return `bon-commande-fournisseur-${date.toISOString().slice(0, 10)}.pdf`;
}

export function buildPurchaseOrderPdf({ products = [], suppliers = [], settings = {} }) {
  const lowStock = getLowStockProducts(products, 999);
  const company = settings.companyName || "AC Creation";
  const pdf = new jsPDF("p", "mm", "a4");
  let y = MARGIN;

  pdf.setFillColor(...COLORS.header);
  pdf.rect(0, 0, PAGE_WIDTH, 28, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.text("BON DE COMMANDE FOURNISSEUR", MARGIN, 12);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(company, MARGIN, 20);
  pdf.text(`Date : ${formatPoDate()}`, PAGE_WIDTH - MARGIN, 20, { align: "right" });
  y = 36;

  pdf.setFontSize(9);
  pdf.setTextColor(...COLORS.muted);
  pdf.text(
    lowStock.length
      ? `${lowStock.length} produit(s) en stock bas — document interne CRM`
      : "Aucun produit en stock bas",
    MARGIN,
    y
  );
  y += 8;

  if (settings.companyAddress) {
    wrapText(pdf, settings.companyAddress, CONTENT_WIDTH).forEach((line, index) => {
      pdf.text(line, MARGIN, y + index * 4.2);
    });
    y += 10;
  }

  const colWidths = [42, 18, 18, 18, 28, 38, 28];
  const headers = ["Produit", "SKU", "Stock", "Seuil", "Qté", "Fournisseur", "Email"];

  pdf.setFillColor(...COLORS.accent);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);

  let colX = MARGIN + 2;
  headers.forEach((header, index) => {
    pdf.text(header, colX, y + 5.5);
    colX += colWidths[index];
  });
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...COLORS.header);

  const rows =
    lowStock.length > 0
      ? lowStock
      : [{ name: "Aucun produit sous le seuil minimum", sku: "—", stock: 0, stockMin: 0 }];

  rows.forEach((product, rowIndex) => {
    const supplier = resolveProductSupplier(product, suppliers);
    const cells = [
      product.name || "Produit",
      product.sku || "—",
      String(product.stock ?? 0),
      String(product.stockMin || product.minStock || 0),
      lowStock.length ? String(suggestedReorderQty(product)) : "—",
      supplier?.name || product.supplier || "À définir",
      supplier?.email || "",
    ];

    const cellLines = cells.map((cell, index) => wrapText(pdf, cell, colWidths[index] - 2));
    const maxLines = Math.max(...cellLines.map((entry) => entry.length), 1);
    const rowHeight = Math.max(7, maxLines * 4 + 2);

    if (y + rowHeight > 285) {
      pdf.addPage();
      y = MARGIN;
    }

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(252, 231, 243);
      pdf.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, "F");
    }

    pdf.setDrawColor(...COLORS.border);
    pdf.rect(MARGIN, y, CONTENT_WIDTH, rowHeight);

    colX = MARGIN + 2;
    cellLines.forEach((wrapped, index) => {
      wrapped.forEach((line, lineIndex) => {
        pdf.text(line, colX, y + 4.5 + lineIndex * 4);
      });
      colX += colWidths[index];
    });

    y += rowHeight;
  });

  y += 6;
  pdf.setFontSize(7);
  pdf.setTextColor(...COLORS.muted);
  pdf.text(
    "Document généré par AC Creation CRM — non envoyé automatiquement au fournisseur.",
    MARGIN,
    Math.min(y + 4, 290)
  );

  return pdf;
}

export function downloadPurchaseOrderPdf({ products, suppliers, settings }) {
  const pdf = buildPurchaseOrderPdf({ products, suppliers, settings });
  pdf.save(getPurchaseOrderPdfFileName());
}
