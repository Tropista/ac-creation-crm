export function formatProductOptionLabel(product, moneyFn) {
  if (!product) return "";
  const category = product.category ? `${product.category} — ` : "";
  return `${category}${product.name || ""} - ${moneyFn(product.price)}`;
}

export function filterProducts(products, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return products || [];

  return (products || []).filter((product) => {
    const name = String(product.name || "").toLowerCase();
    const category = String(product.category || "").toLowerCase();
    const sku = String(product.sku || "").toLowerCase();
    return (
      name.includes(normalizedQuery) ||
      category.includes(normalizedQuery) ||
      sku.includes(normalizedQuery)
    );
  });
}

export function matchesFreeProductOption(query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  return "produit libre".includes(normalizedQuery);
}
