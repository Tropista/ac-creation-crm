import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import jsPDF from "jspdf";
import "./Vue3DTshirt.css";
import Product3DErrorBoundary from "./3d/Product3DErrorBoundary";
import TshirtModel from "./3d/TshirtModel";
import { showToast } from "../utils/toast";
import { PRODUCT_CONFIGS, PRODUCT_OPTIONS, getProductConfig } from "../utils/productConfigs";
import { resolveAssetUrl } from "../utils/assets";
import {
  buildCalculatorQuoteLine,
  buildTshirtConfiguratorQuoteDescription,
  buildTshirtConfiguratorWorkshopNotes,
  getCrmQuotesUrl,
  openQuoteFromCalculator,
  saveQuoteDraft,
} from "../utils/quoteDraft";
import {
  attachConfiguratorExportsToDraft,
  CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
  formatConfiguratorAttachmentErrors,
  withTimeout,
} from "../utils/tshirtQuoteAttachments";
import { submitPublicLead } from "../services/leadsService";
import { estimatePrintPriceHT } from "../utils/tshirtPricing";
import { PUBLIC_TSHIRT_PATH } from "../utils/routes";
import {
  applySnapToPosition,
  canvasToBlob,
  clamp,
  cmToPixels,
  createZipBlob,
  defaultLayerName,
  DEFAULT_TEXT_ITEM,
  downloadBlob,
  drawPrintItemForExport,
  EDITOR_PRINT_INSET,
  EDITOR_PRINT_SIZE,
  fileToDataUrl,
  formatCm,
  getFontExtension,
  getItemPrintSizeCm,
  getMaxItemWidthScale,
  getRulerTicks,
  getSnapGuides,
  getTechniquePreset,
  getTechniqueSummaryForArea,
  getTechniqueWarnings,
  getZoneSizeCm,
  limitItemToPrintArea,
  makeLayerName,
  makeUvTexture,
  MAX_PRINT_WIDTH_CM,
  PROJECTS_STORAGE_KEY,
  sanitizeFilename,
  sanitizeFontFilename,
  TECHNIQUE_OPTIONS,
  TECHNIQUE_PRESETS,
  uid,
  useItemImages,
  withAutoTextWidth,
} from "../utils/tshirtConfiguratorEngine";

