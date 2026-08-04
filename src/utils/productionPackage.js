import { strToU8, unzipSync, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { getSupabase } from "../supabase.js";

function safeName(value, fallback) {
  const name = String(value || fallback).replace(/[<>:"/\\|?*]+/g, "_");
  return name || fallback;
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function resourceUrl(resource) {
  if (typeof resource === "string") return resource;
  return resource?.url || resource?.signedUrl || resource?.dataUrl || "";
}

function resourceName(resource, fallback) {
  if (typeof resource === "string") return fallback;
  return safeName(
    resource?.name ||
      resource?.filename ||
      resource?.storage_path?.split("/").at(-1),
    fallback,
  );
}

async function createFreshSignedUrl(resource) {
  if (resource?.bucket && resource?.storagePath) {
    const client = await getSupabase();
    const signed = await client.storage
      .from(resource.bucket)
      .createSignedUrl(resource.storagePath, 300);
    if (signed.error || !signed.data?.signedUrl)
      throw new Error(`PRODUCTION_RESOURCE_SIGNING_FAILED:${resource.id}`);
    return signed.data.signedUrl;
  }
  return "";
}

async function fetchBytes(resource) {
  let url = resourceUrl(resource) || (await createFreshSignedUrl(resource));
  if (!url) return null;
  let response = await fetch(url);
  if (!response.ok && resource?.bucket && resource?.storagePath) {
    url = await createFreshSignedUrl(resource);
    response = await fetch(url);
  }
  if (!response.ok)
    throw new Error(
      `PRODUCTION_RESOURCE_UNAVAILABLE:${resource?.id || "unknown"}`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

function bytesEqual(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

export function pngDimensions(bytes) {
  if (
    bytes.length < 24 ||
    !bytesEqual(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function ascii(bytes, start, end) {
  return new TextDecoder("ascii").decode(bytes.slice(start, end));
}

function extensionOf(resource) {
  return String(
    resource?.name ||
      resource?.filename ||
      resource?.storagePath ||
      resource?.storage_path ||
      "",
  )
    .split(/[?#]/)[0]
    .split(".")
    .at(-1)
    ?.toLowerCase();
}

export function detectProductionFormat(resource, bytes = null) {
  const descriptor =
    `${resource?.mimeType || ""} ${resource?.type || ""} ${resource?.format || ""} ${extensionOf(resource) || ""}`.toLowerCase();
  let detected = null;
  if (bytes?.length) {
    const beginning = new TextDecoder().decode(bytes.slice(0, 256));
    if (bytesEqual(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) detected = "png";
    else if (bytesEqual(bytes, [255, 216, 255])) detected = "jpeg";
    else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
      detected = "webp";
    else if (/^\s*(?:<\?xml[^>]*>\s*)?<svg/i.test(beginning)) detected = "svg";
    else if (ascii(bytes, 0, 4) === "wOF2") detected = "woff2";
    else if (ascii(bytes, 0, 4) === "wOFF") detected = "woff";
    else if (ascii(bytes, 0, 4) === "OTTO") detected = "otf";
    else if (bytesEqual(bytes, [0, 1, 0, 0])) detected = "ttf";
  }
  const format =
    detected ||
    ["woff2", "woff", "otf", "ttf", "svg", "webp", "jpeg", "jpg", "png"].find(
      (value) => descriptor.includes(value),
    );
  return format === "jpg" ? "jpeg" : format || "binary";
}

export function productionFormatLabel(resource, bytes = null) {
  return {
    png: "PNG Image",
    jpeg: "JPEG Image",
    webp: "WebP Image",
    svg: "SVG Vectoriel",
    ttf: "Police TrueType",
    otf: "Police OpenType",
    woff: "Police WebFont WOFF",
    woff2: "Police WebFont WOFF2",
    binary: "Fichier binaire",
  }[detectProductionFormat(resource, bytes)];
}

export function productionErrorMessage(error) {
  const code = String(error?.message || error || "").split(":")[0];
  const messages = {
    PRODUCTION_RESOURCE_UNAVAILABLE: "Impossible de télécharger la ressource.",
    PRODUCTION_RESOURCE_SIGNING_FAILED:
      "Impossible de renouveler l’accès à la ressource.",
    PRODUCTION_RESOURCE_URL_MISSING: "La ressource n’est plus accessible.",
    PRODUCTION_RESOURCE_EMPTY: "La ressource téléchargée est vide.",
    PRODUCTION_RESOURCE_CHECKSUM_MISMATCH:
      "Le contrôle d’intégrité de la ressource a échoué.",
    PRODUCTION_RESOURCE_PLACEHOLDER:
      "Une ressource de démonstration a été détectée.",
    PRODUCTION_PRINT_DIMENSIONS_INVALID:
      "Le fichier d’impression n’a pas les dimensions attendues.",
    PRODUCTION_PREVIEW_TOO_SMALL: "L’aperçu HD est trop petit.",
    PRODUCTION_PRINT_PNG_REQUIRED: "Le PNG d’impression est absent ou ambigu.",
    PRODUCTION_FONT_NOT_EXPORTABLE:
      "Une police non exportable n’a pas été convertie en courbes.",
    PRODUCTION_PACKAGE_INVALID:
      "Le package de production est incomplet ou invalide.",
  };
  return messages[code] || "Impossible de préparer le dossier de production.";
}

export async function validateBinaryResource(resource, bytes, options = {}) {
  if (!bytes?.length)
    throw new Error(`PRODUCTION_RESOURCE_EMPTY:${resource?.id || "unknown"}`);
  const format = detectProductionFormat(resource, bytes);
  if (/demo\//i.test(JSON.stringify(resource)))
    throw new Error(`PRODUCTION_RESOURCE_PLACEHOLDER:${resource.id}`);
  let dimensions = null;
  if (format === "png") {
    dimensions = pngDimensions(bytes);
    if (!dimensions) throw new Error(`PRODUCTION_PNG_INVALID:${resource.id}`);
  } else if (format === "jpeg") {
    if (!bytesEqual(bytes, [255, 216, 255]))
      throw new Error(`PRODUCTION_JPEG_INVALID:${resource.id}`);
  } else if (format === "webp") {
    if (
      new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF" ||
      new TextDecoder().decode(bytes.slice(8, 12)) !== "WEBP"
    )
      throw new Error(`PRODUCTION_WEBP_INVALID:${resource.id}`);
  } else if (format === "svg") {
    const content = new TextDecoder().decode(bytes);
    if (!/<svg(?:\s|>)[\s\S]*<\/svg>\s*$/i.test(content.trim()))
      throw new Error(`PRODUCTION_SVG_INVALID:${resource.id}`);
  } else if (format === "woff2") {
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "wOF2")
      throw new Error(`PRODUCTION_FONT_INVALID:${resource.id}`);
  } else if (format === "woff") {
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "wOFF")
      throw new Error(`PRODUCTION_FONT_INVALID:${resource.id}`);
  } else if (format === "otf") {
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "OTTO")
      throw new Error(`PRODUCTION_FONT_INVALID:${resource.id}`);
  } else if (format === "ttf") {
    if (!bytesEqual(bytes, [0, 1, 0, 0]))
      throw new Error(`PRODUCTION_FONT_INVALID:${resource.id}`);
  }
  const checksum = await sha256(bytes);
  if (resource?.checksum && checksum !== resource.checksum)
    throw new Error(`PRODUCTION_RESOURCE_CHECKSUM_MISMATCH:${resource.id}`);
  if (options.expectedDimensions && dimensions) {
    const { width, height } = options.expectedDimensions;
    if (dimensions.width !== width || dimensions.height !== height)
      throw new Error(`PRODUCTION_PRINT_DIMENSIONS_INVALID:${resource.id}`);
  }
  if (
    options.minimumLongestSide &&
    dimensions &&
    Math.max(dimensions.width, dimensions.height) < options.minimumLongestSide
  )
    throw new Error(`PRODUCTION_PREVIEW_TOO_SMALL:${resource.id}`);
  return {
    checksum,
    size: bytes.length,
    dimensions,
    format,
    formatLabel: productionFormatLabel(resource, bytes),
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function inspectProductionArtifacts(quote) {
  const ecommerce = quote?.ecommerce || {};
  const assets = asList(ecommerce.assets);
  const resources = asList(ecommerce.resources);
  const images = assets.filter((asset) => {
    const descriptor = String(
      asset?.type ||
        asset?.mimeType ||
        asset?.role ||
        asset?.kind ||
        asset?.name ||
        asset?.storage_path ||
        "",
    );
    return !/svg/i.test(descriptor) && /image|png|jpe?g|webp/i.test(descriptor);
  });
  const svgs = assets.filter((asset) =>
    /svg/i.test(
      String(
        asset?.type ||
          asset?.mimeType ||
          asset?.role ||
          asset?.kind ||
          asset?.name ||
          asset?.storage_path ||
          "",
      ),
    ),
  );
  const printPngs = resources.filter(
    (resource) =>
      /png/i.test(
        String(resource?.format || resource?.mimeType || resource?.name || ""),
      ) &&
      /production|impression/i.test(
        String(resource?.role || resource?.kind || resource?.name || ""),
      ),
  );
  const preview =
    resources.find((resource) =>
      /preview/i.test(
        String(
          resource?.role ||
            resource?.kind ||
            resource?.name ||
            resource?.storagePath ||
            "",
        ),
      ),
    ) || ecommerce.preview;
  return {
    images,
    svgs,
    fonts: asList(ecommerce.fonts),
    printPngs,
    preview,
    snapshot: ecommerce.snapshot || null,
    project:
      ecommerce.project ||
      ecommerce.composition ||
      ecommerce.snapshot?.project ||
      quote?.lines?.[0]?.snapshot ||
      null,
    resumeUrl: ecommerce.resumeUrl || ecommerce.configuratorUrl || "",
    production: asList(ecommerce.production),
  };
}

export function buildProductionManifest(quote, files = []) {
  const artifacts = inspectProductionArtifacts(quote);
  const snapshot = quote?.lines?.[0]?.snapshot || {};
  const zone =
    quote?.lines?.flatMap((line) => line.snapshot?.printZones || [])[0] ||
    quote?.lines?.[0]?.snapshot?.production?.dimensions ||
    snapshot.production?.dimensions ||
    null;
  const productionFile = files.find((file) =>
    file.path.startsWith("Impression_"),
  );
  const printArea =
    productionFile?.widthMm && productionFile?.heightMm
      ? {
          widthMm: productionFile.widthMm,
          heightMm: productionFile.heightMm,
          dpi: productionFile.dpi,
          widthPx: productionFile.widthPx,
          heightPx: productionFile.heightPx,
          effectiveDpi: productionFile.effectiveDpi,
          checksum: productionFile.checksum,
        }
      : zone;
  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    order: {
      id: quote.id,
      number: quote.number,
      externalOrderId: quote.ecommerce?.externalOrderId,
      date: quote.ecommerce?.receivedAt || quote.date,
      currency: quote.currency,
      total: Number(quote.totalTTC || 0),
    },
    customer: { id: quote.clientId },
    products: (quote.lines || []).map((line) => ({
      id: line.id,
      name: line.description,
      quantity: Number(line.quantity || 0),
      technique: line.technique || "",
      variants: line.variants || line.snapshot?.variants || [],
    })),
    printArea,
    artifacts: {
      images: artifacts.images.length,
      svgs: artifacts.svgs.length,
      fonts: artifacts.fonts.length,
      printPngs: artifacts.printPngs.length,
      snapshot: Boolean(artifacts.snapshot),
      project: Boolean(artifacts.project),
      preview: Boolean(artifacts.preview),
    },
    productionFile,
    layers: (snapshot.layers || []).map((layer, index) => ({
      id: layer.id,
      type: layer.type,
      name: layer.name || `${layer.type || "calque"} ${index + 1}`,
      xMm: layer.xMm ?? layer.x,
      yMm: layer.yMm ?? layer.y,
      widthMm: layer.widthMm ?? layer.width,
      heightMm: layer.heightMm ?? layer.height,
      rotationDeg: layer.rotationDeg ?? layer.rotation ?? 0,
      opacity: layer.opacity ?? 1,
      order: layer.order ?? index,
      visible: !layer.hidden,
      locked: Boolean(layer.locked),
      text: layer.type === "text" ? layer.text : undefined,
      fontFamily: layer.type === "text" ? layer.fontFamily : undefined,
      fontSize: layer.type === "text" ? layer.fontSize : undefined,
      color: layer.color,
      assetId: layer.assetId,
    })),
    files,
  };
}

export async function buildProductionPdf(
  quote,
  client,
  previewBytes = null,
  fileRecords = [],
) {
  const pdf = new jsPDF("p", "mm", "a4");
  pdf.setFillColor(248, 200, 220);
  pdf.rect(0, 0, 210, 24, "F");
  pdf.setTextColor(31, 41, 55);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("AC CRÉATION · BON DE PRODUCTION", 14, 15);
  pdf.setFontSize(10);
  pdf.text(quote.number || "Commande", 196, 15, { align: "right" });
  pdf.setFont("helvetica", "normal");
  const rows = [
    ["Client", client?.name || client?.email || quote.clientId || "—"],
    [
      "Adresse",
      [
        quote.shippingAddress?.addressLine1,
        quote.shippingAddress?.postalCode,
        quote.shippingAddress?.city,
      ]
        .filter(Boolean)
        .join(", ") || "Non renseignée",
    ],
    [
      "Date",
      new Date(quote.ecommerce?.receivedAt || quote.date).toLocaleString(
        "fr-FR",
      ),
    ],
    [
      "Paiement",
      quote.ecommerce?.paymentStatus === "paid" ? "Confirme" : "A verifier",
    ],
    ["Livraison", String(quote.deliveryMethod?.name || quote.shipping || "—")],
    [
      "Total TTC",
      `${Number(quote.totalTTC || 0).toFixed(2)} ${quote.currency || "EUR"}`,
    ],
  ];
  let y = 34;
  for (const [label, value] of rows) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label} :`, 14, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(value), 48, y);
    y += 7;
  }
  if (previewBytes) {
    try {
      const dataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...previewBytes))}`;
      pdf.addImage(dataUrl, "PNG", 112, 31, 82, 58, undefined, "FAST");
    } catch {
      // Preview facultative.
    }
  }
  y = 90;
  pdf.setFont("helvetica", "bold");
  pdf.text("PRODUITS", 14, y);
  y += 7;
  for (const line of quote.lines || []) {
    pdf.setFont("helvetica", "normal");
    pdf.text(`${line.quantity || 0} x ${line.description || "Produit"}`, 14, y);
    pdf.text(String(line.technique || ""), 196, y, { align: "right" });
    y += 7;
  }
  const snapshot = quote.lines?.[0]?.snapshot || {};
  const dimensions = snapshot.production?.dimensions ||
    snapshot.printZones?.[0] || { width: 210, height: 90 };
  const dpi = Number(snapshot.production?.resolutionDpi || 300);
  const widthPx = Math.round((Number(dimensions.width) / 25.4) * dpi);
  const heightPx = Math.round((Number(dimensions.height) / 25.4) * dpi);
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.text("PARAMETRES D'IMPRESSION", 14, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  const effectiveDpi = Math.min(
    widthPx / (Number(dimensions.width) / 25.4),
    heightPx / (Number(dimensions.height) / 25.4),
  );
  pdf.text(
    `${dimensions.width} × ${dimensions.height} mm | ${widthPx} × ${heightPx} px | ${dpi} DPI (effectif ${effectiveDpi.toFixed(2)}) | sRGB`,
    14,
    y,
  );
  y += 7;
  pdf.text("Fichier : Impression_1_1.png", 14, y);
  y += 9;
  pdf.setFont("helvetica", "bold");
  pdf.text("CALQUES", 14, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  for (const [index, layer] of (snapshot.layers || []).entries()) {
    const label =
      layer.type === "text"
        ? `${layer.text || "Texte vide"} | ${layer.fontFamily || "Police inconnue"}`
        : layer.name || layer.assetId || layer.type;
    pdf.text(
      `${index + 1}. ${label} | X ${layer.xMm ?? layer.x ?? "-"} mm | Y ${layer.yMm ?? layer.y ?? "-"} mm | ${layer.widthMm ?? layer.width ?? "-"} × ${layer.heightMm ?? layer.height ?? "-"} mm | ${layer.rotationDeg ?? layer.rotation ?? 0}° | ${layer.color || "couleur source"}`,
      14,
      y,
      { maxWidth: 180 },
    );
    y += 6;
    if (y > 225) break;
  }
  if (quote.ecommerce?.resumeUrl) {
    const qr = await QRCode.toDataURL(quote.ecommerce.resumeUrl, {
      width: 180,
      margin: 1,
    });
    pdf.addImage(qr, "PNG", 158, 238, 36, 36);
    pdf.setFontSize(8);
    pdf.text("Rouvrir le projet", 176, 278, { align: "center" });
  }
  pdf.setFontSize(8);
  pdf.text(
    "Fichiers et checksums SHA-256 : voir Manifest.json · Reconstruction : Reconstruction.json",
    14,
    286,
  );
  if (fileRecords.length) {
    pdf.addPage();
    pdf.setFillColor(248, 200, 220);
    pdf.rect(0, 0, 210, 20, "F");
    pdf.setTextColor(31, 41, 55);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("FICHIERS ET INTÉGRITÉ", 14, 13);
    let fileY = 29;
    for (const file of fileRecords) {
      if (fileY > 274) {
        pdf.addPage();
        fileY = 18;
      }
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(`${file.path} · ${file.size} octets`, 14, fileY);
      fileY += 4;
      pdf.setFont("courier", "normal");
      pdf.setFontSize(7);
      pdf.text(`SHA-256 ${file.checksum}`, 14, fileY);
      fileY += 7;
    }
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

export async function downloadProductionPdf(quote, client) {
  const artifacts = inspectProductionArtifacts(quote);
  const previewBytes = await fetchBytes(artifacts.preview);
  const bytes = await buildProductionPdf(quote, client, previewBytes);
  downloadBytes(
    bytes,
    `Bon_Production_${safeName(quote.number, quote.id)}.pdf`,
    "application/pdf",
  );
}

export async function downloadProductionResource(
  resource,
  filename,
  type = "application/octet-stream",
) {
  const bytes = await fetchBytes(resource);
  if (!bytes) throw new Error("PRODUCTION_RESOURCE_URL_MISSING");
  downloadBytes(bytes, filename, type);
}

export async function createProductionObjectUrl(
  resource,
  type = "application/octet-stream",
) {
  const bytes = await fetchBytes(resource);
  if (!bytes) throw new Error("PRODUCTION_RESOURCE_URL_MISSING");
  return URL.createObjectURL(new Blob([bytes], { type }));
}

export async function buildProductionPackage({ quote, client }) {
  const artifacts = inspectProductionArtifacts(quote);
  const files = {};
  const records = [];
  const root = `Commande_${safeName(quote.number, quote.id || "commande")}`;
  for (const folder of ["Images", "SVG", "Fonts"])
    files[`${root}/${folder}/`] = new Uint8Array();
  const addFile = async (path, bytes, metadata = {}) => {
    if (!bytes) throw new Error(`PRODUCTION_REQUIRED_FILE_MISSING:${path}`);
    files[`${root}/${path}`] = bytes;
    records.push({
      path,
      size: bytes.length,
      checksum: await sha256(bytes),
      ...metadata,
    });
  };

  const snapshotBytes = artifacts.snapshot
    ? strToU8(JSON.stringify(artifacts.snapshot, null, 2))
    : null;
  const projectBytes = artifacts.project
    ? strToU8(JSON.stringify(artifacts.project, null, 2))
    : snapshotBytes;
  await addFile("Configurateur.json", snapshotBytes);
  await addFile("Projet.acproject", projectBytes);
  await addFile(
    "Reconstruction.json",
    strToU8(
      JSON.stringify(
        {
          schemaVersion: "1.0.0",
          orderId: quote.id,
          products: (quote.lines || []).map((line) => ({
            id: line.productId,
            name: line.description,
            quantity: line.quantity,
            technique: line.technique,
            snapshot: line.snapshot,
          })),
          project: artifacts.project,
          sourceAssets: [...artifacts.images, ...artifacts.svgs].map(
            (item) => ({
              id: item.id,
              name: item.name || item.filename,
              checksum: item.checksum,
            }),
          ),
          fonts: artifacts.fonts.map((font) => ({
            id: font.id,
            name: font.name || font.filename,
            family: font.family || font.fontFamily,
            style: font.style || "normal",
            format: font.format || extensionOf(font),
            size: font.size,
            checksum: font.checksum,
            vectorized: Boolean(font.vectorized),
          })),
        },
        null,
        2,
      ),
    ),
  );

  const previewBytes = await fetchBytes(artifacts.preview);
  const previewValidation = await validateBinaryResource(
    artifacts.preview,
    previewBytes,
    { minimumLongestSide: 1200 },
  );
  await addFile("Preview_HD.png", previewBytes, previewValidation);
  if (artifacts.printPngs.length !== 1)
    throw new Error("PRODUCTION_PRINT_PNG_REQUIRED");
  const profile = quote.lines?.[0]?.snapshot?.production;
  const widthMm = Number(profile?.dimensions?.width || 210);
  const heightMm = Number(profile?.dimensions?.height || 90);
  const dpi = Number(profile?.resolutionDpi || 300);
  const expectedDimensions = {
    width: Math.round((widthMm / 25.4) * dpi),
    height: Math.round((heightMm / 25.4) * dpi),
  };
  for (const [index, resource] of artifacts.printPngs.entries()) {
    const bytes = await fetchBytes(resource);
    const validation = await validateBinaryResource(resource, bytes, {
      expectedDimensions,
    });
    const effectiveDpi = Math.min(
      validation.dimensions.width / (widthMm / 25.4),
      validation.dimensions.height / (heightMm / 25.4),
    );
    await addFile(`Impression_${index + 1}_1.png`, bytes, {
      ...validation,
      widthMm,
      heightMm,
      dpi,
      widthPx: expectedDimensions.width,
      heightPx: expectedDimensions.height,
      effectiveDpi: Number(effectiveDpi.toFixed(2)),
      colorSpace: "sRGB",
    });
  }
  for (const [folder, resources] of [
    ["Images", artifacts.images],
    ["SVG", artifacts.svgs],
    [
      "Fonts",
      artifacts.fonts.filter((font) => {
        if (font.exportable !== false) return true;
        const vectorized = artifacts.svgs.some(
          (svg) =>
            svg.vectorized === true &&
            String(svg.sourceFontId) === String(font.id),
        );
        if (!vectorized)
          throw new Error(`PRODUCTION_FONT_NOT_EXPORTABLE:${font.id}`);
        return false;
      }),
    ],
  ]) {
    for (const [index, resource] of resources.entries()) {
      const bytes = await fetchBytes(resource);
      const validation = await validateBinaryResource(resource, bytes);
      await addFile(
        `${folder}/${resourceName(resource, `${folder.toLowerCase()}-${index + 1}`)}`,
        bytes,
        validation,
      );
    }
  }
  await addFile(
    "Bon_Production.pdf",
    await buildProductionPdf(quote, client, previewBytes, records),
  );
  const manifest = buildProductionManifest(quote, records);
  await addFile("Manifest.json", strToU8(JSON.stringify(manifest, null, 2)));
  await addFile(
    "README.txt",
    strToU8(
      [
        `AC Création — Dossier atelier ${quote.number || quote.id}`,
        "",
        "Impression_1_1.png est le fichier d'impression aux dimensions finales.",
        "Preview_HD.png est l'aperçu couleur de contrôle.",
        "Bon_Production.pdf contient les instructions opérateur.",
        "Manifest.json contient les dimensions, formats et checksums SHA-256.",
        "Reconstruction.json et Projet.acproject permettent de reprendre la composition.",
        "Les originaux sont conservés sans réencodage dans Images, SVG et Fonts.",
      ].join("\r\n"),
    ),
  );
  const bytes = zipSync(files, { level: 6 });
  const audit = await validateProductionPackage(bytes, manifest);
  if (!audit.complete)
    throw new Error(`PRODUCTION_PACKAGE_INVALID:${audit.errors.join("|")}`);
  return {
    bytes,
    filename: `Commande_${safeName(quote.number, quote.id || "commande")}.zip`,
    manifest,
    complete: audit.complete,
    audit,
  };
}

export async function validateProductionPackage(bytes, manifest) {
  const errors = [];
  let archive;
  try {
    archive = unzipSync(bytes);
  } catch {
    return { complete: false, errors: ["ZIP invalide"] };
  }
  const entries = Object.entries(archive).filter(([, value]) => value.length);
  const byRelativePath = new Map(
    entries.map(([path, value]) => [path.split("/").slice(1).join("/"), value]),
  );
  for (const required of [
    "Bon_Production.pdf",
    "Preview_HD.png",
    "Impression_1_1.png",
    "Projet.acproject",
    "Configurateur.json",
    "Reconstruction.json",
    "Manifest.json",
    "README.txt",
  ]) {
    if (!byRelativePath.get(required)?.length)
      errors.push(`${required} manquant`);
  }
  for (const file of manifest.files || []) {
    const content = byRelativePath.get(file.path);
    if (!content) errors.push(`${file.path} manquant`);
    else if ((await sha256(content)) !== file.checksum)
      errors.push(`${file.path} checksum invalide`);
  }
  const paths = [...byRelativePath.keys()].join("\n");
  if (/demo\//i.test(paths)) errors.push("Chemin demo interdit");
  if (/placeholder/i.test(paths)) errors.push("Placeholder interdit");
  const pdf = byRelativePath.get("Bon_Production.pdf");
  if (pdf && ascii(pdf, 0, 5) !== "%PDF-") errors.push("PDF invalide");
  const preview = byRelativePath.get("Preview_HD.png");
  const previewSize = preview ? pngDimensions(preview) : null;
  if (
    preview &&
    Math.max(previewSize?.width || 0, previewSize?.height || 0) < 1200
  )
    errors.push("Preview HD invalide");
  return { complete: errors.length === 0, errors, files: entries.length };
}

export function downloadBytes(
  bytes,
  filename,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
