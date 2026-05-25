import { uid } from "./documents";

const templateLine = ({
  description,
  quantity = 1,
  price = 0,
  technique = "",
  emplacementMarquage = "",
  taille = "",
  couleur = "",
  sku = "",
}) => ({
  productId: "",
  sku,
  description,
  quantity,
  price,
  discount: 0,
  taille,
  couleur,
  emplacementMarquage,
  technique,
});

export const BUILTIN_QUOTE_TEMPLATES = [
  {
    id: "builtin-dtf",
    name: "Pack DTF — marquage textile",
    builtIn: true,
    processType: "dtf",
    globalDiscount: 0,
    depositPercent: 0,
    lines: [
      templateLine({
        description: "Marquage DTF — poitrine (A4 max)",
        quantity: 10,
        price: 8.5,
        technique: "DTF",
        emplacementMarquage: "Poitrine",
      }),
      templateLine({
        description: "Marquage DTF — dos (A3 max)",
        quantity: 10,
        price: 12,
        technique: "DTF",
        emplacementMarquage: "Dos",
      }),
      templateLine({
        description: "T-shirt premium (fourni client ou AC Creation)",
        quantity: 10,
        price: 6.5,
        taille: "M",
        couleur: "Noir",
      }),
    ],
  },
  {
    id: "builtin-laser",
    name: "Pack gravure laser",
    builtIn: true,
    processType: "laser",
    globalDiscount: 0,
    depositPercent: 0,
    lines: [
      templateLine({
        description: "Gravure laser — plaque bois 30×20 cm",
        quantity: 1,
        price: 35,
        technique: "Laser",
      }),
      templateLine({
        description: "Gravure laser — acrylique transparent 15×10 cm",
        quantity: 1,
        price: 22,
        technique: "Laser",
      }),
      templateLine({
        description: "Frais de préparation fichier vectoriel",
        quantity: 1,
        price: 15,
      }),
    ],
  },
  {
    id: "builtin-tshirt",
    name: "T-shirt standard personnalisé",
    builtIn: true,
    processType: "dtf",
    globalDiscount: 0,
    depositPercent: 0,
    lines: [
      templateLine({
        description: "T-shirt coton — impression personnalisée",
        quantity: 25,
        price: 14.9,
        taille: "M",
        couleur: "Blanc",
        technique: "DTF",
        emplacementMarquage: "Poitrine",
      }),
    ],
  },
  {
    id: "builtin-uvdtf",
    name: "Pack UV-DTF — objets & textiles",
    builtIn: true,
    processType: "uv-dtf",
    globalDiscount: 0,
    depositPercent: 0,
    lines: [
      templateLine({
        description: "Marquage UV-DTF — textile technique",
        quantity: 5,
        price: 18,
        technique: "UV-DTF",
        emplacementMarquage: "Poitrine",
      }),
      templateLine({
        description: "Marquage UV-DTF — objet rigide (casquette / mug)",
        quantity: 5,
        price: 9.5,
        technique: "UV-DTF",
      }),
    ],
  },
];

export function getQuoteTemplates(settings = {}) {
  const custom = (settings.quoteTemplates || []).filter(
    (entry) => entry && !entry.builtIn && entry.id && entry.name
  );
  return [...BUILTIN_QUOTE_TEMPLATES, ...custom];
}

export function findQuoteTemplate(settings, templateId) {
  return getQuoteTemplates(settings).find(
    (entry) => String(entry.id) === String(templateId)
  );
}

export function applyQuoteTemplate(template) {
  if (!template) return null;

  return {
    processType: template.processType || "",
    globalDiscount: Number(template.globalDiscount || 0),
    depositPercent: Number(template.depositPercent || 0),
    lines: (template.lines || []).map((line) => ({
      productId: "",
      sku: line.sku || "",
      category: line.category || "",
      categoryId: line.categoryId || "",
      description: line.description || "",
      quantity: Number(line.quantity || 1),
      price: Number(line.price || 0),
      discount: Number(line.discount || 0),
      taille: line.taille || "",
      couleur: line.couleur || "",
      emplacementMarquage: line.emplacementMarquage || "",
      technique: line.technique || "",
    })),
  };
}

export function createQuoteTemplateFromForm(form, name) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    throw new Error("Le nom du modèle est obligatoire.");
  }

  const lines = (form.lines || [])
    .filter((line) => line.description && Number(line.quantity || 0) > 0)
    .map((line) => ({
      sku: line.sku || "",
      category: line.category || "",
      categoryId: line.categoryId || "",
      description: line.description || "",
      quantity: Number(line.quantity || 1),
      price: Number(line.price || 0),
      discount: Number(line.discount || 0),
      taille: line.taille || "",
      couleur: line.couleur || "",
      emplacementMarquage: line.emplacementMarquage || "",
      technique: line.technique || "",
    }));

  if (lines.length === 0) {
    throw new Error("Ajoutez au moins une ligne avant d'enregistrer un modèle.");
  }

  return {
    id: uid(),
    name: trimmedName,
    builtIn: false,
    processType: form.processType || "",
    globalDiscount: Number(form.globalDiscount || 0),
    depositPercent: Number(form.depositPercent || 0),
    lines,
    createdAt: new Date().toISOString(),
  };
}

export function addQuoteTemplate(settings, template) {
  const existing = settings.quoteTemplates || [];
  return {
    ...settings,
    quoteTemplates: [...existing.filter((entry) => entry.id !== template.id), template],
  };
}

export function removeQuoteTemplate(settings, templateId) {
  return {
    ...settings,
    quoteTemplates: (settings.quoteTemplates || []).filter(
      (entry) => String(entry.id) !== String(templateId)
    ),
  };
}