export default function Vue3DTshirt() {
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicConfigurator = location.pathname.includes(PUBLIC_TSHIRT_PATH);
  // ── Sélection du produit ──────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState("tshirt");
  const productConfig = useMemo(() => getProductConfig(selectedProduct), [selectedProduct]);

  // Aliases dynamiques vers la config produit active
  const PRINT_ZONES         = productConfig.printZones;
  const PRINT_ZONE_SIZES_CM = productConfig.printZoneSizesCm;
  const GARMENT_SIZE_PRESETS = productConfig.sizePresets;
  const GARMENT_SIZE_OPTIONS = Object.keys(productConfig.sizePresets);
  const PRINT_SIZE_PRESETS   = productConfig.printSizePresets;

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeArea, setActiveArea] = useState("front");
  const [tshirtColor, setTshirtColor] = useState("#ffffff");
  const [showPrintZone, setShowPrintZone] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPreview, setSnapPreview] = useState(null);
  const [customFonts, setCustomFonts] = useState([]);
  const [printZoneSizes, setPrintZoneSizes] = useState(() => getProductConfig("tshirt").printZoneSizesCm);
  const [defaultTechnique, setDefaultTechnique] = useState("dtf");
  const [garmentSize, setGarmentSize] = useState("M");
  const [savedProjects, setSavedProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [quoteSavedModal, setQuoteSavedModal] = useState(false);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [pendingQuoteDraft, setPendingQuoteDraft] = useState(null);
  const [quoteDraftBusy, setQuoteDraftBusy] = useState(false);
  const [baseTextureImage, setBaseTextureImage] = useState(null);

  // Charge la texture de base du produit (ex: polo) pour l'utiliser comme fond du canvas UV
  useEffect(() => {
    const url = productConfig.baseTextureUrl;
    if (!url) { setBaseTextureImage(null); return; }
    const fullUrl = resolveAssetUrl(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => setBaseTextureImage(img);
    img.onerror = () => { console.warn("[configurateur] texture base introuvable:", fullUrl); setBaseTextureImage(null); };
    img.src = fullUrl;
  }, [productConfig.baseTextureUrl]);
  const previewRef = useRef(null);
  const editorRef = useRef(null);
  const actionRef = useRef(null);

  const itemImages = useItemImages(items);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const visibleItems = items.filter((item) => item.area === activeArea && !item.hidden);
  const layerItems = items
    .filter((item) => item.area === activeArea)
    .sort((a, b) => Number(b.z || 0) - Number(a.z || 0));
  const activeZoneSize = getZoneSizeCm(printZoneSizes, activeArea);
  const selectedPrintSize = selectedItem ? getItemPrintSizeCm(selectedItem, printZoneSizes) : null;
  const selectedTechnique = selectedItem ? getTechniquePreset(selectedItem) : null;
  const selectedTechniqueWarnings = selectedItem ? getTechniqueWarnings(selectedItem, printZoneSizes) : [];
  const rulerXTicks = getRulerTicks(activeZoneSize.width);
  const rulerYTicks = getRulerTicks(activeZoneSize.height);
  const snapGuides = getSnapGuides(activeArea, productConfig.snapGuides);
  const garmentPreset = GARMENT_SIZE_PRESETS[garmentSize] || GARMENT_SIZE_PRESETS.M;

  const printTexture = useMemo(
    () => makeUvTexture(itemImages, items, tshirtColor, baseTextureImage, productConfig.uvFlipY ?? false),
    [itemImages, items, tshirtColor, baseTextureImage, productConfig.uvFlipY]
  );

  useEffect(() => {
    return () => {
      for (const item of items) {
        if (item.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
      }
    };
  }, []);


  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "[]");
      setSavedProjects(Array.isArray(stored) ? stored : []);
    } catch (error) {
      console.warn("Impossible de lire les projets T-shirt sauvegardés.", error);
      setSavedProjects([]);
    }
  }, []);

  function updateItem(id, patch) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? limitItemToPrintArea({ ...item, ...patch }, printZoneSizes) : item
      )
    );
  }

  function addText() {
    const rawItem = {
      id: uid(),
      ...DEFAULT_TEXT_ITEM,
      area: activeArea,
      technique: defaultTechnique,
      layerName: "Texte",
      hidden: false,
      locked: false,
      z: Date.now(),
    };
    const item = limitItemToPrintArea(withAutoTextWidth(rawItem, printZoneSizes), printZoneSizes);
    setItems((current) => [...current, item]);
    setSelectedId(item.id);
  }

  async function handleLogoUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const newItems = await Promise.all(files.map(async (file, index) => {
        const src = await fileToDataUrl(file);
        return limitItemToPrintArea({
          id: uid(),
          type: "image",
          area: activeArea,
          technique: defaultTechnique,
          x: clamp(0.5 + index * 0.04, 0.05, 0.95),
          y: clamp(0.38 + index * 0.04, 0.05, 0.95),
          width: Math.min(0.22, getMaxItemWidthScale(activeArea, printZoneSizes)),
          height: 0.16,
          rotation: 0,
          src,
          fileName: file.name,
          layerName: file.name,
          hidden: false,
          locked: false,
          z: Date.now() + index,
        }, printZoneSizes);
      }));

      setItems((current) => [...current, ...newItems]);
      setSelectedId(newItems[0].id);
    } catch (error) {
      console.error("Erreur import logo :", error);
      showToast("Impossible de lire un logo importé.", "error");
    }

    event.target.value = "";
  }

  async function handleFontUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const src = URL.createObjectURL(file);
    try {
      const dataUrl = await fileToDataUrl(file);
      const font = new FontFace(fontName, `url(${src})`);
      await font.load();
      document.fonts.add(font);
      setCustomFonts((current) => [...current, { name: fontName, src, file, dataUrl, originalName: file.name }]);
      if (selectedItem?.type === "text") updateItem(selectedItem.id, { fontFamily: fontName });
    } catch (_error) {
      showToast("Police impossible à charger. Essaie un fichier .ttf, .otf, .woff ou .woff2.", "error");
      URL.revokeObjectURL(src);
    }
    event.target.value = "";
  }

  function pointFromEvent(event) {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return null;

    // Les coordonnées de travail sont relatives à la zone pointillée, pas à tout le carré éditeur.
    const rawX = (event.clientX - rect.left) / rect.width;
    const rawY = (event.clientY - rect.top) / rect.height;

    return {
      x: clamp((rawX - EDITOR_PRINT_INSET) / EDITOR_PRINT_SIZE, 0, 1),
      y: clamp((rawY - EDITOR_PRINT_INSET) / EDITOR_PRINT_SIZE, 0, 1),
      rect,
    };
  }

  function startMove(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item || item.locked || item.hidden) return;
    actionRef.current = {
      type: "move",
      id: itemId,
      startPointer: point,
      startItem: { ...item },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startResize(event, itemId, handle = "both") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    const point = pointFromEvent(event);
    const item = items.find((entry) => entry.id === itemId);
    if (!point || !item || item.locked || item.hidden) return;
    actionRef.current = {
      type: "resize",
      handle,
      id: itemId,
      startPointer: point,
      startItem: { ...item },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const action = actionRef.current;
    if (!action) return;
    const point = pointFromEvent(event);
    if (!point) return;

    if (action.type === "move") {
      const dx = point.x - action.startPointer.x;
      const dy = point.y - action.startPointer.y;
      const nextPatch = {
        x: action.startItem.x + dx,
        y: action.startItem.y + dy,
      };
      const snapped = applySnapToPosition(action.startItem, nextPatch, snapEnabled, productConfig.snapGuides);
      setSnapPreview(snapped.preview);
      updateItem(action.id, snapped.patch);
    }

    if (action.type === "resize") {
      setSnapPreview(null);
      const dx = point.x - action.startPointer.x;
      const dy = point.y - action.startPointer.y;
      const handle = action.handle || "both";
      const startWidth = Number(action.startItem.width || 0.22);
      const startHeight = Number(action.startItem.height || 0.16);
      const startX = Number(action.startItem.x ?? 0.5);
      const startY = Number(action.startItem.y ?? 0.5);
      const maxWidth = getMaxItemWidthScale(action.startItem.area || activeArea, printZoneSizes);
      const minWidth = 0.035;
      const minHeight = 0.025;

      let nextWidth = startWidth;
      let nextHeight = startHeight;
      let nextX = startX;
      let nextY = startY;

      if (handle === "right" || handle === "both") {
        nextWidth = clamp(startWidth + dx, minWidth, maxWidth);
        nextX = startX + (nextWidth - startWidth) / 2;
      }

      if (handle === "left") {
        nextWidth = clamp(startWidth - dx, minWidth, maxWidth);
        nextX = startX - (nextWidth - startWidth) / 2;
      }

      if (handle === "bottom" || handle === "both") {
        nextHeight = clamp(startHeight + dy, minHeight, 1);
        nextY = startY + (nextHeight - startHeight) / 2;
      }

      if (handle === "top") {
        nextHeight = clamp(startHeight - dy, minHeight, 1);
        nextY = startY - (nextHeight - startHeight) / 2;
      }

      const patch = {
        width: nextWidth,
        height: nextHeight,
        x: nextX,
        y: nextY,
      };

      // Texte : on redimensionne uniquement le cadre.
      // Le SVG du texte se met automatiquement à l’échelle du cadre,
      // ce qui évite les agrandissements brutaux et les débordements.
      if (action.startItem.type === "text") {
        delete patch.textSize;
      }

      updateItem(action.id, patch);
    }
  }

  function stopPointer() {
    actionRef.current = null;
    setSnapPreview(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const item = items.find((entry) => entry.id === selectedId);
    if (item?.src?.startsWith("blob:")) URL.revokeObjectURL(item.src);
    setItems((current) => current.filter((entry) => entry.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedItem) return;
    const copy = limitItemToPrintArea({
      ...selectedItem,
      id: uid(),
      x: selectedItem.x + 0.05,
      y: selectedItem.y + 0.05,
    }, printZoneSizes);
    setItems((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function updateLayer(id, patch) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function renameLayer(id, name) {
    updateLayer(id, { layerName: makeLayerName(name, defaultLayerName(items.find((item) => item.id === id))) });
  }

  function toggleLayerHidden(id) {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const hidden = !item.hidden;
      if (hidden && selectedId === id) setSelectedId(null);
      return { ...item, hidden };
    }));
  }

  function toggleLayerLocked(id) {
    updateLayer(id, { locked: !items.find((item) => item.id === id)?.locked });
  }

  function moveLayer(id, direction) {
    setItems((current) => {
      const currentZ = Number(current.find((item) => item.id === id)?.z || 0);
      const sorted = [...current].sort((a, b) => Number(a.z || 0) - Number(b.z || 0));
      const index = sorted.findIndex((item) => item.id === id);
      const swapIndex = direction === "up" ? index + 1 : index - 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return current;
      const other = sorted[swapIndex];
      return current.map((item) => {
        if (item.id === id) return { ...item, z: Number(other.z || 0) };
        if (item.id === other.id) return { ...item, z: currentZ };
        return item;
      });
    });
  }

  function updateActiveZoneSize(patch) {
    setPrintZoneSizes((current) => {
      const next = {
        ...current,
        [activeArea]: {
          ...getZoneSizeCm(current, activeArea),
          ...patch,
        },
      };

      setItems((itemsCurrent) =>
        itemsCurrent.map((item) =>
          item.area === activeArea ? limitItemToPrintArea(item, next) : item
        )
      );

      return next;
    });
  }

  function applyPrintPreset(event) {
    const preset = PRINT_SIZE_PRESETS.find((entry) => entry.label === event.target.value);
    if (!preset) return;
    updateActiveZoneSize({ width: preset.width, height: preset.height });
    event.target.value = "";
  }

  function updateSelectedRealSize(patchCm) {
    if (!selectedItem) return;
    const areaSize = getZoneSizeCm(printZoneSizes, selectedItem.area);
    const patch = {};
    if (patchCm.width !== undefined) {
      const maxWidthCm = Math.min(MAX_PRINT_WIDTH_CM, Number(areaSize.width || MAX_PRINT_WIDTH_CM));
      patch.width = clamp(Number(patchCm.width || 0) / areaSize.width, 0.01, maxWidthCm / areaSize.width);
    }
    if (patchCm.height !== undefined) {
      patch.height = clamp(Number(patchCm.height || 0) / areaSize.height, 0.01, 1);
    }
    updateItem(selectedItem.id, patch);
  }


  function persistProjects(nextProjects) {
    setSavedProjects(nextProjects);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextProjects));
  }

  function buildProjectSnapshot(name) {
    return {
      id: uid(),
      name: makeLayerName(name, `Projet ${productConfig.label} ${new Date().toLocaleDateString("fr-FR")}`),
      savedAt: new Date().toISOString(),
      selectedProduct,
      activeArea,
      tshirtColor,
      showPrintZone,
      snapEnabled,
      defaultTechnique,
      garmentSize,
      printZoneSizes,
      items: items.map((item) => ({ ...item })),
      customFonts: customFonts.map((font) => ({
        name: font.name,
        originalName: font.originalName,
        dataUrl: font.dataUrl || font.src || null,
      })),
    };
  }

  async function restoreCustomFonts(fonts = []) {
    const restored = [];

    for (const fontInfo of fonts) {
      if (!fontInfo?.name || !fontInfo?.dataUrl) continue;
      try {
        const font = new FontFace(fontInfo.name, `url(${fontInfo.dataUrl})`);
        await font.load();
        document.fonts.add(font);
        restored.push({
          name: fontInfo.name,
          src: fontInfo.dataUrl,
          dataUrl: fontInfo.dataUrl,
          originalName: fontInfo.originalName || fontInfo.name,
        });
      } catch (error) {
        console.warn(`Police impossible à restaurer : ${fontInfo.name}`, error);
      }
    }

    setCustomFonts(restored);
  }

  function saveCurrentProject() {
    const snapshot = {
      ...buildProjectSnapshot(projectName),
      id: currentProjectId || uid(),
    };

    const nextProjects = [
      snapshot,
      ...savedProjects.filter((project) => project.id !== snapshot.id),
    ].slice(0, 30);

    persistProjects(nextProjects);
    setCurrentProjectId(snapshot.id);
    setProjectName(snapshot.name);
    showToast(`Projet sauvegardé : ${snapshot.name}`, "success");
  }

  async function loadProject(projectId) {
    const project = savedProjects.find((entry) => entry.id === projectId);
    if (!project) return;

    setCurrentProjectId(project.id);
    // Restaurer le produit en premier (change PRINT_ZONE_SIZES_CM et productConfig)
    const restoredProduct = project.selectedProduct || "tshirt";
    setSelectedProduct(restoredProduct);
    const restoredConfig = getProductConfig(restoredProduct);
    await restoreCustomFonts(project.customFonts || []);
    const zoneSizes = project.printZoneSizes || restoredConfig.printZoneSizesCm;
    setItems((project.items || []).map((item) => limitItemToPrintArea(item, zoneSizes)));
    setSelectedId(null);
    setActiveArea(project.activeArea || "front");
    setTshirtColor(project.tshirtColor || "#ffffff");
    setShowPrintZone(project.showPrintZone ?? true);
    setSnapEnabled(project.snapEnabled ?? true);
    setDefaultTechnique(project.defaultTechnique || "dtf");
    setGarmentSize(project.garmentSize || "M");
    setPrintZoneSizes(zoneSizes);
    setProjectName(project.name || "");
  }

  function deleteProject(projectId) {
    const project = savedProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    if (!window.confirm(`Supprimer la sauvegarde “${project.name}” ?`)) return;
    persistProjects(savedProjects.filter((entry) => entry.id !== projectId));
    if (currentProjectId === projectId) setCurrentProjectId(null);
  }

  function exportProjectJson() {
    const snapshot = buildProjectSnapshot(projectName);
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${sanitizeFilename(snapshot.name)}.tshirt-project.json`);
  }

  async function importProjectJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const project = JSON.parse(text);
      const snapshot = { ...project, id: project.id || uid(), savedAt: project.savedAt || new Date().toISOString() };
      const nextProjects = [snapshot, ...savedProjects.filter((entry) => entry.id !== snapshot.id)].slice(0, 30);
      persistProjects(nextProjects);

      await restoreCustomFonts(snapshot.customFonts || []);
      setItems((snapshot.items || []).map((item) => limitItemToPrintArea(item, snapshot.printZoneSizes || PRINT_ZONE_SIZES_CM)));
      setSelectedId(null);
      setActiveArea(snapshot.activeArea || "front");
      setTshirtColor(snapshot.tshirtColor || "#ffffff");
      setShowPrintZone(snapshot.showPrintZone ?? true);
      setSnapEnabled(snapshot.snapEnabled ?? true);
      setDefaultTechnique(snapshot.defaultTechnique || "dtf");
      setGarmentSize(snapshot.garmentSize || "M");
      setPrintZoneSizes(snapshot.printZoneSizes || PRINT_ZONE_SIZES_CM);
      setProjectName(snapshot.name || "");
      setCurrentProjectId(snapshot.id);
    } catch (error) {
      console.error("Import projet impossible :", error);
      showToast("Projet impossible à importer. Vérifie le fichier JSON.", "error");
    }

    event.target.value = "";
  }

  async function buildPrintElementFiles() {
    const files = [];

    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    for (let index = 0; index < printableItems.length; index += 1) {
      const item = printableItems[index];
      const { width, height } = getItemPrintSizeCm(item, printZoneSizes);
      const widthPx = cmToPixels(width);
      const heightPx = cmToPixels(height);
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;

      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      drawPrintItemForExport(ctx, item, itemImages[item.id], widthPx, heightPx);

      const areaLabel = PRINT_ZONES[item.area]?.label || item.area || "zone";
      const baseName = item.type === "image" ? item.fileName || "logo" : item.text || "texte";
      const techniqueLabel = getTechniquePreset(item).shortLabel;
      const filename = `impression/${String(index + 1).padStart(2, "0")}-${sanitizeFilename(areaLabel)}-${sanitizeFilename(techniqueLabel)}-${sanitizeFilename(baseName)}-${width.toFixed(1)}x${height.toFixed(1)}cm-300dpi.png`;

      files.push({ name: filename, blob: await canvasToBlob(canvas) });
    }

    return files;
  }


  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function buildZoneSvg(area, areaItems) {
    const zone = PRINT_ZONES[area] || PRINT_ZONES.front;
    const zoneSize = getZoneSizeCm(printZoneSizes, area);
    const zoneWidth = Number(zoneSize.width || 1);
    const zoneHeight = Number(zoneSize.height || 1);
    const title = zone.label || area;

    const parts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${zoneWidth}cm" height="${zoneHeight}cm" viewBox="0 0 ${zoneWidth} ${zoneHeight}">`,
      `<title>${escapeXml(title)}</title>`,
      `<desc>Export vectoriel généré depuis le configurateur T-shirt. Les textes restent vectoriels. Les logos/photos importés restent intégrés en image raster.</desc>`,
      `<rect x="0" y="0" width="${zoneWidth}" height="${zoneHeight}" fill="none" stroke="#2563eb" stroke-width="0.05" stroke-dasharray="0.4 0.25"/>`,
    ];

    for (const item of areaItems) {
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const itemW = Number(size.width || 0.1);
      const itemH = Number(size.height || 0.1);
      const cx = Number(item.x ?? 0.5) * zoneWidth;
      const cy = Number(item.y ?? 0.5) * zoneHeight;
      const x = cx - itemW / 2;
      const y = cy - itemH / 2;
      const rotation = Number(item.rotation || 0);
      const transform = rotation ? ` transform="rotate(${rotation} ${cx} ${cy})"` : "";

      if (item.type === "image" && item.src) {
        parts.push(
          `<image x="${x}" y="${y}" width="${itemW}" height="${itemH}" preserveAspectRatio="none" href="${escapeXml(item.src)}" xlink:href="${escapeXml(item.src)}"${transform}/>`
        );
      }

      if (item.type === "text") {
        const fontSizeCm = Math.max(0.15, itemH * 0.72);
        const strokeAttrs = item.strokeEnabled
          ? ` stroke="${escapeXml(item.strokeColor || "#000000")}" stroke-width="${Math.max(0.01, Number(item.strokeWidth || 1) * 0.015)}" paint-order="stroke" stroke-linejoin="round"`
          : "";
        const shadowStyle = item.shadowEnabled
          ? ` style="filter: drop-shadow(${Number(item.shadowOffsetX || 0) * 0.03}cm ${Number(item.shadowOffsetY || 0) * 0.03}cm ${Number(item.shadowBlur || 0) * 0.02}cm ${escapeXml(item.shadowColor || "#000000")});"`
          : "";
        const curve = Number(item.curve || 0);

        if (Math.abs(curve) > 2) {
          const pathId = `curve-${escapeXml(area)}-${escapeXml(item.id || String(Math.random()).slice(2))}`;
          const midY = cy;
          const controlY = cy - (curve / 100) * itemH * 1.25;
          parts.push(`<path id="${pathId}" d="M ${x} ${midY} Q ${cx} ${controlY} ${x + itemW} ${midY}" fill="none"/>`);
          parts.push(
            `<text font-family="${escapeXml(item.fontFamily || "Arial")}" font-size="${fontSizeCm}" font-weight="800" fill="${escapeXml(item.textColor || "#111827")}" text-anchor="middle" dominant-baseline="middle"${strokeAttrs}${shadowStyle}${transform}><textPath href="#${pathId}" startOffset="50%">${escapeXml(item.text || "Texte")}</textPath></text>`
          );
        } else {
          parts.push(
            `<text x="${cx}" y="${cy}" font-family="${escapeXml(item.fontFamily || "Arial")}" font-size="${fontSizeCm}" font-weight="800" fill="${escapeXml(item.textColor || "#111827")}" text-anchor="middle" dominant-baseline="middle"${strokeAttrs}${shadowStyle}${transform}>${escapeXml(item.text || "Texte")}</text>`
          );
        }
      }
    }

    parts.push(`</svg>`);
    return parts.join("\n");
  }

  function _buildZoneEps(area, areaItems) {
    const zone = PRINT_ZONES[area] || PRINT_ZONES.front;
    const zoneSize = getZoneSizeCm(printZoneSizes, area);
    const zoneWidthPt = Number(zoneSize.width || 1) * 28.3465;
    const zoneHeightPt = Number(zoneSize.height || 1) * 28.3465;
    const lines = [
      "%!PS-Adobe-3.0 EPSF-3.0",
      `%%Title: ${zone.label || area}`,
      `%%BoundingBox: 0 0 ${Math.ceil(zoneWidthPt)} ${Math.ceil(zoneHeightPt)}`,
      "%%Creator: AC Creation CRM - Vue3D T-shirt",
      "%%LanguageLevel: 2",
      "%%EndComments",
      "/Arial-Bold findfont 24 scalefont setfont",
      "0 0 0 setrgbcolor",
    ];

    areaItems.forEach((item) => {
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const zoneWidthCm = Number(zoneSize.width || 1);
      const zoneHeightCm = Number(zoneSize.height || 1);
      const cx = Number(item.x ?? 0.5) * zoneWidthCm * 28.3465;
      const cy = zoneHeightPt - Number(item.y ?? 0.5) * zoneHeightCm * 28.3465;
      const w = Number(size.width || 0.1) * 28.3465;
      const h = Number(size.height || 0.1) * 28.3465;

      if (item.type === "text") {
        const safeText = String(item.text || "Texte").replace(/[()\\]/g, "\\$&");
        const fontSize = Math.max(6, h * 0.72);
        lines.push("gsave");
        lines.push(`${cx} ${cy} translate`);
        if (Number(item.rotation || 0)) lines.push(`${Number(item.rotation || 0)} rotate`);
        lines.push(`/Arial-Bold findfont ${fontSize.toFixed(2)} scalefont setfont`);
        lines.push(`(${safeText}) dup stringwidth pop -2 div 0 moveto show`);
        lines.push("grestore");
      } else {
        lines.push(`% Image raster intégrée dans le SVG correspondant : ${item.fileName || "logo"}`);
        lines.push("gsave");
        lines.push("0.2 0.45 1 setrgbcolor");
        lines.push(`${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} rectstroke`);
        lines.push("grestore");
      }
    });

    lines.push("showpage", "%%EOF");
    return lines.join("\n");
  }

  async function buildVectorFiles() {
    const files = [];
    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    const areas = Object.keys(PRINT_ZONES);
    for (const area of areas) {
      const areaItems = printableItems.filter((item) => item.area === area);
      if (!areaItems.length) continue;

      const areaLabel = sanitizeFilename(PRINT_ZONES[area]?.label || area);
      const svg = buildZoneSvg(area, areaItems);
      files.push({
        name: `vectoriels/${areaLabel}.svg`,
        blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      });
    }

    const readme = [
      "Export SVG Vue3D T-shirt",
      "",
      "- Les fichiers .SVG peuvent être ouverts dans Illustrator, CorelDRAW, Inkscape, etc.",
      "- Les textes restent vectoriels dans le SVG.",
      "- Les logos/photos importés restent des images raster intégrées dans le SVG.",
      "- Pour obtenir un fichier .AI, ouvrir le SVG dans Illustrator puis enregistrer en .AI.",
    ].join("\n");

    files.push({ name: "vectoriels/README-SVG.txt", blob: new Blob([readme], { type: "text/plain;charset=utf-8" }) });
    return files;
  }

  async function buildFontFiles() {
    const fontFiles = [];

    for (let index = 0; index < customFonts.length; index += 1) {
      const font = customFonts[index];
      if (!font) continue;

      let blob = font.file;
      if (!blob && font.dataUrl) {
        blob = await fetch(font.dataUrl).then((response) => response.blob());
      }
      if (!blob) continue;

      const extension = getFontExtension(font.file || { name: font.originalName || font.name, type: blob.type });
      const filename = sanitizeFontFilename(font.originalName || font.file?.name || font.name, extension);
      fontFiles.push({
        name: `polices/${String(index + 1).padStart(2, "0")}-${filename}`,
        blob,
      });
    }

    return fontFiles;
  }


  async function buildAutoMockupFiles() {
    const files = [];
    const areaExports = [
      { area: "front", filename: "mockup-face.png", title: "Face" },
      { area: "back", filename: "mockup-dos.png", title: "Dos" },
      { area: "leftSleeve", filename: "mockup-manche-gauche.png", title: "Manche gauche" },
      { area: "rightSleeve", filename: "mockup-manche-droite.png", title: "Manche droite" },
    ];

    for (const areaExport of areaExports) {
      const areaItems = items
        .filter((item) => item.area === areaExport.area && !item.hidden)
        .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

      const isSleeve = areaExport.area === "leftSleeve" || areaExport.area === "rightSleeve";
      const canvas = document.createElement("canvas");
      canvas.width = isSleeve ? 1400 : 1600;
      canvas.height = isSleeve ? 1400 : 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Fond vêtement simple pour obtenir 4 exports différents et lisibles,
      // sans dépendre de la rotation du canvas WebGL.
      ctx.save();
      ctx.fillStyle = tshirtColor || "#ffffff";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 6;

      if (isSleeve) {
        const sleeveX = canvas.width * 0.22;
        const sleeveY = canvas.height * 0.18;
        const sleeveW = canvas.width * 0.56;
        const sleeveH = canvas.height * 0.64;
        ctx.beginPath();
        ctx.roundRect(sleeveX, sleeveY, sleeveW, sleeveH, 80);
        ctx.fill();
        ctx.stroke();
      } else {
        const w = canvas.width;
        const h = canvas.height;
        ctx.beginPath();
        ctx.moveTo(w * 0.32, h * 0.17);
        ctx.quadraticCurveTo(w * 0.42, h * 0.10, w * 0.50, h * 0.13);
        ctx.quadraticCurveTo(w * 0.58, h * 0.10, w * 0.68, h * 0.17);
        ctx.lineTo(w * 0.88, h * 0.28);
        ctx.lineTo(w * 0.78, h * 0.43);
        ctx.lineTo(w * 0.70, h * 0.37);
        ctx.lineTo(w * 0.70, h * 0.88);
        ctx.lineTo(w * 0.30, h * 0.88);
        ctx.lineTo(w * 0.30, h * 0.37);
        ctx.lineTo(w * 0.22, h * 0.43);
        ctx.lineTo(w * 0.12, h * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      const printRect = isSleeve
        ? { x: canvas.width * 0.28, y: canvas.height * 0.28, w: canvas.width * 0.44, h: canvas.height * 0.44 }
        : { x: canvas.width * 0.26, y: canvas.height * 0.24, w: canvas.width * 0.48, h: canvas.height * 0.56 };

      ctx.save();
      ctx.setLineDash([18, 12]);
      ctx.strokeStyle = "rgba(37, 99, 235, 0.55)";
      ctx.lineWidth = 4;
      ctx.strokeRect(printRect.x, printRect.y, printRect.w, printRect.h);
      ctx.restore();

      for (const item of areaItems) {
        const itemW = Math.max(20, Number(item.width || 0.22) * printRect.w);
        const itemH = Math.max(20, Number(item.height || 0.16) * printRect.h);
        const cx = printRect.x + Number(item.x ?? 0.5) * printRect.w;
        const cy = printRect.y + Number(item.y ?? 0.5) * printRect.h;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((Number(item.rotation || 0) * Math.PI) / 180);

        if (item.type === "image" && itemImages[item.id]) {
          ctx.drawImage(itemImages[item.id], -itemW / 2, -itemH / 2, itemW, itemH);
        }

        if (item.type === "text") {
          const text = String(item.text || "Texte");
          ctx.fillStyle = item.textColor || "#111827";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          let fontSize = Math.floor(itemH * 0.72);
          ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
          while (ctx.measureText(text).width > itemW * 0.92 && fontSize > 8) {
            fontSize -= 2;
            ctx.font = `800 ${fontSize}px "${item.fontFamily || "Arial"}"`;
          }
          ctx.fillText(text, 0, 0, itemW * 0.92);
        }

        ctx.restore();
      }

      ctx.fillStyle = "#111827";
      ctx.font = "700 42px Arial";
      ctx.textAlign = "center";
      ctx.fillText(areaExport.title, canvas.width / 2, canvas.height - 60);

      files.push({ name: areaExport.filename, blob: await canvasToBlob(canvas) });
    }

    return files;
  }

  async function buildImpressionZipBlob() {
    const files = [];
    const canvas = previewRef.current?.querySelector("canvas");

    if (canvas) {
      files.push({ name: "mockup-tshirt.png", blob: await canvasToBlob(canvas) });
    }

    files.push(...(await buildAutoMockupFiles()));
    files.push(...(await buildPrintElementFiles()));
    files.push(...(await buildVectorFiles()));
    files.push(...(await buildFontFiles()));

    if (!files.length) return null;
    return createZipBlob(files);
  }

  async function exportMockup() {
    try {
      const zipBlob = await buildImpressionZipBlob();
      if (!zipBlob) {
        showToast("Aucun fichier à exporter.", "error");
        return;
      }

      downloadBlob(zipBlob, `export-${selectedProduct}-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      console.error("Erreur export ZIP :", error);
      showToast("Export ZIP impossible. Vérifie la console pour plus de détails.", "error");
    }
  }

  function buildWorkshopPdfDocument(printableItems) {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let y = margin;
      const todayLabel = new Date().toLocaleString("fr-FR");

      const addHeader = (title = "Fiche atelier T-shirt") => {
        pdf.setFillColor(17, 24, 39);
        pdf.rect(0, 0, pageW, 18, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text(title, margin, 12);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(todayLabel, pageW - margin, 12, { align: "right" });
        pdf.setTextColor(17, 24, 39);
        y = 26;
      };

      const addPageIfNeeded = (needed = 16) => {
        if (y + needed > pageH - margin) {
          pdf.addPage();
          addHeader();
        }
      };

      addHeader();

      const mockupCanvas = previewRef.current?.querySelector("canvas");
      if (mockupCanvas) {
        const imgData = mockupCanvas.toDataURL("image/png");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text("Mockup client", margin, y);
        y += 5;
        pdf.addImage(imgData, "PNG", margin, y, 86, 66, undefined, "FAST");
        y += 72;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Zones réelles", margin, y);
      y += 7;

      Object.entries(PRINT_ZONES).forEach(([key, zone]) => {
        const size = getZoneSizeCm(printZoneSizes, key);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`${zone.label} : ${formatCm(size.width)} × ${formatCm(size.height)} cm`, margin, y);
        y += 5;
      });

      y += 4;
      addPageIfNeeded(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Zones techniques", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      Object.entries(PRINT_ZONES).forEach(([key, zone]) => {
        addPageIfNeeded(6);
        pdf.text(`${zone.label} : ${getTechniqueSummaryForArea(printableItems, key)}`, margin, y);
        y += 5;
      });

      y += 4;
      addPageIfNeeded(25);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Éléments à imprimer", margin, y);
      y += 8;

      const headers = ["#", "Nom", "Zone", "Type", "Technique", "Taille", "Position", "Rotation"];
      const widths = [7, 34, 24, 16, 24, 27, 32, 16];
      const x0 = margin;

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      let x = x0;
      headers.forEach((head, idx) => {
        pdf.text(head, x, y);
        x += widths[idx];
      });
      y += 4;
      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, y, pageW - margin, y);
      y += 5;

      printableItems.forEach((item, index) => {
        addPageIfNeeded(12);
        const size = getItemPrintSizeCm(item, printZoneSizes);
        const zoneSize = getZoneSizeCm(printZoneSizes, item.area);
        const posXcm = Number(item.x || 0) * zoneSize.width;
        const posYcm = Number(item.y || 0) * zoneSize.height;
        const row = [
          String(index + 1),
          defaultLayerName(item).slice(0, 24),
          PRINT_ZONES[item.area]?.label || item.area || "-",
          item.type === "text" ? "Texte" : "Logo",
          getTechniquePreset(item).shortLabel,
          `${formatCm(size.width)} × ${formatCm(size.height)} cm`,
          `X ${formatCm(posXcm)} / Y ${formatCm(posYcm)} cm`,
          `${Number(item.rotation || 0).toFixed(0)}°`,
        ];

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        x = x0;
        row.forEach((cell, idx) => {
          pdf.text(String(cell), x, y, { maxWidth: widths[idx] - 2 });
          x += widths[idx];
        });
        y += 7;
      });

      y += 4;
      addPageIfNeeded(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Polices utilisées", margin, y);
      y += 7;

      const usedFonts = Array.from(new Set(printableItems.filter((item) => item.type === "text").map((item) => item.fontFamily || "Arial")));
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      if (usedFonts.length) {
        usedFonts.forEach((font) => {
          addPageIfNeeded(6);
          const imported = customFonts.find((entry) => entry.name === font);
          pdf.text(`• ${font}${imported ? " (fichier fourni dans le ZIP)" : ""}`, margin, y);
          y += 5;
        });
      } else {
        pdf.text("Aucun texte visible.", margin, y);
        y += 5;
      }

      y += 4;
      addPageIfNeeded(24);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Notes atelier", margin, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("• Les PNG séparés restent la source d'impression principale.", margin, y);
      y += 5;
      pdf.text("• Vérifier la zone, la taille réelle et la police avant production.", margin, y);
      y += 5;
      pdf.text("• Les calques masqués ne sont pas inclus dans l'export.", margin, y);

      return pdf;
  }

  async function buildWorkshopPdfBlob() {
    const printableItems = items
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(a.z || 0) - Number(b.z || 0));

    if (!printableItems.length) return null;

    const pdf = buildWorkshopPdfDocument(printableItems);
    return pdf.output("blob");
  }

  async function exportWorkshopPdf() {
    try {
      const pdfBlob = await buildWorkshopPdfBlob();
      if (!pdfBlob) {
        showToast("Ajoute au moins un logo ou un texte visible avant de générer le PDF atelier.", "error");
        return;
      }

      downloadBlob(pdfBlob, `fiche-atelier-${selectedProduct}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("Erreur export PDF atelier :", error);
      showToast("Export PDF atelier impossible. Vérifie la console pour plus de détails.", "error");
    }
  }

  async function buildQuoteDraftFromProject() {
    const visibleItems = items.filter((item) => !item.hidden);
    if (!visibleItems.length) return null;

    const qty = Math.max(1, Number(orderQuantity) || 1);
    const label = projectName.trim() || `T-shirt ${garmentPreset.label}`;
    const techniqueSummary = Array.from(
      new Set(visibleItems.map((item) => getTechniquePreset(item).label))
    ).join(" / ");

    const printDetails = visibleItems.map((item) => {
      const zone = PRINT_ZONES[item.area]?.label || item.area;
      const tech = getTechniquePreset(item);
      const size = getItemPrintSizeCm(item, printZoneSizes);
      const content =
        item.type === "text"
          ? `"${item.text || "Texte"}"`
          : item.fileName || "Logo";
      const unitPrice = estimatePrintPriceHT(
        item,
        item.technique || defaultTechnique,
        size.width,
        size.height
      );
      return { zone, content, tech, size, unitPrice };
    });

    const totalUnitHT = printDetails.reduce((sum, entry) => sum + entry.unitPrice, 0);
    const markingZones = printDetails.map((entry) => entry.zone).join(", ");

    const markingPayload = printDetails.map((entry) => ({
      zone: entry.zone,
      content: entry.content,
      technique: entry.tech.shortLabel,
      width: entry.size.width,
      height: entry.size.height,
      unitPrice: entry.unitPrice,
    }));

    const baseDraft = {
      source: "configurateur t-shirt",
      calculatorProjectId: currentProjectId || "",
      notes: buildTshirtConfiguratorWorkshopNotes({
        projectName: label,
        garmentSize,
        garmentPresetLabel: garmentPreset.label,
        tshirtColor,
        techniqueSummary,
        quantity: qty,
        totalUnitHT,
        markings: markingPayload,
      }),
      lines: [
        buildCalculatorQuoteLine({
          description: buildTshirtConfiguratorQuoteDescription({ tshirtColor }),
          quantity: qty,
          priceHT: totalUnitHT,
          sku: "TSHIRT-CFG",
          category: "T-shirt",
          taille: garmentSize,
          couleur: tshirtColor,
          emplacementMarquage: markingZones,
          technique: techniqueSummary,
        }),
      ],
    };

    const [zipBlob, pdfBlob] = await Promise.all([
      withTimeout(
        buildImpressionZipBlob(),
        CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
        "Export ZIP impression : délai dépassé (60 s)."
      ).catch((error) => {
        console.warn("[Devis] Export ZIP impression:", error);
        return null;
      }),
      withTimeout(
        buildWorkshopPdfBlob(),
        CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
        "Export PDF atelier : délai dépassé (60 s)."
      ).catch((error) => {
        console.warn("[Devis] Export PDF atelier:", error);
        return null;
      }),
    ]);

    return attachConfiguratorExportsToDraft(baseDraft, { zipBlob, pdfBlob });
  }

  function notifyQuoteAttachmentResult(draft) {
    const errors = draft?.attachmentErrors || [];
    if (errors.length) {
      showToast(formatConfiguratorAttachmentErrors(errors), "warning", 8000);
      return;
    }
    const count = draft?.attachments?.length || 0;
    if (count >= 2) {
      showToast("ZIP impression et PDF atelier prêts pour le devis.", "success");
    }
  }

  async function createQuoteFromProject() {
    if (quoteDraftBusy) return;
    setQuoteDraftBusy(true);
    try {
      const draft = await buildQuoteDraftFromProject();
      if (!draft) {
        showToast("Ajoutez au moins un logo ou texte avant de créer un devis.", "error");
        return;
      }
      notifyQuoteAttachmentResult(draft);
      setPendingQuoteDraft(draft);
      setLeadModalOpen(true);
    } catch (error) {
      console.error("Erreur préparation devis :", error);
      showToast("Impossible de préparer le devis. Réessayez.", "error");
    } finally {
      setQuoteDraftBusy(false);
    }
  }

  async function openAdminQuoteWithoutLead() {
    if (quoteDraftBusy) return;
    setQuoteDraftBusy(true);
    try {
      const draft = await buildQuoteDraftFromProject();
      if (!draft) {
        showToast("Ajoutez au moins un logo ou texte avant de créer un devis.", "error");
        return;
      }
      notifyQuoteAttachmentResult(draft);
      openQuoteFromCalculator(navigate, draft);
      const attachmentCount = draft.attachments?.length || 0;
      const hasErrors = (draft.attachmentErrors || []).length > 0;
      if (!hasErrors) {
        showToast(
          attachmentCount
            ? `Devis pré-rempli avec ${attachmentCount} fichier(s) export(s).`
            : "Devis pré-rempli (sans lead sur le tableau de bord).",
          "success"
        );
      }
    } catch (error) {
      console.error("Erreur Devis rapide :", error);
      showToast("Impossible d'ouvrir le devis rapide.", "error");
    } finally {
      setQuoteDraftBusy(false);
    }
  }

  async function submitPublicLeadAndQuote(event) {
    event.preventDefault();
    if (!pendingQuoteDraft) return;

    setLeadSubmitting(true);
    try {
      await submitPublicLead({
        email: leadEmail,
        phone: leadPhone,
        source: "configurateur-tshirt",
        metadata: {
          projectName: projectName.trim() || "T-shirt configuré",
          quantity: orderQuantity,
          color: tshirtColor,
          size: garmentSize,
        },
      });
      saveQuoteDraft(pendingQuoteDraft);
      setLeadModalOpen(false);
      setLeadEmail("");
      setLeadPhone("");

      if (isPublicConfigurator) {
        setQuoteSavedModal(true);
        showToast(
          "Merci ! Votre projet est enregistré. Ouvrez le CRM → Devis pour finaliser.",
          "success",
          7000
        );
      } else {
        openQuoteFromCalculator(navigate, pendingQuoteDraft);
        showToast(
          "Contact enregistré — devis pré-rempli. Le lead apparaît sur le tableau de bord.",
          "success"
        );
      }
      setPendingQuoteDraft(null);
    } catch (error) {
      showToast(error.message || "Impossible d'enregistrer votre contact.", "error");
    } finally {
      setLeadSubmitting(false);
    }
  }

  return (
    <section>
      {isPublicConfigurator ? (
        <div className="tshirt3d-public-banner">
          <div>
            <strong>Configurateur public AC Creation</strong>
            <p>Créez votre visuel, puis cliquez sur « Créer un devis ». Laissez votre email pour être recontacté.</p>
          </div>
          <a className="tshirt3d-public-crm-link" href={getCrmQuotesUrl()}>
            Ouvrir le CRM → Devis
          </a>
        </div>
      ) : null}

      {leadModalOpen ? (
        <div className="tshirt3d-quote-modal" role="dialog" aria-labelledby="tshirt-lead-modal-title">
          <div className="tshirt3d-quote-modal-card">
            <h3 id="tshirt-lead-modal-title">
              {isPublicConfigurator ? "Recevoir votre devis" : "Contact client"}
            </h3>
            <p>
              {isPublicConfigurator
                ? "Laissez votre email pour enregistrer le projet et être recontacté par AC Creation."
                : "Indiquez l'email du client pour créer un lead sur le tableau de bord et ouvrir le devis pré-rempli."}
            </p>
            <form className="tshirt3d-lead-form" onSubmit={submitPublicLeadAndQuote}>
              <label>
                Email *
                <input
                  type="email"
                  required
                  value={leadEmail}
                  onChange={(event) => setLeadEmail(event.target.value)}
                  placeholder="vous@exemple.com"
                  data-testid="public-lead-email"
                />
              </label>
              <label>
                Téléphone (optionnel)
                <input
                  type="tel"
                  value={leadPhone}
                  onChange={(event) => setLeadPhone(event.target.value)}
                  placeholder="+352 …"
                />
              </label>
              <div className="tshirt3d-quote-modal-actions">
                <button type="submit" className="primary" disabled={leadSubmitting}>
                  {leadSubmitting
                    ? "Envoi…"
                    : isPublicConfigurator
                      ? "Enregistrer mon projet"
                      : "Enregistrer et ouvrir le devis"}
                </button>
                <button type="button" onClick={() => setLeadModalOpen(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {quoteSavedModal ? (
        <div className="tshirt3d-quote-modal" role="dialog" aria-labelledby="tshirt-quote-modal-title">
          <div className="tshirt3d-quote-modal-card">
            <h3 id="tshirt-quote-modal-title">Projet prêt pour le devis</h3>
            <p>
              Le configurateur a enregistré votre projet dans ce navigateur. Connectez-vous au CRM
              sur la page <strong>Devis</strong> pour retrouver les lignes pré-remplies.
            </p>
            <p className="muted">Utilisez le même navigateur (Chrome, Edge, etc.) que celui-ci.</p>
            <div className="tshirt3d-quote-modal-actions">
              <a className="primary" href={getCrmQuotesUrl()}>
                Ouvrir AC Creation CRM → Devis
              </a>
              <button type="button" onClick={() => setQuoteSavedModal(false)}>
                Continuer le design
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-header">
        <div>
          <h2>👕 T-shirt 3D</h2>
          <p>Multi logos, textes, manches et polices personnalisées.</p>
        </div>
        <div className="tshirt3d-export-actions">
          {!isPublicConfigurator ? (
            <button
              type="button"
              className="primary"
              onClick={openAdminQuoteWithoutLead}
              disabled={quoteDraftBusy}
            >
              {quoteDraftBusy ? "Préparation…" : "Devis rapide"}
            </button>
          ) : null}
          <button type="button" onClick={createQuoteFromProject} disabled={quoteDraftBusy}>
            {quoteDraftBusy ? "Préparation du devis…" : isPublicConfigurator ? "Recevoir mon devis" : "Devis + lead client"}
          </button>
          <button className="primary" onClick={exportMockup}>Exporter ZIP impression</button>
          <button type="button" onClick={exportWorkshopPdf}>Exporter PDF atelier</button>
        </div>
      </div>

      <div className="tshirt3d-layout">
        <div className="card tshirt3d-preview-card">
          <div className="tshirt3d-preview" ref={previewRef}>
            <Product3DErrorBoundary
              resetKey={productConfig.modelUrl}
              title="Aperçu 3D indisponible"
              message="Impossible de charger le modèle du t-shirt. Rechargez la page (Ctrl+F5) ou relancez l'application après un rebuild."
            >
              <Canvas shadows camera={{ position: [0, 0.35, 3.2], fov: 42 }} gl={{ preserveDrawingBuffer: true }}>
                <ambientLight intensity={0.9} />
                <directionalLight position={[2, 3, 4]} intensity={1.8} castShadow />
                <Suspense fallback={null}>
                  <Bounds fit clip observe margin={1.15}>
                    <Center>
                      <TshirtModel
                        texture={printTexture}
                        garmentScale={garmentPreset.scale}
                        modelUrl={productConfig.modelUrl}
                        garmentColor={productConfig.baseTextureUrl ? tshirtColor : "#ffffff"}
                      />
                    </Center>
                  </Bounds>
                  <Environment preset="studio" />
                </Suspense>
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
              </Canvas>
            </Product3DErrorBoundary>
            <div className="tshirt3d-hint">Souris : tourner · molette : zoom</div>
          </div>
        </div>

        <div className="card tshirt3d-editor-card">
          <h3>Personnalisation</h3>

          {/* ── Sélecteur de produit ── */}
          <div className="tshirt3d-product-selector">
            <label>Produit</label>
            <div className="tshirt3d-product-buttons">
              {PRODUCT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`tshirt3d-product-btn${selectedProduct === opt.value ? " active" : ""}`}
                  onClick={() => {
                    if (opt.value === selectedProduct) return;
                    if (items.length > 0) {
                      const confirmed = window.confirm(
                        `Changer de produit effacera la personnalisation en cours. Continuer ?`
                      );
                      if (!confirmed) return;
                      setItems([]);
                    }
                    setSelectedProduct(opt.value);
                    setPrintZoneSizes(getProductConfig(opt.value).printZoneSizesCm);
                    setGarmentSize("M");
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tshirt3d-form-grid">
            <label>
              Couleur textile
              <input type="color" value={tshirtColor} onChange={(e) => setTshirtColor(e.target.value)} />
            </label>
            <label>
              Zone à modifier
              <select value={activeArea} onChange={(e) => { setActiveArea(e.target.value); setSelectedId(null); }}>
                {Object.entries(PRINT_ZONES).map(([key, zone]) => <option key={key} value={key}>{zone.label}</option>)}
              </select>
            </label>
            <label>
              Format zone
              <select defaultValue="" onChange={applyPrintPreset}>
                <option value="" disabled>Choisir A4 / A3 / DTF</option>
                {PRINT_SIZE_PRESETS.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}
              </select>
            </label>
            <label>
              Technique par défaut
              <select value={defaultTechnique} onChange={(e) => setDefaultTechnique(e.target.value)}>
                {TECHNIQUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Taille vêtement
              <select value={garmentSize} onChange={(e) => setGarmentSize(e.target.value)}>
                {GARMENT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{GARMENT_SIZE_PRESETS[size].label}</option>)}
              </select>
            </label>
          </div>

          <div className="tshirt3d-size-panel">
            <div className="tshirt3d-size-header">
              <strong>Taille vêtement : {garmentPreset.label}</strong>
              <span>Largeur poitrine env. {garmentPreset.chest} cm · hauteur env. {garmentPreset.length} cm</span>
            </div>
            <div className="tshirt3d-size-scale">
              {GARMENT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={size === garmentSize ? "active" : ""}
                  onClick={() => setGarmentSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="muted">{garmentPreset.note} Les dimensions d’impression restent celles définies en cm : seul l’aperçu 3D change pour visualiser les proportions.</p>
          </div>

          <div
            className="tshirt3d-zone-editor"
            ref={editorRef}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPointer}
            onPointerCancel={stopPointer}
            onPointerLeave={stopPointer}
            onPointerDown={() => setSelectedId(null)}
          >
            <div className="tshirt3d-ruler tshirt3d-ruler-x">
              {rulerXTicks.map((tick) => <span key={`x-${tick.value}`} style={{ left: `${tick.percent}%` }}>{formatCm(tick.value)}</span>)}
            </div>
            <div className="tshirt3d-ruler tshirt3d-ruler-y">
              {rulerYTicks.map((tick) => <span key={`y-${tick.value}`} style={{ top: `${tick.percent}%` }}>{formatCm(tick.value)}</span>)}
            </div>
            <div className="tshirt3d-ruler-label">cm</div>
            {snapEnabled && snapGuides.x.map((guide) => (
              <div
                key={`snap-x-${guide.label}`}
                className={`tshirt3d-snap-line tshirt3d-snap-line-x ${snapPreview?.x?.value === guide.value ? "active" : ""}`}
                style={{ left: `${(EDITOR_PRINT_INSET + guide.value * EDITOR_PRINT_SIZE) * 100}%` }}
              >
                <span>{guide.label}</span>
              </div>
            ))}
            {snapEnabled && snapGuides.y.map((guide) => (
              <div
                key={`snap-y-${guide.label}`}
                className={`tshirt3d-snap-line tshirt3d-snap-line-y ${snapPreview?.y?.value === guide.value ? "active" : ""}`}
                style={{ top: `${(EDITOR_PRINT_INSET + guide.value * EDITOR_PRINT_SIZE) * 100}%` }}
              >
                <span>{guide.label}</span>
              </div>
            ))}
            {showPrintZone && <div className={`tshirt3d-zone-border area-${activeArea}`} />}
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className={`tshirt3d-design technique-${item.technique || "dtf"} ${item.id === selectedId ? "selected" : ""} ${item.locked ? "locked" : ""}`}
                onPointerDown={(event) => startMove(event, item.id)}
                style={{
                  left: `${(EDITOR_PRINT_INSET + item.x * EDITOR_PRINT_SIZE) * 100}%`,
                  top: `${(EDITOR_PRINT_INSET + item.y * EDITOR_PRINT_SIZE) * 100}%`,
                  width: `${item.width * EDITOR_PRINT_SIZE * 100}%`,
                  height: `${(item.height || 0.16) * EDITOR_PRINT_SIZE * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
                }}
              >
                {item.type === "image" ? (
                  <img src={item.src} alt={item.fileName || "Logo"} />
                ) : (
                  <svg
                    className="tshirt3d-text-svg"
                    viewBox="0 0 1000 240"
                    preserveAspectRatio="none"
                    aria-label={item.text || "Texte"}
                  >
                    {item.shadowEnabled && (
                      <defs>
                        <filter id={`text-shadow-${item.id}`} x="-30%" y="-60%" width="160%" height="220%">
                          <feDropShadow
                            dx={Number(item.shadowOffsetX || 0)}
                            dy={Number(item.shadowOffsetY || 0)}
                            stdDeviation={Math.max(0, Number(item.shadowBlur || 0)) / 3}
                            floodColor={item.shadowColor || "#000000"}
                            floodOpacity="0.85"
                          />
                        </filter>
                      </defs>
                    )}
                    {Math.abs(Number(item.curve || 0)) > 2 ? (
                      <>
                        <defs>
                          <path
                            id={`text-curve-${item.id}`}
                            d={`M 80 120 Q 500 ${120 - Number(item.curve || 0) * 1.05} 920 120`}
                          />
                        </defs>
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={item.textColor || "#111827"}
                          stroke={item.strokeEnabled ? item.strokeColor || "#000000" : "none"}
                          strokeWidth={item.strokeEnabled ? Number(item.strokeWidth || 2) : 0}
                          paintOrder="stroke"
                          strokeLinejoin="round"
                          fontFamily={item.fontFamily || "Arial"}
                          fontWeight="900"
                          fontSize="145"
                          filter={item.shadowEnabled ? `url(#text-shadow-${item.id})` : undefined}
                        >
                          <textPath href={`#text-curve-${item.id}`} startOffset="50%">
                            {item.text || "Texte"}
                          </textPath>
                        </text>
                      </>
                    ) : (
                      <text
                        x="500"
                        y="120"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={item.textColor || "#111827"}
                        stroke={item.strokeEnabled ? item.strokeColor || "#000000" : "none"}
                        strokeWidth={item.strokeEnabled ? Number(item.strokeWidth || 2) : 0}
                        paintOrder="stroke"
                        strokeLinejoin="round"
                        fontFamily={item.fontFamily || "Arial"}
                        fontWeight="900"
                        fontSize="165"
                        textLength="900"
                        lengthAdjust="spacingAndGlyphs"
                        filter={item.shadowEnabled ? `url(#text-shadow-${item.id})` : undefined}
                      >
                        {item.text || "Texte"}
                      </text>
                    )}
                  </svg>
                )}
                <button className="tshirt3d-resize-handle left" onPointerDown={(event) => startResize(event, item.id, "left")} title="Étirer gauche / largeur" />
                <button className="tshirt3d-resize-handle right" onPointerDown={(event) => startResize(event, item.id, "right")} title="Étirer droite / largeur" />
                <button className="tshirt3d-resize-handle top" onPointerDown={(event) => startResize(event, item.id, "top")} title="Étirer haut / hauteur" />
                <button className="tshirt3d-resize-handle bottom" onPointerDown={(event) => startResize(event, item.id, "bottom")} title="Étirer bas / hauteur" />
                <button className="tshirt3d-resize-handle both" onPointerDown={(event) => startResize(event, item.id, "both")} title="Largeur + hauteur" />
              </div>
            ))}
          </div>

          <div className="tshirt3d-real-size-panel">
            <strong>Zone réelle : {PRINT_ZONES[activeArea]?.label} — {formatCm(activeZoneSize.width)} × {formatCm(activeZoneSize.height)} cm</strong>
            <div className="tshirt3d-real-size-fields">
              <label>
  Largeur zone (cm)
  <input
    type="number"
    value={activeZoneSize.width}
    readOnly
    disabled
  />
</label>

<label>
  Hauteur zone (cm)
  <input
    type="number"
    value={activeZoneSize.height}
    readOnly
    disabled
  />
</label>
            </div>
          </div>

          <div className="tshirt3d-toolbar">
            <label className="tshirt3d-upload-button">
              Ajouter logo(s)
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
            </label>
            <button onClick={addText}>Ajouter un texte</button>
            <label className="tshirt3d-upload-button secondary">
              Importer police
              <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} />
            </label>
            <button disabled={!selectedItem} onClick={duplicateSelected}>Dupliquer</button>
            <button className="danger" disabled={!selectedItem || selectedItem.locked} onClick={deleteSelected}>Supprimer</button>
          </div>

          <div className="tshirt3d-align-tools">
            <label className="tshirt3d-checkbox compact">
              <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
              Aimants d’alignement
            </label>
            <span>Repères : centre, poitrine, col et centre manche.</span>
          </div>

          <div className="tshirt3d-layers-panel">
            <div className="tshirt3d-layers-header">
              <strong>Calques</strong>
              <span>{layerItems.length} élément{layerItems.length > 1 ? "s" : ""} dans {PRINT_ZONES[activeArea]?.label}</span>
            </div>
            {layerItems.length ? (
              <div className="tshirt3d-layers-list">
                {layerItems.map((item) => (
                  <div
                    key={item.id}
                    className={`tshirt3d-layer-row ${item.id === selectedId ? "active" : ""} ${item.hidden ? "is-hidden" : ""} ${item.locked ? "is-locked" : ""}`}
                  >
                    <button
                      type="button"
                      className="tshirt3d-layer-select"
                      onClick={() => { if (!item.hidden) setSelectedId(item.id); }}
                      title="Sélectionner le calque"
                    >
                      <span className="tshirt3d-layer-type">{item.type === "image" ? "🖼️" : "T"}</span>
                    </button>
                    <span className="tshirt3d-layer-tech">{getTechniquePreset(item).shortLabel}</span>
                    <input
                      className="tshirt3d-layer-name"
                      value={defaultLayerName(item)}
                      onChange={(e) => renameLayer(item.id, e.target.value)}
                      title="Renommer le calque"
                    />
                    <button type="button" onClick={() => toggleLayerHidden(item.id)} title={item.hidden ? "Afficher" : "Masquer"}>
                      {item.hidden ? "🙈" : "👁"}
                    </button>
                    <button type="button" onClick={() => toggleLayerLocked(item.id)} title={item.locked ? "Déverrouiller" : "Verrouiller"}>
                      {item.locked ? "🔒" : "🔓"}
                    </button>
                    <button type="button" onClick={() => moveLayer(item.id, "up")} title="Monter le calque">↑</button>
                    <button type="button" onClick={() => moveLayer(item.id, "down")} title="Descendre le calque">↓</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucun calque dans cette zone.</p>
            )}
          </div>

          <div className="tshirt3d-project-panel">
            <div className="tshirt3d-project-header">
              <strong>Sauvegarde projet client</strong>
              <span>{savedProjects.length} sauvegarde{savedProjects.length > 1 ? "s" : ""}</span>
            </div>
            <div className="tshirt3d-project-controls">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Nom client / commande"
              />
              <label className="tshirt3d-qty-field">
                Qté
                <input
                  type="number"
                  min="1"
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(e.target.value)}
                />
              </label>
              <button type="button" onClick={saveCurrentProject}>Sauvegarder</button>
              <button type="button" onClick={exportProjectJson}>Exporter projet</button>
              <label className="tshirt3d-project-import">
                Importer projet
                <input type="file" accept="application/json,.json" onChange={importProjectJson} />
              </label>
            </div>
            {savedProjects.length ? (
              <div className="tshirt3d-project-list">
                {savedProjects.map((project) => (
                  <div key={project.id} className="tshirt3d-project-row">
                    <div>
                      <strong>{project.name}</strong>
                      <small>{new Date(project.savedAt).toLocaleString("fr-FR")}</small>
                    </div>
                    <button type="button" onClick={() => loadProject(project.id)}>Reprendre</button>
                    <button type="button" className="danger" onClick={() => deleteProject(project.id)}>Supprimer</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucun projet sauvegardé pour le moment.</p>
            )}
          </div>

          <div className="tshirt3d-tech-panel">
            <strong>Zones techniques atelier</strong>
            <div className="tshirt3d-tech-grid">
              {Object.entries(TECHNIQUE_PRESETS).map(([key, preset]) => (
                <div key={key} className={`tshirt3d-tech-card technique-${key}`}>
                  <span className="tshirt3d-tech-badge">{preset.label}</span>
                  <p>{preset.help}</p>
                  <small>Minimum : {formatCm(preset.minWidth)} × {formatCm(preset.minHeight)} cm{preset.maxWidth ? ` · Max conseillé : ${formatCm(preset.maxWidth)} × ${formatCm(preset.maxHeight)} cm` : ""}</small>
                  <em>{preset.note}</em>
                </div>
              ))}
            </div>
          </div>

          {selectedItem ? (
            <div className="tshirt3d-selected-panel">
              <strong>Élément sélectionné : {defaultLayerName(selectedItem)} {selectedItem.locked ? "— verrouillé" : ""}</strong>
              {selectedTechnique && (
                <div className="tshirt3d-tech-selected">
                  <label>
                    Technique atelier
                    <select value={selectedItem.technique || "dtf"} onChange={(e) => updateItem(selectedItem.id, { technique: e.target.value })}>
                      {TECHNIQUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <p>{selectedTechnique.help}</p>
                  <small>{selectedTechnique.note}</small>
                  {selectedTechniqueWarnings.length > 0 && (
                    <div className="tshirt3d-tech-warnings">
                      {selectedTechniqueWarnings.map((warning) => <div key={warning}>⚠️ {warning}</div>)}
                    </div>
                  )}
                </div>
              )}
              {selectedItem.type === "text" && (
                <div className="tshirt3d-form-grid">
                  <label>Texte<input value={selectedItem.text || ""} onChange={(e) => {
                    const nextText = e.target.value;
                    updateItem(selectedItem.id, withAutoTextWidth({ ...selectedItem, text: nextText }, printZoneSizes));
                  }} /></label>
                  <label>Couleur<input type="color" value={selectedItem.textColor || "#111827"} onChange={(e) => updateItem(selectedItem.id, { textColor: e.target.value })} /></label>
                  <label>Police
                    <select value={selectedItem.fontFamily || "Arial"} onChange={(e) => {
                      const nextFontFamily = e.target.value;
                      updateItem(selectedItem.id, withAutoTextWidth({ ...selectedItem, fontFamily: nextFontFamily }, printZoneSizes));
                    }}>
                      <option value="Arial">Arial</option>
                      <option value="Impact">Impact</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Verdana">Verdana</option>
                      {customFonts.map((font) => <option key={font.name} value={font.name}>{font.name}</option>)}
                    </select>
                  </label>
                  <label>Courbure
                    <input type="range" min="-100" max="100" step="1" value={selectedItem.curve || 0} onChange={(e) => updateItem(selectedItem.id, { curve: Number(e.target.value) })} />
                  </label>
                  <label className="tshirt3d-checkbox compact">
                    <input type="checkbox" checked={selectedItem.strokeEnabled || false} onChange={(e) => updateItem(selectedItem.id, { strokeEnabled: e.target.checked })} />
                    Contour texte
                  </label>
                  {selectedItem.strokeEnabled && (
                    <>
                      <label>Couleur contour<input type="color" value={selectedItem.strokeColor || "#000000"} onChange={(e) => updateItem(selectedItem.id, { strokeColor: e.target.value })} /></label>
                      <label>Épaisseur contour<input type="range" min="1" max="20" step="1" value={selectedItem.strokeWidth || 2} onChange={(e) => updateItem(selectedItem.id, { strokeWidth: Number(e.target.value) })} /></label>
                    </>
                  )}
                  <label className="tshirt3d-checkbox compact">
                    <input type="checkbox" checked={selectedItem.shadowEnabled || false} onChange={(e) => updateItem(selectedItem.id, { shadowEnabled: e.target.checked })} />
                    Ombre texte
                  </label>
                  {selectedItem.shadowEnabled && (
                    <>
                      <label>Couleur ombre<input type="color" value={selectedItem.shadowColor || "#000000"} onChange={(e) => updateItem(selectedItem.id, { shadowColor: e.target.value })} /></label>
                      <label>Flou ombre<input type="range" min="0" max="30" step="1" value={selectedItem.shadowBlur || 8} onChange={(e) => updateItem(selectedItem.id, { shadowBlur: Number(e.target.value) })} /></label>
                      <label>Décalage X<input type="range" min="-30" max="30" step="1" value={selectedItem.shadowOffsetX || 4} onChange={(e) => updateItem(selectedItem.id, { shadowOffsetX: Number(e.target.value) })} /></label>
                      <label>Décalage Y<input type="range" min="-30" max="30" step="1" value={selectedItem.shadowOffsetY || 4} onChange={(e) => updateItem(selectedItem.id, { shadowOffsetY: Number(e.target.value) })} /></label>
                    </>
                  )}
                </div>
              )}
              {selectedPrintSize && (
                <div className="tshirt3d-selected-size-box">
                  <strong>Taille réelle impression : {formatCm(selectedPrintSize.width)} × {formatCm(selectedPrintSize.height)} cm</strong>
                  <p className="muted">Largeur max autorisée : {formatCm(Math.min(MAX_PRINT_WIDTH_CM, getZoneSizeCm(printZoneSizes, selectedItem.area).width))} cm. L’élément reste dans la zone pointillée.</p>
                  <div className="tshirt3d-real-size-fields">
                    <label>Largeur élément (cm)<input type="number" min="0.1" step="0.1" value={Number(selectedPrintSize.width.toFixed(1))} onChange={(e) => updateSelectedRealSize({ width: Number(e.target.value) })} /></label>
                    <label>Hauteur élément (cm)<input type="number" min="0.1" step="0.1" value={Number(selectedPrintSize.height.toFixed(1))} onChange={(e) => updateSelectedRealSize({ height: Number(e.target.value) })} /></label>
                  </div>
                </div>
              )}
              <div className="tshirt3d-controls">
                <label>Largeur<input type="range" min="0.035" max={getMaxItemWidthScale(selectedItem.area, printZoneSizes)} step="0.005" value={selectedItem.width} onChange={(e) => updateItem(selectedItem.id, { width: Number(e.target.value) })} /></label>
                <label>Hauteur<input type="range" min="0.025" max="1" step="0.005" value={selectedItem.height || 0.16} onChange={(e) => updateItem(selectedItem.id, { height: Number(e.target.value) })} /></label>
                <label>Rotation<input type="range" min="-180" max="180" step="1" value={selectedItem.rotation || 0} onChange={(e) => updateItem(selectedItem.id, { rotation: Number(e.target.value) })} /></label>
                <label>Déplacer vers
                  <select value={selectedItem.area} onChange={(e) => { updateItem(selectedItem.id, { area: e.target.value, x: 0.5, y: 0.38 }); setActiveArea(e.target.value); }}>
                    {Object.entries(PRINT_ZONES).map(([key, zone]) => <option key={key} value={key}>{zone.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <p className="muted">Clique sur un logo ou un texte pour le déplacer, le redimensionner, le tourner ou le modifier.</p>
          )}

          <label className="tshirt3d-checkbox">
            <input type="checkbox" checked={showPrintZone} onChange={(e) => setShowPrintZone(e.target.checked)} />
            Afficher la zone d'impression dans l'éditeur
          </label>
        </div>
      </div>
    </section>
  );
}

// Précharger les deux modèles au démarrage pour éviter le lag au switch
useGLTF.preload(PRODUCT_CONFIGS.tshirt.modelUrl);
useGLTF.preload(PRODUCT_CONFIGS.polo.modelUrl);
