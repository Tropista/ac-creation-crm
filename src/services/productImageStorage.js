import { getSupabase, hasSupabaseAuthSession, isSupabaseConfigured } from "../supabase.js";
import { compressProductImageFile } from "../utils/productImages.js";

export const PRODUCT_IMAGES_BUCKET = "ac-creation-products";

function buildStoragePath(productId) {
  const prefix = productId ? String(productId) : "draft";
  const stamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${prefix}/${stamp}-${random}.jpg`;
}

export function getProductImagePublicUrl(supabase, storagePath) {
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

export async function uploadProductImageBlob(blob, { productId } = {}) {
  const supabase = await getSupabase();
  const storagePath = buildStoragePath(productId);

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const publicUrl = getProductImagePublicUrl(supabase, storagePath);
  if (!publicUrl) {
    throw new Error("URL publique introuvable après l'upload.");
  }

  return publicUrl;
}

export async function canUploadProductImages() {
  if (!isSupabaseConfigured) return false;
  try {
    return await hasSupabaseAuthSession();
  } catch {
    return false;
  }
}

export async function uploadProductImageFile(file, { productId } = {}) {
  const blob = await compressProductImageFile(file);
  return uploadProductImageBlob(blob, { productId });
}
