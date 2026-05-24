/** Nombre d'articles par page sur le catalogue client public. */
export const CLIENT_CATALOG_PAGE_SIZE = 15;

/**
 * Filtre les produits par dossier catalogue.
 * @param {Array} products
 * @param {string} folderFilter — vide = tous
 * @param {(item: object) => string} resolveFolder
 */
export function filterProductsByFolder(products, folderFilter, resolveFolder) {
  if (!folderFilter) return products;
  return products.filter((product) => resolveFolder(product) === folderFilter);
}

/**
 * Découpe une liste pour la pagination (page 1-based).
 */
export function paginateItems(items, page, pageSize = CLIENT_CATALOG_PAGE_SIZE) {
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getTotalPages(itemCount, pageSize = CLIENT_CATALOG_PAGE_SIZE) {
  if (itemCount <= 0) return 1;
  return Math.ceil(itemCount / pageSize);
}

/**
 * Numéros de page à afficher (fenêtre autour de la page courante).
 */
export function buildPageNumbers(currentPage, totalPages, maxVisible = 5) {
  if (totalPages <= 1) return [];

  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages);
  let start = Math.max(1, safeCurrent - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;

  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - maxVisible + 1);
  }

  const pages = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  return pages;
}
