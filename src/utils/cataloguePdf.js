import { jsPDF } from "jspdf";
import { APP_LOGO_URL } from "./assets";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const COL_GAP = 6;
const COLS = 2;
const COL_W = (PAGE_W - MARGIN * 2 - COL_GAP * (COLS - 1)) / COLS;
const CARD_H = 52;
const IMG_SIZE = 28;
const ROSE = [236, 72, 153];
const DARK = [17, 24, 39];
const MUTED = [100, 116, 139];
const BORDER = [229, 231, 235];

// fr-LU (et non fr-FR) : même locale que money() utilisé par l'aperçu et le téléchargement.
// fr-FR insère un espace fine insécable (U+202F) comme séparateur de milliers, caractère que
// la police standard "helvetica" de jsPDF ne sait pas rendre (il s'affiche comme un "/" corrompu).
export function formatCataloguePrice(value) {
  return Number(value || 0).toLocaleString("fr-LU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function drawCard(pdf, product, x, y) {
  // Fond carte
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...BORDER);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(x, y, COL_W, CARD_H, 3, 3, "FD");

  // Image (si base64 disponible)
  const imgSrc = product.imageDataUrl || product.imageUrl || "";
  if (imgSrc && (imgSrc.startsWith("data:") || imgSrc.startsWith("blob:"))) {
    try {
      pdf.addImage(imgSrc, "JPEG", x + 3, y + 3, IMG_SIZE, IMG_SIZE, undefined, "FAST");
    } catch { /* pas d'image */ }
  } else {
    pdf.setFillColor(248, 250, 252);
    pdf.rect(x + 3, y + 3, IMG_SIZE, IMG_SIZE, "F");
    pdf.setFontSize(18);
    pdf.setTextColor(200, 200, 200);
    pdf.text("📦", x + 3 + IMG_SIZE / 2, y + 3 + IMG_SIZE / 2 + 3, { align: "center" });
  }

  const textX = x + IMG_SIZE + 7;
  const textW = COL_W - IMG_SIZE - 10;

  // Nom
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...DARK);
  const nameLines = pdf.splitTextToSize(product.name || "—", textW);
  nameLines.slice(0, 2).forEach((line, i) => {
    pdf.text(line, textX, y + 8 + i * 4);
  });

  // SKU
  if (product.sku) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...MUTED);
    pdf.text(`Réf : ${product.sku}`, textX, y + 18);
  }

  // Catégorie
  if (product.categoryLabel) {
    pdf.setFontSize(6.5);
    pdf.setTextColor(...MUTED);
    pdf.text(product.categoryLabel, textX, y + 23);
  }

  // Description courte
  if (product.description) {
    pdf.setFontSize(6.5);
    pdf.setTextColor(...MUTED);
    const desc = pdf.splitTextToSize(product.description, textW);
    desc.slice(0, 2).forEach((line, i) => {
      pdf.text(line, textX, y + 29 + i * 3.5);
    });
  }

  // Prix
  if (product.price != null) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...ROSE);
    const priceStr = `${formatCataloguePrice(product.price)} €`;
    pdf.text(priceStr, x + COL_W - 4, y + CARD_H - 6, { align: "right" });
  }
}

function drawHeader(pdf, settings, logoUrl, page, totalPages) {
  pdf.setFillColor(...ROSE);
  pdf.rect(0, 0, PAGE_W, 14, "F");

  try {
    pdf.addImage(logoUrl, "PNG", MARGIN, 1.5, 10, 10, undefined, "FAST");
  } catch { /* logo optionnel */ }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(255, 255, 255);
  pdf.text(settings.companyName || "AC Creation", MARGIN + 13, 9);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("CATALOGUE PRODUITS", PAGE_W / 2, 9, { align: "center" });

  pdf.setFontSize(7);
  pdf.text(`Page ${page}/${totalPages}`, PAGE_W - MARGIN, 9, { align: "right" });
}

function drawCategoryTitle(pdf, label, y) {
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(...BORDER);
  pdf.rect(MARGIN, y, PAGE_W - MARGIN * 2, 7, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...DARK);
  pdf.text(label.toUpperCase(), MARGIN + 3, y + 4.8);
  return y + 9;
}

export function buildCataloguePdf({ products = [], categories = [], settings = {}, logoDataUrl = null }) {
  const logoUrl = logoDataUrl || (settings.logoUrl?.trim() ? settings.logoUrl : APP_LOGO_URL);

  // Enrichir les produits avec le label de catégorie
  const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name || c.label || ""]));
  const enriched = products.map((p) => ({
    ...p,
    categoryLabel: catMap[p.category] || p.category || "Divers",
  }));

  // Grouper par catégorie
  const grouped = {};
  for (const p of enriched) {
    const k = p.categoryLabel || "Divers";
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(p);
  }

  // Calculer le nombre de pages
  let totalCards = 0;
  const CARDS_PER_ROW = COLS;
  const TOP_Y = 18;
  const BOTTOM_Y = PAGE_H - 14;
  const usableH = BOTTOM_Y - TOP_Y;

  for (const [, prods] of Object.entries(grouped)) {
    totalCards += 2 + Math.ceil(prods.length / CARDS_PER_ROW); // catTitle + rows
  }
  const rowH = CARD_H + 4;
  const rowsPerPage = Math.floor(usableH / rowH);
  const totalPages = Math.max(1, Math.ceil(totalCards / rowsPerPage));

  const pdf = new jsPDF("p", "mm", "a4");
  let page = 1;
  let y = TOP_Y;

  function newPage() {
    pdf.addPage();
    page++;
    y = TOP_Y;
    drawHeader(pdf, settings, logoUrl, page, totalPages);
  }

  drawHeader(pdf, settings, logoUrl, 1, totalPages);

  for (const [catLabel, prods] of Object.entries(grouped)) {
    // Titre catégorie
    if (y + 9 > BOTTOM_Y) newPage();
    y = drawCategoryTitle(pdf, catLabel, y);

    // Cartes par rangées de 2
    for (let i = 0; i < prods.length; i += COLS) {
      if (y + CARD_H > BOTTOM_Y) newPage();
      for (let col = 0; col < COLS; col++) {
        const prod = prods[i + col];
        if (!prod) break;
        const x = MARGIN + col * (COL_W + COL_GAP);
        drawCard(pdf, prod, x, y);
      }
      y += CARD_H + 4;
    }
    y += 2;
  }

  // Footer dernière page
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(
    [settings.companyAddress, settings.companyPhone, settings.companyEmail].filter(Boolean).join(" — "),
    PAGE_W / 2, PAGE_H - 5, { align: "center" }
  );

  return pdf;
}

async function loadImageAsDataUrl(url) {
  if (!url) return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadCataloguePdf({ products = [], categories = [], settings = {}, logoDataUrl = null }) {
  // Pré-charger les images produits en base64 pour les inclure dans le PDF
  const enriched = await Promise.all(
    (products || []).map(async (p) => {
      const imageDataUrl = await loadImageAsDataUrl(p.imageUrl || "");
      return { ...p, imageDataUrl };
    })
  );
  const pdf = buildCataloguePdf({ products: enriched, categories, settings, logoDataUrl });
  pdf.save("catalogue-ac-creation.pdf");
}
