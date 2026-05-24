export const PRODUCT_IMAGE_MAX_BASE64_BYTES = 100 * 1024;

export function isBase64DataUrl(value) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || "").trim());
}

export function isHttpImageUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url);
}

export function getBase64ByteSize(dataUrl) {
  if (!isBase64DataUrl(dataUrl)) return 0;
  const base64 = String(dataUrl).split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function isLargeBase64Image(value, maxBytes = PRODUCT_IMAGE_MAX_BASE64_BYTES) {
  return isBase64DataUrl(value) && getBase64ByteSize(value) > maxBytes;
}

export function shouldStripProductImageFromStorage(imageUrl) {
  if (!imageUrl) return false;
  if (isHttpImageUrl(imageUrl)) return false;
  if (isBase64DataUrl(imageUrl)) {
    return isLargeBase64Image(imageUrl);
  }
  return false;
}

export function sanitizeProductImageUrl(imageUrl) {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  if (shouldStripProductImageFromStorage(value)) return "";
  return value;
}

export function sanitizeProductForPersistence(product) {
  if (!product || typeof product !== "object") return product;

  const imageUrl = sanitizeProductImageUrl(product.imageUrl);
  if (imageUrl === (product.imageUrl || "")) return product;

  return {
    ...product,
    imageUrl,
  };
}

export function sanitizeProductsForPersistence(products = []) {
  return (products || []).map((product) => sanitizeProductForPersistence(product));
}

export function compressProductImageFile(file, maxWidth = 900, quality = 0.78) {
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

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Image impossible à compresser."));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };

      img.onerror = () => reject(new Error("Image impossible à lire."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Image impossible à importer."));
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Image impossible à lire."));
    reader.readAsDataURL(blob);
  });
}
