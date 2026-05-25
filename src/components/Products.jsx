import { useMemo, useRef, useState } from "react";
import {
  canDeleteData
} from "../services/authService";
import {
  canUploadProductImages,
  uploadProductImageFile,
} from "../services/productImageStorage";
import {
  blobToDataUrl,
  compressProductImageFile,
  isHttpImageUrl,
  isLargeBase64Image,
  PRODUCT_IMAGE_MAX_BASE64_BYTES,
} from "../utils/productImages";
import { applyProductStockChange } from "../utils/stock";
import { showToast } from "../utils/toast";
import PaginationControls from "./PaginationControls";

function money(value) {
  return Number(value || 0).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";
}
function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR");
}

function cleanText(value) {
  return String(value || "").trim().toLowerCase();
}

function getProductLineDocuments(data, product) {
  if (!product) return [];
  const productId = String(product.id || "");
  const productName = cleanText(product.name);

  const documents = [
    ...(data.quotes || []).map((doc) => ({ ...doc, type: "DEV", routeType: "quote" })),
    ...(data.invoices || []).map((doc) => ({ ...doc, type: "FAC", routeType: "invoice" })),
  ];

  return documents
    .map((doc) => {
      const matchingLines = (doc.lines || []).filter((line) => {
        const lineProductId = String(line.productId || "");
        const lineDescription = cleanText(line.description);
        return (productId && lineProductId === productId) || (productName && lineDescription.includes(productName));
      });

      if (!matchingLines.length) return null;

      return {
        ...doc,
        matchingLines,
        quantityForProduct: matchingLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        totalForProduct: matchingLines.reduce((sum, line) => sum + Number(line.totalHT || (Number(line.quantity || 0) * Number(line.price || 0))), 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}
export default function Products({ data, setData, currentRole = 'Admin', logActivity }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name-asc");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkStock, setBulkStock] = useState(100);
  const [stockMoveQty, setStockMoveQty] = useState(1);
  const [stockMoveReason, setStockMoveReason] = useState("Ajustement manuel");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [sideImageDragActive, setSideImageDragActive] = useState(false);
  const imageDragCounterRef = useRef(0);
  const sideImageDragCounterRef = useRef(0);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    price: "",
    stock: "",
    stockMin: "",
    imageUrl: "",
    description: "",
  });

  function applyProductImageUrl(imageUrl, productIdOverride) {
    const normalizedUrl = String(imageUrl || "").trim();
    setForm((current) => ({ ...current, imageUrl: normalizedUrl }));

    const targetId = productIdOverride ?? editing;
    if (!targetId) return;

    setData((current) => ({
      ...current,
      products: (current.products || []).map((product) =>
        product.id === targetId
          ? { ...product, imageUrl: normalizedUrl, updatedAt: today() }
          : product
      ),
    }));

    setSelectedProduct((current) =>
      current?.id === targetId
        ? { ...current, imageUrl: normalizedUrl, updatedAt: today() }
        : current
    );
  }

  function getProductDisplayImageUrl(product) {
    if (editing === product.id && form.imageUrl) {
      return form.imageUrl;
    }
    return product.imageUrl || "";
  }

  async function processProductImageFile(file, { productId } = {}) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Choisis une image valide (PNG, JPEG ou WebP).", "error");
      return;
    }

    setImageUploading(true);

    try {
      const canUpload = await canUploadProductImages();
      const storageProductId = productId ?? editing ?? undefined;

      if (canUpload) {
        const imageUrl = await uploadProductImageFile(file, { productId: storageProductId });
        applyProductImageUrl(imageUrl, storageProductId);
        showToast("Image enregistrée sur Supabase Storage.", "success");
        return;
      }

      const blob = await compressProductImageFile(file);
      const dataUrl = await blobToDataUrl(blob);

      if (isLargeBase64Image(dataUrl)) {
        showToast(
          `Image trop lourde (>${Math.round(PRODUCT_IMAGE_MAX_BASE64_BYTES / 1024)} Ko). Connecte-toi pour uploader ou saisis une URL.`,
          "error"
        );
        return;
      }

      applyProductImageUrl(dataUrl, storageProductId);
      showToast("Image importée localement (mode hors ligne).", "info");
    } catch (error) {
      showToast(error?.message || "Erreur pendant l'import de l'image.", "error");
    } finally {
      setImageUploading(false);
    }
  }

  async function handleProductImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    await processProductImageFile(file);
    event.target.value = "";
  }

  function handleProductImageDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    imageDragCounterRef.current += 1;
    setImageDragActive(true);
  }

  function handleProductImageDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setImageDragActive(true);
  }

  function handleProductImageDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    imageDragCounterRef.current = Math.max(0, imageDragCounterRef.current - 1);
    if (imageDragCounterRef.current === 0) {
      setImageDragActive(false);
    }
  }

  async function handleProductImageDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    imageDragCounterRef.current = 0;
    setImageDragActive(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await processProductImageFile(file);
  }

  function handleSideImageDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    sideImageDragCounterRef.current += 1;
    setSideImageDragActive(true);
  }

  function handleSideImageDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setSideImageDragActive(true);
  }

  function handleSideImageDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    sideImageDragCounterRef.current = Math.max(0, sideImageDragCounterRef.current - 1);
    if (sideImageDragCounterRef.current === 0) {
      setSideImageDragActive(false);
    }
  }

  async function handleSideImageDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    sideImageDragCounterRef.current = 0;
    setSideImageDragActive(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file || !selectedProduct) return;

    if (editing !== selectedProduct.id) {
      edit(selectedProduct);
    }

    await processProductImageFile(file, { productId: selectedProduct.id });
  }

  function handleProductImageUrlChange(value) {
    applyProductImageUrl(value);
  }

  function removeProductImage() {
    applyProductImageUrl("");
  }


  const categories = data.categories || [];
  const allProducts = (data.products || []).map((product) => ({
    ...product,
    archived: Boolean(product.archived),
    history: Array.isArray(product.history) ? product.history : [],
    stock:
      product.stock === undefined || product.stock === null || product.stock === ""
        ? 100
        : Number(product.stock || 0),
  }));

  function getCategoryName(categoryName) {
    return String(categoryName || "").trim();
  }

  function categoryExists(categoryName) {
    const selectedCategory = getCategoryName(categoryName);
    return categories.some((category) => getCategoryName(category.name).toLowerCase() === selectedCategory.toLowerCase());
  }

  function getSkuPrefix(categoryName) {
    const cleanCategory = getCategoryName(categoryName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

    return cleanCategory.slice(0, 3).padEnd(3, "X");
  }

  function isAutoSku(sku, categoryName = form.category) {
    if (!sku || !categoryExists(categoryName)) return false;
    const prefix = getSkuPrefix(categoryName);
    return new RegExp(`^${prefix}-\\d{4}$`).test(String(sku).trim().toUpperCase());
  }

  function generateSkuForCategory(categoryName, excludedProductId = editing) {
    if (!categoryExists(categoryName)) return "";

    const prefix = getSkuPrefix(categoryName);
    const skuPattern = new RegExp(`^${prefix}-(\\d{4})$`);
    const existingSkus = new Set();
    let highestNumber = 0;

    allProducts.forEach((product) => {
      if (excludedProductId && product.id === excludedProductId) return;
      const productSku = String(product.sku || "").trim().toUpperCase();
      existingSkus.add(productSku);

      const productCategory = getCategoryName(product.category).toLowerCase();
      const selectedCategory = getCategoryName(categoryName).toLowerCase();
      const match = productSku.match(skuPattern);

      if (productCategory === selectedCategory && match) {
        highestNumber = Math.max(highestNumber, Number(match[1] || 0));
      }
    });

    let nextNumber = highestNumber + 1;
    let nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

    while (existingSkus.has(nextSku)) {
      nextNumber += 1;
      nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
    }

    return nextSku;
  }

  function handleCategoryChange(categoryName) {
    setForm((current) => {
      const shouldGenerateSku = !current.sku || isAutoSku(current.sku, current.category);
      return {
        ...current,
        category: categoryName,
        sku: shouldGenerateSku ? generateSkuForCategory(categoryName) : current.sku,
      };
    });
  }

  function handleGenerateSku() {
    if (!form.category) return showToast("Choisis d'abord une catégorie.", "error");
    if (!categoryExists(form.category)) return showToast("La catégorie doit venir de l'onglet Catégories.", "error");

    const nextSku = generateSkuForCategory(form.category);
    if (!nextSku) return showToast("Impossible de générer le SKU.", "error");

    setForm((current) => ({ ...current, sku: nextSku }));
  }

  function regenerateAllProductSkus() {
    const validProducts = allProducts.filter((product) => categoryExists(product.category));

    if (!validProducts.length) {
      return showToast("Aucun produit avec une catégorie valide trouvée.", "error");
    }

    const skippedProducts = allProducts.length - validProducts.length;
    const confirmMessage = skippedProducts > 0
      ? `Cette action va remplacer les SKU de ${validProducts.length} produit(s). ${skippedProducts} produit(s) sans catégorie valide seront ignorés. Continuer ?`
      : `Cette action va remplacer les SKU de ${validProducts.length} produit(s). Continuer ?`;

    if (!confirm(confirmMessage)) return;

    const countersByPrefix = {};
    const usedSkus = new Set();

    const updatedProducts = allProducts.map((product) => {
      if (!categoryExists(product.category)) return product;

      const prefix = getSkuPrefix(product.category);
      let nextNumber = (countersByPrefix[prefix] || 0) + 1;
      let nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

      while (usedSkus.has(nextSku)) {
        nextNumber += 1;
        nextSku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
      }

      countersByPrefix[prefix] = nextNumber;
      usedSkus.add(nextSku);

      return {
        ...product,
        sku: nextSku,
      };
    });

    setData({
      ...data,
      products: updatedProducts,
    });

    setSelectedProductIds([]);
    showToast("Tous les SKU ont été régénérés par catégorie.", "success");
  }

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    const minPrice = priceMin === "" ? null : Number(priceMin);
    const maxPrice = priceMax === "" ? null : Number(priceMax);

    const filtered = allProducts.filter((product) => {
      const stock = Number(product.stock || 0);
      const minStock = Number(product.stockMin || product.minStock || 0);
      const price = Number(product.price || 0);
      const _margin = price - Number(product.purchasePrice || 0);

      const matchesSearch =
        !query ||
        [
          product.name,
          product.sku,
          product.category,
          product.description,
          product.supplier,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      const matchesCategory =
        !categoryFilter || product.category === categoryFilter;

      const matchesStock =
        (stockFilter === "all" && !product.archived) ||
        (stockFilter === "available" && !product.archived && stock > 0 && (!minStock || stock > minStock)) ||
        (stockFilter === "low" && !product.archived && stock > 0 && minStock > 0 && stock <= minStock) ||
        (stockFilter === "out" && !product.archived && stock <= 0) ||
        (stockFilter === "archived" && product.archived);

      const matchesPriceMin = minPrice === null || price >= minPrice;
      const matchesPriceMax = maxPrice === null || price <= maxPrice;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStock &&
        matchesPriceMin &&
        matchesPriceMax
      );
    });

    return filtered.sort((a, b) => {
      const priceA = Number(a.price || 0);
      const priceB = Number(b.price || 0);
      const stockA = Number(a.stock || 0);
      const stockB = Number(b.stock || 0);
      const marginA = priceA - Number(a.purchasePrice || 0);
      const marginB = priceB - Number(b.purchasePrice || 0);
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();

      switch (sortBy) {
        case "name-desc":
          return String(b.name || "").localeCompare(String(a.name || ""));
        case "price-asc":
          return priceA - priceB;
        case "price-desc":
          return priceB - priceA;
        case "stock-asc":
          return stockA - stockB;
        case "stock-desc":
          return stockB - stockA;
        case "margin-desc":
          return marginB - marginA;
        case "recent":
          return dateB - dateA;
        default:
          return String(a.name || "").localeCompare(String(b.name || ""));
      }
    });
  }, [allProducts, search, categoryFilter, stockFilter, priceMin, priceMax, sortBy]);

  const itemsPerPage = 24;
  const totalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const visibleProducts = products.slice((page - 1) * itemsPerPage, page * itemsPerPage);


  const selectedProductStats = useMemo(() => {
    if (!selectedProduct) return null;

    const linked = getProductLineDocuments(data, selectedProduct);
    const invoices = linked.filter((doc) => doc.type === "FAC" && doc.status !== "Annulée");
    const quotes = linked.filter((doc) => doc.type === "DEV");
    const revenue = invoices.reduce((sum, doc) => sum + Number(doc.totalForProduct || 0), 0);
    const totalQty = invoices.reduce((sum, doc) => sum + Number(doc.quantityForProduct || 0), 0);
    const lastInvoice = invoices[0] || null;
    const lastDoc = linked[0] || null;

    const clientTotals = invoices.reduce((acc, doc) => {
      const key = doc.clientId || "unknown";
      if (!acc[key]) {
        acc[key] = { clientId: key, total: 0, qty: 0, docs: 0 };
      }
      acc[key].total += Number(doc.totalForProduct || 0);
      acc[key].qty += Number(doc.quantityForProduct || 0);
      acc[key].docs += 1;
      return acc;
    }, {});

    const bestClient = Object.values(clientTotals).sort((a, b) => b.total - a.total)[0] || null;

    return {
      docs: linked.length,
      quotes: quotes.length,
      invoices: invoices.length,
      qty: totalQty,
      revenue,
      last: lastDoc,
      lastClientId: lastInvoice?.clientId || lastDoc?.clientId || "",
      lastSaleDate: lastInvoice?.date || "",
      bestClient,
      history: linked,
    };
  }, [selectedProduct, data]);

  const productSalesRanking = useMemo(() => {
    const rankedProducts = allProducts.map((product) => {
      const linked = getProductLineDocuments(data, product).filter(
        (doc) => doc.type === "FAC" && doc.status !== "Annulée"
      );

      return {
        ...product,
        soldQty: linked.reduce((sum, doc) => sum + Number(doc.quantityForProduct || 0), 0),
        revenue: linked.reduce((sum, doc) => sum + Number(doc.totalForProduct || 0), 0),
      };
    });

    return {
      byRevenue: [...rankedProducts]
        .filter((product) => Number(product.revenue || 0) > 0)
        .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
        .slice(0, 5),
      byQuantity: [...rankedProducts]
        .filter((product) => Number(product.soldQty || 0) > 0)
        .sort((a, b) => Number(b.soldQty || 0) - Number(a.soldQty || 0))
        .slice(0, 5),
    };
  }, [allProducts, data]);


  const productsStats = useMemo(() => {
    const total = allProducts.length;
    const available = allProducts.filter((p) => Number(p.stock || 0) > 0).length;
    const low = allProducts.filter((p) => {
      const stock = Number(p.stock || 0);
      const minStock = Number(p.stockMin || p.minStock || 0);
      return stock > 0 && minStock > 0 && stock <= minStock;
    }).length;
    const out = allProducts.filter((p) => Number(p.stock || 0) <= 0).length;

    return { total, available, low, out };
  }, [allProducts]);

  function resetProductFilters() {
    setSearch("");
    setCategoryFilter("");
    setStockFilter("all");
    setSortBy("name-asc");
    setPriceMin("");
    setPriceMax("");
    setCurrentPage(1);
  }

  function reset() {
    setEditing(null);
    setForm({ name: "", sku: "", category: "", price: "", stock: "", stockMin: "", imageUrl: "", description: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return showToast("Nom du produit obligatoire.", "error");

    const imageUrl = String(form.imageUrl || "").trim();
    if (imageUrl && !isHttpImageUrl(imageUrl) && isLargeBase64Image(imageUrl)) {
      return showToast(
        "Image trop lourde pour l'enregistrement local. Utilise une URL ou connecte-toi pour uploader.",
        "error"
      );
    }

    const finalSku = String(form.sku || generateSkuForCategory(form.category) || "").trim();

    const productData = {
      ...form,
      sku: finalSku,
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
      stockMin: Number(form.stockMin || 0),
    };

    if (editing) {
      const existingProduct = allProducts.find((p) => p.id === editing);
      const historyEntry = {
        id: uid(),
        date: today(),
        action: "Modification produit",
        user: currentRole,
      };

      const updatedProducts = allProducts.map((p) =>
        p.id === editing
          ? {
              ...p,
              ...productData,
              updatedAt: today(),
              history: [...(p.history || []), historyEntry],
            }
          : p
      );

      setData({
        ...data,
        products: updatedProducts,
      });

      if (selectedProduct?.id === editing) {
        setSelectedProduct(updatedProducts.find((p) => p.id === editing) || null);
      }

      logActivity?.("Modification produit", productData.name || existingProduct?.name, productData.sku);
    } else {
      const product = {
        id: uid(),
        createdAt: today(),
        archived: false,
        history: [
          { id: uid(), date: today(), action: "Création produit", user: currentRole },
        ],
        ...productData,
      };
      setData({
        ...data,
        products: [...allProducts, product],
      });
      logActivity?.("Création produit", product.name, product.sku);
    }

    reset();
  }

  function edit(product) {
    setEditing(product.id);
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      price: product.price || "",
      stock: product.stock || "",
      stockMin: product.stockMin || product.minStock || "",
      imageUrl: product.imageUrl || "",
      description: product.description || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) return showToast("Ton rôle ne permet pas de supprimer.", "error");
    if (!confirm("Supprimer ce produit ?")) return;
    const removedProduct = allProducts.find((p) => p.id === id);
    setData({ ...data, products: allProducts.filter((p) => p.id !== id) });
    logActivity?.("Suppression produit", removedProduct?.name || id, removedProduct?.sku || "");
    setSelectedProductIds(selectedProductIds.filter((productId) => productId !== id));

    if (selectedProduct?.id === id) {
      setSelectedProduct(null);
    }
  }

  function toggleProductSelection(id) {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id]
    );
  }

  function toggleVisibleProducts() {
    const visibleIds = visibleProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));

    if (allVisibleSelected) {
      setSelectedProductIds(selectedProductIds.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedProductIds([...new Set([...selectedProductIds, ...visibleIds])]);
    }
  }

  function applyBulkCategory() {
    if (!selectedProductIds.length) return showToast("Sélectionne au moins un produit.", "error");
    if (!bulkCategory) return showToast("Choisis une catégorie.", "error");

    setData({
      ...data,
      products: allProducts.map((product) =>
        selectedProductIds.includes(product.id)
          ? { ...product, category: bulkCategory }
          : product
      ),
    });

    logActivity?.("Modification catégorie produits", bulkCategory, `${selectedProductIds.length} produit(s)`);
    setSelectedProductIds([]);
    setBulkCategory("");
    showToast("Catégorie appliquée aux produits sélectionnés.", "success");
  }

  function applyBulkStock() {
    if (!selectedProductIds.length) return showToast("Sélectionne au moins un produit.", "error");

    setData({
      ...data,
      products: allProducts.map((product) =>
        selectedProductIds.includes(product.id)
          ? applyProductStockChange(product, 0, {
              setTo: Number(bulkStock || 0),
              type: "bulk",
              reason: "Modification groupée",
              user: currentRole,
            })
          : product
      ),
    });

    logActivity?.("Modification stock produits", `${Number(bulkStock || 0)} pièce(s)`, `${selectedProductIds.length} produit(s)`);
    setSelectedProductIds([]);
    showToast("Stock modifié avec succès.", "success");
  }

  function setAllProductsStock100() {
    if (!confirm("Mettre tous les produits à 100 pièces ?")) return;

    setData({
      ...data,
      products: allProducts.map((product) => ({
        ...product,
        stock: 100,
      })),
    });

    logActivity?.("Réinitialisation stock produits", "100 pièces", `${allProducts.length} produit(s)`);
    setSelectedProductIds([]);
    showToast("Tous les produits sont maintenant à 100 pièces.", "success");
  }

