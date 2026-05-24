export function extractImgSrcFromHtml(html) {
  const match = String(html || "").match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

export function extractUrlFromText(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.trim() && !entry.trim().startsWith("#"));
  return line?.trim() || null;
}

export function normalizePastedImageUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function looksLikeImageUrl(url) {
  const normalized = normalizePastedImageUrl(url);
  if (!normalized) return false;
  if (normalized.startsWith("data:image/")) return true;

  try {
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.toLowerCase();
    return (
      /\.(webp|png|jpe?g|gif|svg|avif)(\?|$)/i.test(pathname) ||
      parsed.hostname.includes("lamaisonduteeshirt.com") ||
      pathname.includes("/media/")
    );
  } catch {
    return false;
  }
}

export function parseDropPayload(dataTransfer) {
  if (!dataTransfer) return { kind: "none" };

  const files = dataTransfer.files;
  if (files?.length > 0) {
    const file = Array.from(files).find((entry) => entry.type.startsWith("image/"));
    if (file) return { kind: "file", file };
  }

  const html = dataTransfer.getData("text/html");
  if (html) {
    const src = extractImgSrcFromHtml(html);
    const normalized = normalizePastedImageUrl(src);
    if (normalized && looksLikeImageUrl(normalized)) {
      return { kind: "url", url: normalized };
    }
  }

  const uriList = dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain");
  const fromUri = normalizePastedImageUrl(extractUrlFromText(uriList));
  if (fromUri && looksLikeImageUrl(fromUri)) {
    return { kind: "url", url: fromUri };
  }

  return { kind: "none" };
}

export function fileToDataUrl(file, maxWidth = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Choisis une image valide."));
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.onerror = () => reject(new Error("Image impossible à lire."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Image impossible à importer."));
    reader.readAsDataURL(file);
  });
}

export async function resolveDropToImageUrl(dataTransfer) {
  const payload = parseDropPayload(dataTransfer);
  if (payload.kind === "file") {
    return fileToDataUrl(payload.file);
  }
  if (payload.kind === "url") {
    return payload.url;
  }
  throw new Error("Glissez une image ou une URL valide.");
}

export function patchClientCatalogItemImage(data, itemId, imageUrl) {
  const now = new Date().toISOString();
  return {
    ...data,
    clientCatalogItems: (data.clientCatalogItems || []).map((entry) =>
      entry.id === itemId ? { ...entry, imageUrl, updatedAt: now } : entry
    ),
  };
}
