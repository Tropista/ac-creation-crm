/**
 * Resolve a public/ asset path for Vite dev (http) and Electron (file://).
 * Uses an absolute URL when running in the browser so GLTFLoader can resolve
 * sibling buffers (e.g. scene.bin) correctly.
 */
export function resolveAssetUrl(relativePath) {
  const normalized = String(relativePath || "").replace(/^\/+/, "");
  const base = import.meta.env.BASE_URL || "./";
  const joined = `${base}${normalized}`;

  if (typeof window !== "undefined" && window.location?.href) {
    try {
      return new URL(joined, window.location.href).href;
    } catch {
      return joined;
    }
  }

  return joined;
}

export const APP_LOGO_URL = resolveAssetUrl("logo.png");
export const MUG_MODEL_URL = resolveAssetUrl("models/scene.gltf");
export const TSHIRT_MODEL_URL = resolveAssetUrl("models/tshirt/t-shirt.gltf");
export const POLO_MODEL_URL = resolveAssetUrl("models/polo/scene.gltf");
