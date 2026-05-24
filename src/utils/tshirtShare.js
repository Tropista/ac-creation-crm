import { PUBLIC_TSHIRT_PATH, isHashRouterMode, pageToPath } from "./routes";

export const CONFIG_SHARE_PARAM = "cfg";
export const QUOTE_SHARE_PARAM = "draft";
export const SHARE_CODEC_VERSION = 1;
/** Limite prudente pour les liens partagés (navigateurs / proxies). */
export const MAX_SHARE_URL_LENGTH = 12000;

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const base64 = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hasCompressionStreams() {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined"
  );
}

async function compressText(text) {
  const raw = new TextEncoder().encode(text);
  if (!hasCompressionStreams()) {
    return `0.${toBase64Url(raw)}`;
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return `1.${toBase64Url(compressed)}`;
}

async function decompressText(payload) {
  const match = String(payload || "").match(/^([01])\.(.+)$/);
  if (!match) throw new Error("Format de lien invalide.");
  const compressed = match[1] === "1";
  const bytes = fromBase64Url(match[2]);
  if (!compressed) {
    return new TextDecoder().decode(bytes);
  }
  if (!hasCompressionStreams()) {
    throw new Error("Ce lien nécessite un navigateur récent pour la décompression.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).text();
}

export async function encodeSharePayload(payload) {
  const json = JSON.stringify({ v: SHARE_CODEC_VERSION, ...payload });
  return compressText(json);
}

export async function decodeSharePayload(encoded) {
  if (!encoded) return null;
  const json = await decompressText(encoded);
  const parsed = JSON.parse(json);
  if (!parsed || parsed.v !== SHARE_CODEC_VERSION) {
    throw new Error("Version de lien non supportée.");
  }
  return parsed;
}

/** Réduit la taille du snapshot pour l’URL (clés courtes, sans métadonnées inutiles). */
export function compactConfigSnapshot(snapshot) {
  return {
    n: snapshot.name || "",
    q: Math.max(1, Number(snapshot.orderQuantity || snapshot.qty || 1)),
    aa: snapshot.activeArea || "front",
    c: snapshot.tshirtColor || "#ffffff",
    g: snapshot.garmentSize || "M",
    dt: snapshot.defaultTechnique || "dtf",
    sp: snapshot.showPrintZone ?? true,
    sn: snapshot.snapEnabled ?? true,
    pz: snapshot.printZoneSizes || null,
    items: (snapshot.items || []).map((item) => ({
      id: item.id,
      type: item.type,
      area: item.area,
      technique: item.technique,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      text: item.text,
      textColor: item.textColor,
      textSize: item.textSize,
      fontFamily: item.fontFamily,
      strokeEnabled: item.strokeEnabled,
      strokeColor: item.strokeColor,
      strokeWidth: item.strokeWidth,
      shadowEnabled: item.shadowEnabled,
      shadowColor: item.shadowColor,
      shadowBlur: item.shadowBlur,
      shadowOffsetX: item.shadowOffsetX,
      shadowOffsetY: item.shadowOffsetY,
      curve: item.curve,
      src: item.src?.startsWith("data:") ? item.src : "",
      fileName: item.fileName,
      layerName: item.layerName,
      hidden: item.hidden,
      locked: item.locked,
      z: item.z,
    })),
    fonts: (snapshot.customFonts || []).map((font) => ({
      name: font.name,
      originalName: font.originalName,
      dataUrl: font.dataUrl || (font.src?.startsWith("data:") ? font.src : ""),
    })),
  };
}

export function expandConfigSnapshot(compact) {
  if (!compact) return null;
  return {
    name: compact.n || "",
    orderQuantity: compact.q || 1,
    activeArea: compact.aa || "front",
    tshirtColor: compact.c || "#ffffff",
    garmentSize: compact.g || "M",
    defaultTechnique: compact.dt || "dtf",
    showPrintZone: compact.sp ?? true,
    snapEnabled: compact.sn ?? true,
    printZoneSizes: compact.pz || null,
    items: compact.items || [],
    customFonts: (compact.fonts || []).filter((font) => font?.dataUrl),
  };
}

export function getPublicOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export function buildPathWithQuery(path, queryString) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isHashRouterMode()) {
    const base = `${window.location.pathname}#${normalized}`;
    return queryString ? `${base}?${queryString}` : base;
  }
  return queryString ? `${normalized}?${queryString}` : normalized;
}

export function buildAbsoluteShareUrl(path, queryString) {
  const relative = buildPathWithQuery(path, queryString);
  if (isHashRouterMode()) {
    return `${getPublicOrigin()}${relative}`;
  }
  return `${getPublicOrigin()}${relative}`;
}

export async function buildConfiguratorShareUrl(snapshot) {
  const encoded = await encodeSharePayload({ t: "cfg", d: compactConfigSnapshot(snapshot) });
  const query = `${CONFIG_SHARE_PARAM}=${encodeURIComponent(encoded)}`;
  const url = buildAbsoluteShareUrl(PUBLIC_TSHIRT_PATH, query);
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error("LINK_TOO_LONG");
  }
  return url;
}

export async function buildQuoteShareUrl(draft) {
  const encoded = await encodeSharePayload({
    t: "q",
    d: {
      source: draft.source || "configurateur t-shirt",
      clientId: draft.clientId || "",
      notes: draft.notes || "",
      lines: draft.lines || [],
    },
  });
  const query = `${QUOTE_SHARE_PARAM}=${encodeURIComponent(encoded)}`;
  const url = buildAbsoluteShareUrl(pageToPath("quotes"), query);
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error("LINK_TOO_LONG");
  }
  return url;
}

export async function decodeConfiguratorShareParam(encoded) {
  const payload = await decodeSharePayload(encoded);
  if (payload?.t !== "cfg") return null;
  return expandConfigSnapshot(payload.d);
}

export async function decodeQuoteShareParam(encoded) {
  const payload = await decodeSharePayload(encoded);
  if (payload?.t !== "q") return null;
  return payload.d || null;
}

export function buildShareMailto(url, projectName = "") {
  const label = projectName.trim() || "ma configuration t-shirt";
  const subject = encodeURIComponent(`Configuration t-shirt AC Creation — ${label}`);
  const body = encodeURIComponent(
    `Bonjour,\n\nVoici ${label} :\n${url}\n\nOuvrez ce lien pour reprendre le configurateur ou finaliser le devis.\n\n— Envoyé depuis le configurateur AC Creation`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

export async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
