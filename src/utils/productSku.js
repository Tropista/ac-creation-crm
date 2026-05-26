/**
 * Next SKU for a fixed prefix, continuing from existing numeric suffixes.
 * legacyPrefixes covers renamed prefixes (e.g. LASER → LAS).
 */
export function getNextNumericSku(
  products = [],
  { prefix, legacyPrefixes = [], pad = 3 } = {}
) {
  const prefixes = [prefix, ...legacyPrefixes].map((value) =>
    String(value || "")
      .trim()
      .toUpperCase()
  );
  const patterns = prefixes.map(
    (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`)
  );

  let highest = 0;
  for (const product of products) {
    const sku = String(product.sku || "")
      .trim()
      .toUpperCase();
    for (const pattern of patterns) {
      const match = sku.match(pattern);
      if (match) highest = Math.max(highest, Number(match[1] || 0));
    }
  }

  return `${prefix}-${String(highest + 1).padStart(pad, "0")}`;
}
