import { strToU8, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

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

async function fetchBytes(resource) {
  const url = resourceUrl(resource);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PRODUCTION_RESOURCE_UNAVAILABLE:${url}`);
  return new Uint8Array(await response.arrayBuffer());
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
      asset?.type || asset?.mimeType || asset?.storage_path || "",
    );
    return !/svg/i.test(descriptor) && /image|png|jpe?g|webp/i.test(descriptor);
  });
  const svgs = assets.filter((asset) =>
    /svg/i.test(
      String(asset?.type || asset?.mimeType || asset?.storage_path || ""),
    ),
  );
  const printPngs = resources.filter((resource) =>
    /png/i.test(
      String(
        resource?.type || resource?.mimeType || resource?.storage_path || "",
      ),
    ),
  );
  const preview =
    ecommerce.preview ||
    resources.find((resource) =>
      /preview/i.test(
        String(
          resource?.type || resource?.name || resource?.storage_path || "",
        ),
      ),
    );
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
      null,
    resumeUrl: ecommerce.resumeUrl || ecommerce.configuratorUrl || "",
    production: asList(ecommerce.production),
  };
}

export function buildProductionManifest(quote, files = []) {
  const artifacts = inspectProductionArtifacts(quote);
  const zone =
    quote?.lines?.flatMap((line) => line.snapshot?.printZones || [])[0] ||
    quote?.lines?.[0]?.snapshot?.production?.dimensions ||
    null;
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
    printArea: zone,
    artifacts: {
      images: artifacts.images.length,
      svgs: artifacts.svgs.length,
      fonts: artifacts.fonts.length,
      printPngs: artifacts.printPngs.length,
      snapshot: Boolean(artifacts.snapshot),
      project: Boolean(artifacts.project),
      preview: Boolean(artifacts.preview),
    },
    files,
  };
}

export async function buildProductionPdf(quote, client, previewBytes = null) {
  const pdf = new jsPDF("p", "mm", "a4");
  pdf.setFillColor(248, 200, 220);
  pdf.rect(0, 0, 210, 24, "F");
  pdf.setTextColor(31, 41, 55);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("BON DE PRODUCTION", 14, 15);
  pdf.setFontSize(10);
  pdf.text(quote.number || "Commande", 196, 15, { align: "right" });
  pdf.setFont("helvetica", "normal");
  const rows = [
    ["Client", client?.name || client?.email || quote.clientId || "—"],
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
  y = 82;
  pdf.setFont("helvetica", "bold");
  pdf.text("PRODUITS", 14, y);
  y += 7;
  for (const line of quote.lines || []) {
    pdf.setFont("helvetica", "normal");
    pdf.text(`${line.quantity || 0} x ${line.description || "Produit"}`, 14, y);
    pdf.text(String(line.technique || ""), 196, y, { align: "right" });
    y += 7;
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
  pdf.text("Dimensions et resolution : voir Manifest.json", 14, 286);
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

export async function buildProductionPackage({ quote, client }) {
  const artifacts = inspectProductionArtifacts(quote);
  const files = {};
  const records = [];
  const addFile = async (path, bytes) => {
    if (!bytes) return;
    files[path] = bytes;
    records.push({ path, size: bytes.length, checksum: await sha256(bytes) });
  };

  const snapshotBytes = artifacts.snapshot
    ? strToU8(JSON.stringify(artifacts.snapshot, null, 2))
    : null;
  const projectBytes = artifacts.project
    ? strToU8(JSON.stringify(artifacts.project, null, 2))
    : snapshotBytes;
  await addFile("Configurateur.json", snapshotBytes);
  await addFile("Projet.acproject", projectBytes);

  const previewBytes = await fetchBytes(artifacts.preview);
  await addFile("Preview_HD.png", previewBytes);
  for (const [index, resource] of artifacts.printPngs.entries()) {
    await addFile(`Impression_${index + 1}_1.png`, await fetchBytes(resource));
  }
  for (const [folder, resources] of [
    ["Images", artifacts.images],
    ["SVG", artifacts.svgs],
    ["Fonts", artifacts.fonts],
  ]) {
    for (const [index, resource] of resources.entries()) {
      await addFile(
        `${folder}/${resourceName(resource, `${folder.toLowerCase()}-${index + 1}`)}`,
        await fetchBytes(resource),
      );
    }
  }
  await addFile(
    "Bon_Production.pdf",
    await buildProductionPdf(quote, client, previewBytes),
  );
  const manifest = buildProductionManifest(quote, records);
  await addFile("Manifest.json", strToU8(JSON.stringify(manifest, null, 2)));
  return {
    bytes: zipSync(files, { level: 6 }),
    filename: `Commande_${safeName(quote.number, quote.id || "commande")}.zip`,
    manifest,
    complete:
      Boolean(artifacts.snapshot && artifacts.project && artifacts.preview) &&
      artifacts.printPngs.length > 0,
  };
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