function openLinkedDocument(doc) {
  localStorage.setItem("crm_open_document_id", doc.id);

  localStorage.setItem(
    "crm_open_document_type",
    doc.type === "DEV" ? "quote" : "invoice"
  );

  window.dispatchEvent(
    new CustomEvent("crm-open-page", {
      detail: doc.type === "DEV" ? "quotes" : "invoices",
    })
  );
}

  function duplicateProduct(product) {
    const duplicated = {
      ...product,
      id: uid(),
      createdAt: today(),
      updatedAt: today(),
      name: `${product.name || "Produit"} (copie)`,
      sku: product.category ? generateSkuForCategory(product.category, null) : `${product.sku || "SKU"}-COPIE`,
      archived: false,
      history: [
        { id: uid(), date: today(), action: `Duplication depuis ${product.name || "produit"}`, user: currentRole },
      ],
    };

    const nextProducts = [...allProducts, duplicated];
    setData({ ...data, products: nextProducts });
    setSelectedProduct(duplicated);
    logActivity?.("Duplication produit", duplicated.name, duplicated.sku);
  }

  function archiveProduct(product) {
    const archived = !product.archived;
    const nextProducts = allProducts.map((p) =>
      p.id === product.id
        ? {
            ...p,
            archived,
            updatedAt: today(),
            history: [
              ...(p.history || []),
              { id: uid(), date: today(), action: archived ? "Archivage produit" : "Réactivation produit", user: currentRole },
            ],
          }
        : p
    );

    setData({ ...data, products: nextProducts });
    setSelectedProduct(nextProducts.find((p) => p.id === product.id) || null);
    logActivity?.(archived ? "Archivage produit" : "Réactivation produit", product.name, product.sku || "");
  }

  function adjustSelectedProductStock(mode) {
    if (!selectedProduct) return;

    const qty = Math.max(0, Number(stockMoveQty || 0));
    if (!qty) return showToast("Indique une quantité valide.", "error");

    const reason = String(stockMoveReason || "Ajustement manuel").trim() || "Ajustement manuel";
    const actionLabel =
      mode === "add"
        ? "Entrée stock"
        : mode === "remove"
          ? "Sortie stock"
          : "Correction inventaire";

    const nextProducts = allProducts.map((product) => {
      if (String(product.id) !== String(selectedProduct.id)) return product;

      const stockOptions = {
        type: mode === "set" ? "set" : "adjustment",
        reason,
        user: currentRole,
      };

      if (mode === "set") {
        return applyProductStockChange(product, 0, { ...stockOptions, setTo: qty });
      }

      const delta = mode === "add" ? qty : -qty;
      const updated = applyProductStockChange(product, delta, stockOptions);
      const previousStock = Number(product.stock || 0);
      const nextStock = Number(updated.stock || 0);

      return {
        ...updated,
        history: [
          ...(product.history || []),
          { id: uid(), date: today(), action: `${actionLabel} : ${previousStock} → ${nextStock}`, user: currentRole },
        ],
      };
    });

    const nextSelected = nextProducts.find((product) => String(product.id) === String(selectedProduct.id)) || null;
    setData({ ...data, products: nextProducts });
    setSelectedProduct(nextSelected);
    setStockMoveQty(1);
    logActivity?.(actionLabel, selectedProduct.name, `${reason} — ${qty}`);
  }


  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Produits</h2>
          <p>Gère tes produits, prix, références et stocks.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom produit *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="product-sku-field">
          <input
            placeholder="Référence SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
          />
          <button type="button" onClick={handleGenerateSku}>
            Générer SKU
          </button>
          <span>Auto selon la catégorie choisie.</span>
        </div>
        <select value={form.category} onChange={(e) => handleCategoryChange(e.target.value)}>
          <option value="">Sans catégorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Prix HT"
          value={String(form.price).replace(".", ",")}
          onChange={(e) => setForm({ ...form, price: e.target.value.replace(",", ".") })}
        />
        <input type="number" min="0" placeholder="Stock actuel" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <input type="number" min="0" placeholder="Stock minimum / alerte" value={form.stockMin} onChange={(e) => setForm({ ...form, stockMin: e.target.value })} />
        <div
          className={`product-image-field ${imageDragActive ? "drag-active" : ""} ${imageUploading ? "uploading" : ""}`}
          onDragEnter={handleProductImageDragEnter}
          onDragOver={handleProductImageDragOver}
          onDragLeave={handleProductImageDragLeave}
          onDrop={handleProductImageDrop}
        >
          <div
            className={`product-image-preview ${form.imageUrl ? "" : "product-image-preview--empty"}`}
            aria-live="polite"
          >
            {form.imageUrl ? (
              <img src={form.imageUrl} alt="Aperçu produit" />
            ) : (
              <span className="product-image-placeholder-icon" aria-hidden="true">🖼️</span>
            )}

            <div className="product-image-drop-overlay">
              <strong>
                {imageUploading
                  ? "Envoi en cours…"
                  : imageDragActive
                    ? "Déposez l'image ici"
                    : "Glissez une image ici"}
              </strong>
              {!imageUploading && !imageDragActive && (
                <span className="product-image-drop-hint">PNG, JPEG ou WebP depuis votre bureau</span>
              )}
            </div>

            {form.imageUrl && (
              <button
                type="button"
                className="product-image-remove"
                onClick={removeProductImage}
                disabled={imageUploading}
              >
                Retirer
              </button>
            )}
          </div>

          <label className="image-upload-button">
            {imageUploading ? "⏳ Envoi en cours…" : "📷 Importer une image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleProductImageUpload}
              disabled={imageUploading}
            />
          </label>

          <input
            type="url"
            placeholder="Ou coller une URL d'image (https://…)"
            value={isHttpImageUrl(form.imageUrl) ? form.imageUrl : ""}
            onChange={(e) => handleProductImageUrlChange(e.target.value)}
          />
        </div>
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="primary">{editing ? "Modifier" : "Ajouter produit"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="product-search-panel filters-card card">
        <div className="filters-premium-header">
          <div className="filters-title-row">
            <span className="filters-icon">⌕</span>
            <div>
              <strong>Recherche & filtres produits</strong>
              <span>{products.length} résultat(s) sur {productsStats.total} produit(s)</span>
            </div>
          </div>
        </div>

        <div className="filters-main-row products-filters-two-rows">
          <div className="filters-search-wrap">
            <span>⌕</span>
            <input
              className="search filters-search-input"
              placeholder="Recherche ultra rapide : nom, SKU, catégorie..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <select
            className="filters-select"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>

          <select
            className="filters-select"
            value={stockFilter}
            onChange={(e) => {
              setStockFilter(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Actifs</option>
            <option value="available">Disponibles</option>
            <option value="low">Stock faible</option>
            <option value="out">Rupture</option>
            <option value="archived">Archivés</option>
          </select>

          <select
            className="filters-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="name-asc">Nom A → Z</option>
            <option value="name-desc">Nom Z → A</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
            <option value="stock-asc">Stock croissant</option>
            <option value="stock-desc">Stock décroissant</option>
            <option value="margin-desc">Meilleure marge</option>
            <option value="recent">Plus récents</option>
          </select>

          <div className="filters-price-wrap">
            <input
              type="number"
              min="0"
              placeholder="Prix min"
              value={priceMin}
              onChange={(e) => {
                setPriceMin(e.target.value);
                setCurrentPage(1);
              }}
            />
            <span>→</span>
            <input
              type="number"
              min="0"
              placeholder="Prix max"
              value={priceMax}
              onChange={(e) => {
                setPriceMax(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        <div className="filters-bottom-row">
          <button type="button" className="filters-reset-button" onClick={resetProductFilters}>
            ↺ Réinitialiser
          </button>
        </div>
      </div>

      <div className="products-premium-panel card">
        <div className="bulk-actions products-bulk-premium">
          <strong>{selectedProductIds.length} produit(s) sélectionné(s)</strong>

          <select value={bulkStock} onChange={(e) => setBulkStock(e.target.value)}>
            <option value="100">100 pièces</option>
            <option value="200">200 pièces</option>
            <option value="500">500 pièces</option>
          </select>

          <button type="button" className="primary" onClick={applyBulkStock}>
            Modifier le stock
          </button>

          <button type="button" className="primary" onClick={setAllProductsStock100}>
            Tous les produits = 100 pièces
          </button>

          <button type="button" className="primary" onClick={regenerateAllProductSkus}>
            Regénérer tous les SKU
          </button>

          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>

          <button type="button" className="primary" onClick={applyBulkCategory}>
            Appliquer la catégorie
          </button>

          {selectedProductIds.length > 0 && (
            <button type="button" onClick={() => setSelectedProductIds([])}>
              Désélectionner
            </button>
          )}
        </div>

        <div className="select-visible-row">
          <button type="button" onClick={toggleVisibleProducts}>
            Sélectionner / désélectionner les produits affichés
          </button>
        </div>

        {products.length === 0 && (
          <div className="product-empty-state">
            <strong>Aucun produit trouvé</strong>
            <span>Essaie de modifier la recherche ou les filtres.</span>
          </div>
        )}

        <div className="products-erp-layout">
          <div className="product-premium-grid">
          {visibleProducts.map((product) => {
            const stock = Number(product.stock || 0);
            const minStock = Number(product.stockMin || product.minStock || 0);
            const _stockLevel = Math.min(100, Math.max(0, stock));
            const _stockClass =
              stock <= 0
                ? "danger"
                : minStock > 0 && stock <= minStock
                  ? "warning"
                  : "success";

            const cardImageUrl = getProductDisplayImageUrl(product);

            return (
              <article
                className={`product-premium-card ${
                  selectedProductIds.includes(product.id) ? "selected" : ""
                } ${selectedProduct?.id === product.id ? "active-product-card" : ""} ${product.archived ? "archived-product-card" : ""}`}
                key={product.id}
                onClick={() => setSelectedProduct(product)}
              >
                <div className="product-premium-top">
                  <label className="product-select-pill">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleProductSelection(product.id)}
                    />
                    <span>Sélection</span>
                  </label>
                </div>

                <div className="product-visual">
                  {cardImageUrl ? (
                    <img src={cardImageUrl} alt={product.name || "Produit"} />
                  ) : (
                    <span>{(product.name || "P").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div className="product-premium-body">
                  <h3>{product.name}</h3>
                  {product.archived && <span className="product-archived-badge">Archivé</span>}

                  <div className="product-tags-row">
                    <span>SKU : {product.sku || "Sans SKU"}</span>
                    <span>Prix HT : {money(product.price)}</span>
                  </div>

                  {product.description && (
                    <p className="product-description">{product.description}</p>
                  )}
                </div>

                <div className="product-actions" onClick={(event) => event.stopPropagation()}>
                  <button onClick={() => edit(product)}>Modifier</button>
                  <button className="danger" onClick={() => remove(product.id)}>Supprimer</button>
                </div>
              </article>
            );
          })}
          </div>

          <aside className="product-side-card card">
            {!selectedProduct ? (
              <div className="product-side-empty">
                <strong>Sélectionne un produit</strong>
                <span>La fiche détaillée apparaîtra ici.</span>
              </div>
            ) : (
              <>
                <div
                  className={`product-side-image ${sideImageDragActive ? "drag-active" : ""} ${imageUploading ? "uploading" : ""}`}
                  onDragEnter={handleSideImageDragEnter}
                  onDragOver={handleSideImageDragOver}
                  onDragLeave={handleSideImageDragLeave}
                  onDrop={handleSideImageDrop}
                  aria-live="polite"
                >
                  {form.imageUrl && editing === selectedProduct.id ? (
                    <img src={form.imageUrl} alt={selectedProduct.name || "Produit"} />
                  ) : selectedProduct.imageUrl ? (
                    <img src={selectedProduct.imageUrl} alt={selectedProduct.name || "Produit"} />
                  ) : (
                    <span>{(selectedProduct.name || "P").slice(0, 1).toUpperCase()}</span>
                  )}

                  <div className="product-side-image-overlay">
                    <strong>
                      {imageUploading
                        ? "Envoi en cours…"
                        : sideImageDragActive
                          ? "Déposez l'image ici"
                          : "Glissez une image ici"}
                    </strong>
                  </div>
                </div>

                <div className="product-side-header">
                  <div>
                    <h2>{selectedProduct.name}</h2>
                    <span>{selectedProduct.category || "Sans catégorie"}</span>
                  </div>

                  <strong>{money(selectedProduct.price)}</strong>
                </div>

                <div className="product-side-kpis">
                  <div>
                    <strong>{selectedProduct.sku || "—"}</strong>
                    <span>SKU</span>
                  </div>

                  <div>
                    <strong>{Number(selectedProduct.stock || 0)}</strong>
                    <span>Stock</span>
                  </div>

                  <div>
                    <strong>{Number(selectedProduct.stockMin || selectedProduct.minStock || 0)}</strong>
                    <span>Stock min</span>
                  </div>

                  <div>
                    <strong>{money(selectedProduct.price)}</strong>
                    <span>Prix HT</span>
                  </div>
                </div>

                {Number(selectedProduct.stockMin || selectedProduct.minStock || 0) > 0 && Number(selectedProduct.stock || 0) <= Number(selectedProduct.stockMin || selectedProduct.minStock || 0) && (
                  <div className="product-stock-alert">
                    ⚠️ Stock faible : réapprovisionnement conseillé.
                  </div>
                )}

                <div className="product-side-desc product-stock-manager">
                  <strong>Mouvements de stock</strong>
                  <div className="stock-manager-row">
                    <input
                      type="number"
                      min="0"
                      value={stockMoveQty}
                      onChange={(e) => setStockMoveQty(e.target.value)}
                      placeholder="Quantité"
                    />
                    <input
                      value={stockMoveReason}
                      onChange={(e) => setStockMoveReason(e.target.value)}
                      placeholder="Motif"
                    />
                  </div>
                  <div className="stock-manager-actions">
                    <button type="button" onClick={() => adjustSelectedProductStock("add")}>+ Entrée</button>
                    <button type="button" onClick={() => adjustSelectedProductStock("remove")}>− Sortie</button>
                    <button type="button" onClick={() => adjustSelectedProductStock("set")}>Correction inventaire</button>
                  </div>
                </div>

                {selectedProduct.stockMovements?.length > 0 && (
                  <div className="product-side-desc product-stock-history">
                    <strong>Historique stock</strong>
                    <div className="product-history-list">
                      {[...(selectedProduct.stockMovements || [])].reverse().slice(0, 10).map((movement) => (
                        <div className="product-history-row compact" key={movement.id || `${movement.date}-${movement.action}`}>
                          <div>
                            <b>{movement.action}</b>
                            <span>{formatDate(movement.date)} · {movement.reason || "Sans motif"}</span>
                            <small>{movement.previousStock} → {movement.nextStock} · {movement.user || "Utilisateur"}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedProduct.description && (
                  <div className="product-side-desc">
                    <strong>Description</strong>
                    <p>{selectedProduct.description}</p>
                  </div>
                )}

                {selectedProductStats && (
                  <div className="product-side-desc product-stats-v3">
                    <strong>Statistiques avancées</strong>
                    <div className="product-side-mini-grid">
                      <span><b>{selectedProductStats.docs}</b>Documents</span>
                      <span><b>{selectedProductStats.quotes}</b>Devis</span>
                      <span><b>{selectedProductStats.invoices}</b>Factures</span>
                      <span><b>{selectedProductStats.qty}</b>Qté vendue</span>
                    </div>
                    <p>CA généré : {money(selectedProductStats.revenue)}</p>
                    <p>Dernier client : {selectedProductStats.lastClientId ? ((data.clients || []).find((c) => String(c.id) === String(selectedProductStats.lastClientId))?.name || "Client supprimé") : "—"}</p>
                    <p>Date dernière vente : {formatDate(selectedProductStats.lastSaleDate)}</p>
                    <p>Meilleur client : {selectedProductStats.bestClient ? ((data.clients || []).find((c) => String(c.id) === String(selectedProductStats.bestClient.clientId))?.name || "Client supprimé") : "—"}</p>
                    {selectedProductStats.last && (
                      <p>Dernier document : {selectedProductStats.last.number}</p>
                    )}
                  </div>
                )}

                {selectedProductStats?.history?.length > 0 && (
                  <div className="product-side-desc product-history-sales">
                    <strong>Historique ventes / documents</strong>
                    <div className="product-history-list">
                      {selectedProductStats.history.map((doc) => (
                        <div className="product-history-row" key={`${doc.type}-${doc.id}`}>
                          <div>
                            <div className="product-doc-badge-wrapper">
                              <span
                                className={`product-doc-badge ${
                                  doc.type === "DEV" ? "dev" : "fac"
                                }`}
                              >
                                {doc.type}
                              </span>

                              <b>{doc.number}</b>
                            </div>
                            <span>{formatDate(doc.date)} · {((data.clients || []).find((c) => String(c.id) === String(doc.clientId))?.name || "Client supprimé")}</span>
                            <small>Qté : {doc.quantityForProduct} · Total produit : {money(doc.totalForProduct)}</small>
                          </div>
                          <button type="button" onClick={() => openLinkedDocument(doc)}>Ouvrir</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="product-side-desc product-ranking-box">
                  <strong>Top produits</strong>

                  <div className="product-ranking-section">
                    <span className="product-ranking-title">Top CA</span>
                    {productSalesRanking.byRevenue.length === 0 ? (
                      <p>Aucune vente facturée pour le moment.</p>
                    ) : (
                      productSalesRanking.byRevenue.map((p, index) => (
                        <p key={`revenue-${p.id}`}>
                          <span>#{index + 1} {p.name}</span>
                          <strong>{money(p.revenue)}</strong>
                        </p>
                      ))
                    )}
                  </div>

                  <div className="product-ranking-section">
                    <span className="product-ranking-title">Top quantités</span>
                    {productSalesRanking.byQuantity.length === 0 ? (
                      <p>Aucune quantité vendue pour le moment.</p>
                    ) : (
                      productSalesRanking.byQuantity.map((p, index) => (
                        <p key={`qty-${p.id}`}>
                          <span>#{index + 1} {p.name}</span>
                          <strong>{Number(p.soldQty || 0)} pcs</strong>
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {selectedProduct.history?.length > 0 && (
                  <div className="product-side-desc product-history-mods">
                    <strong>Historique modifications</strong>
                    <div className="product-history-list">
                      {[...(selectedProduct.history || [])].reverse().slice(0, 8).map((entry) => (
                        <div className="product-history-row compact" key={entry.id || `${entry.date}-${entry.action}`}>
                          <div>
                            <b>{entry.action}</b>
                            <span>{formatDate(entry.date)} · {entry.user || "Utilisateur"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="product-side-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => edit(selectedProduct)}
                  >
                    Modifier
                  </button>

                  <button type="button" onClick={() => duplicateProduct(selectedProduct)}>
                    Dupliquer
                  </button>

                  <button type="button" onClick={() => archiveProduct(selectedProduct)}>
                    {selectedProduct.archived ? "Réactiver" : "Archiver"}
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={() => remove(selectedProduct.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={products.length}
          perPage={itemsPerPage}
        />

      </div>
    </section>
  );
}