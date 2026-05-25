import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import DocumentPreview from "./DocumentPreview";
import DocumentForm from "./documents/DocumentForm";
import DocumentList from "./documents/DocumentList";
import PaginationControls from "./PaginationControls";
import { money } from "../utils/money";
import {
  clientName,
  dedupeDocuments,
  nextDocumentNumber,
  convertQuoteToInvoiceData,
  isQuoteConvertible,
  createDeliveryNoteFromQuote,
  getDeliveryNoteForQuote,
  createDepositInvoiceFromQuote,
  createBalanceInvoiceFromQuote,
  getQuoteDepositSummary,
  quoteRequiresDepositFlow,
  computeDepositTotals,
  enrichInvoicePaymentFields,
  uid,
  today,
} from "../utils/documents";
import { applyStockByLines, syncDocumentStock, syncQuoteProductionStock } from "../utils/stock";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
  applyPartialPayment,
  getInvoiceRemaining,
  DEPOSIT_PRESETS,
} from "../utils/invoices";
import { computeDueDate, openInvoiceReminderMailto } from "../utils/invoiceReminders";
import { consumeQuoteDraft } from "../utils/quoteDraft";
import { PRODUCTION_STATUSES } from "../utils/production";
import { fromDateInputValue, toDateInputValue } from "../utils/quoteDelivery";
import { exportInvoicesCsv } from "../utils/exportCsv";
import {
  formatTrackingDate,
  getStaleDraftQuotes,
  markDocumentReminder,
  markDocumentSent,
} from "../utils/documentTracking";
import { showToast } from "../utils/toast";
import { canDeleteData } from "../services/authService";

function Documents({ type, data, setData, currentRole = 'Admin', logActivity }) {
  const location = useLocation();
  const isQuote = type === "quote";
  const listKey = isQuote ? "quotes" : "invoices";
  const title = isQuote ? "Devis" : "Factures";
  const prefix = isQuote ? "DEV" : "FAC";
  const defaultStatus = isQuote ? "Brouillon" : "Non payée";

  const emptyLine = {
    productId: "",
    sku: "",
    description: "",
    quantity: 1,
    price: 0,
    discount: 0,
    taille: "",
    couleur: "",
    emplacementMarquage: "",
    technique: "",
  };
  const [editingId, setEditingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewType, setPreviewType] = useState(type);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("dateDesc");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const prefilledClientId =
  localStorage.getItem(
    "crm_prefill_client_id"
  ) || "";
const [form, setForm] = useState({
  clientId: prefilledClientId,
  status: defaultStatus,
  globalDiscount: 0,
  depositPercent: 0,
  promisedDeliveryDateInput: "",
  processType: "",
  assignedTo: "",
  atelierNotes: "",
  priority: "normal",
  lines: [{ ...emptyLine }],
});
  const [attachments, setAttachments] = useState([]);

  const itemsPerPage = 25;
  const documents = data[listKey] || [];

  useEffect(() => {
    if (!isQuote) return;
    const draft = location.state?.quoteDraft || consumeQuoteDraft();
    if (!draft?.lines?.length) return;

    if (location.state?.quoteDraft) {
      window.history.replaceState({}, document.title);
    }

    setEditingId(null);
    setAttachments([]);
    setForm({
      clientId: draft.clientId || prefilledClientId || "",
      status: "Brouillon",
      globalDiscount: 0,
      depositPercent: 0,
      promisedDeliveryDateInput: "",
      processType: "",
      assignedTo: "",
      atelierNotes: "",
      priority: "normal",
      lines: draft.lines.map((line) => ({
        productId: line.productId || "",
        sku: line.sku || "",
        category: line.category || "",
        categoryId: line.categoryId || "",
        description: line.description || "",
        quantity: Number(line.quantity || 1),
        price: Number(line.price || 0),
        discount: Number(line.discount || 0),
        taille: line.taille || "",
        couleur: line.couleur || "",
        emplacementMarquage: line.emplacementMarquage || "",
        technique: line.technique || "",
      })),
    });
    showToast(
      draft.source
        ? `Devis pré-rempli depuis ${draft.source}.`
        : "Devis pré-rempli.",
      "success"
    );
  }, [isQuote, location.key]);

  useEffect(() => {
    if (isQuote) return;
    if (localStorage.getItem(INVOICES_FILTER_KEY) !== "overdue") return;
    localStorage.removeItem(INVOICES_FILTER_KEY);
    setOverdueOnly(true);
    setCurrentPage(1);
  }, [isQuote]);

  const sortedDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = [...documents].filter((doc) => {
      if (overdueOnly && !isQuote && !isInvoiceOverdue(doc)) return false;

      if (!query) return true;

      const client = clientName(data, doc.clientId).toLowerCase();
      const number = String(doc.number || "").toLowerCase();
      const total = money(doc.totalTTC).toLowerCase();
      const totalRaw = String(doc.totalTTC ?? "");

      return (
        number.includes(query) ||
        client.includes(query) ||
        total.includes(query) ||
        totalRaw.includes(query)
      );
    });

    function numberValue(doc) {
      return Number(String(doc.number || "").replace(/[^0-9]/g, "")) || 0;
    }

    function dateValue(doc) {
      const value = String(doc.date || "");
      const parts = value.split("/");
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
      }
      return new Date(value || 0).getTime() || 0;
    }

    return list.sort((a, b) => {
      if (sortBy === "numberAsc") return numberValue(a) - numberValue(b);
      if (sortBy === "numberDesc") return numberValue(b) - numberValue(a);
      if (sortBy === "dateAsc") return dateValue(a) - dateValue(b);
      if (sortBy === "dateDesc") return dateValue(b) - dateValue(a);
      if (sortBy === "clientAsc") return clientName(data, a.clientId).localeCompare(clientName(data, b.clientId));
      if (sortBy === "clientDesc") return clientName(data, b.clientId).localeCompare(clientName(data, a.clientId));
      if (sortBy === "totalAsc") return Number(a.totalTTC || 0) - Number(b.totalTTC || 0);
      if (sortBy === "totalDesc") return Number(b.totalTTC || 0) - Number(a.totalTTC || 0);
      if (sortBy === "statusAsc") return String(a.status || "").localeCompare(String(b.status || ""));
      if (sortBy === "statusDesc") return String(b.status || "").localeCompare(String(a.status || ""));
      return 0;
    });
  }, [documents, sortBy, data, overdueOnly, isQuote, search]);

  const documentTotalPages = Math.max(1, Math.ceil(sortedDocuments.length / itemsPerPage));
  const documentPage = Math.min(currentPage, documentTotalPages);
  const paginatedDocuments = sortedDocuments.slice((documentPage - 1) * itemsPerPage, documentPage * itemsPerPage);

  const stats = useMemo(() => {
    const totalTTC = documents.reduce((sum, doc) => sum + Number(doc.totalTTC || 0), 0);

    if (isQuote) {
      const pending = documents.filter(
        (doc) => doc.status === "Brouillon" || doc.status === "Envoyé"
      ).length;
      const staleDrafts = getStaleDraftQuotes(documents).length;
      const accepted = documents.filter((doc) => doc.status === "Accepté").length;
      const inProduction = documents.filter((doc) =>
        PRODUCTION_STATUSES.includes(doc.status)
      ).length;
      const convertible = documents.filter((doc) => isQuoteConvertible(data, doc)).length;
      return { count: documents.length, totalTTC, pending, staleDrafts, accepted, inProduction, convertible };
    }

    const overdueDocs = documents.filter((doc) => isInvoiceOverdue(doc));
    const overdueTotal = overdueDocs.reduce((sum, doc) => sum + Number(doc.totalTTC || 0), 0);
    const unpaid = documents.filter(
      (doc) => doc.status === "Non payée" || doc.status === "En retard"
    ).length;

    return {
      count: documents.length,
      totalTTC,
      overdueCount: overdueDocs.length,
      overdueTotal,
      unpaid,
    };
  }, [documents, isQuote, data]);

  function lineTotal(line) {
    const subtotal = Number(line.quantity || 0) * Number(line.price || 0);
    return { subtotal, totalHT: subtotal };
  }

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => sum + lineTotal(line).subtotal, 0);
    const globalDiscountRate = Math.min(100, Math.max(0, Number(form.globalDiscount || 0)));
    const globalDiscountAmount = subtotal * (globalDiscountRate / 100);
    const totalHT = Math.max(0, subtotal - globalDiscountAmount);
    const taxAmount = totalHT * (Number(data.settings.taxRate || 0) / 100);
    const totalTTC = totalHT + taxAmount;
    const deposit = computeDepositTotals(totalTTC, form.depositPercent);
    return {
      subtotal,
      globalDiscountRate,
      globalDiscountAmount,
      totalHT,
      taxAmount,
      totalTTC,
      ...deposit,
    };
  }, [form.lines, form.globalDiscount, form.depositPercent, data.settings.taxRate]);

  function updateLine(index, changes) {
    setForm({
      ...form,
      lines: (form.lines || []).map((line, i) => (i === index ? { ...line, ...changes } : line)),
    });
  }

  function selectProduct(index, productId) {
    const product = (data.products || []).find((p) => String(p.id) === String(productId));

    if (!product) {
      updateLine(index, {
        productId: "",
        sku: "",
        category: "",
        categoryId: "",
        description: "",
        price: 0,
      });
      return;
    }

    updateLine(index, {
      productId: product.id,
      sku: product.sku || "",
      category: product.category || "Sans catégorie",
      categoryId: product.categoryId || "",
      description: product.description || product.name || "",
      price: Number(product.price || 0),
    });
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  }

  function removeLine(index) {
    if (form.lines.length === 1) return showToast("Il faut au moins une ligne.", "error");
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  }

  function reset() {
    setEditingId(null);
    setAttachments([]);
    setForm({
      clientId: "",
      status: defaultStatus,
      globalDiscount: 0,
      depositPercent: 0,
      promisedDeliveryDateInput: "",
      processType: "",
      assignedTo: "",
      atelierNotes: "",
      priority: "normal",
      lines: [{ ...emptyLine }],
    });
  }

  function quoteFormExtras() {
    return {
      processType: form.processType || "",
      assignedTo: form.assignedTo || "",
      atelierNotes: String(form.atelierNotes || "").trim(),
      priority: form.priority || "normal",
    };
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId && (!isQuote || form.status !== "Brouillon")) {
      return showToast("Choisis un client.", "error");
    }

    const cleanLines = form.lines
      .map((line) => {
        const product = (data.products || []).find((p) => String(p.id) === String(line.productId));
        return {
          ...line,
          productId: product?.id || line.productId || "",
          sku: product?.sku || line.sku || "",
          category: product?.category || line.category || "Sans catégorie",
          categoryId: product?.categoryId || line.categoryId || "",
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
          discount: 0,
          ...(isQuote && {
            taille: String(line.taille || "").trim(),
            couleur: String(line.couleur || "").trim(),
            emplacementMarquage: String(line.emplacementMarquage || "").trim(),
            technique: String(line.technique || "").trim(),
          }),
          ...lineTotal(line),
        };
      })
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0) return showToast("Ajoute au moins un produit ou une prestation.", "error");

    const firstDescription = cleanLines.length === 1 ? cleanLines[0].description : `${cleanLines.length} lignes`;
    const promisedDeliveryDate = isQuote
      ? fromDateInputValue(form.promisedDeliveryDateInput)
      : "";
    const quoteExtras = isQuote
      ? {
          promisedDeliveryDate,
          attachments: attachments || [],
          ...quoteFormExtras(),
        }
      : {};

    if (editingId) {
      const existingDoc = documents.find((d) => d.id === editingId);
      const updatedDoc = enrichInvoicePaymentFields({
        ...existingDoc,
        clientId: form.clientId,
        status: form.status,
        globalDiscount: Number(form.globalDiscount || 0),
        depositPercent: totals.depositPercent,
        depositAmount: totals.depositAmount,
        balanceAfterDeposit: totals.balanceAfterDeposit,
        description: firstDescription,
        lines: cleanLines,
        taxRate: data.settings.taxRate,
        stockAdjusted: !isQuote && form.status !== "Annulée",
        ...quoteExtras,
        ...totals,
      });

      const stockSync = isQuote
        ? syncQuoteProductionStock(
            data.products || [],
            existingDoc,
            updatedDoc,
            { user: currentRole }
          )
        : null;

      const nextProducts = isQuote
        ? stockSync.products
        : syncDocumentStock(data.products || [], existingDoc, updatedDoc, {
            isQuote,
            user: currentRole,
          });

      const savedDoc = isQuote
        ? { ...updatedDoc, productionStockAdjusted: stockSync.productionStockAdjusted }
        : updatedDoc;

      setData({
        ...data,
        products: nextProducts,
        [listKey]: documents.map((d) =>
          d.id === editingId ? savedDoc : d
        ),
      });
      logActivity?.(`Modification ${isQuote ? "devis" : "facture"}`, existingDoc?.number || editingId, money(totals.totalTTC));
    } else {
      const doc = {
        id: uid(),
        number: nextDocumentNumber(documents, prefix),
        date: today(),
        taxRate: data.settings.taxRate,
        clientId: form.clientId,
        status: form.status,
        globalDiscount: Number(form.globalDiscount || 0),
        depositPercent: totals.depositPercent,
        depositAmount: totals.depositAmount,
        balanceAfterDeposit: totals.balanceAfterDeposit,
        description: firstDescription,
        lines: cleanLines,
        stockAdjusted: !isQuote && form.status !== "Annulée",
        ...quoteExtras,
        ...(!isQuote && {
          dueDate: computeDueDate(today(), data.settings.paymentDays),
          paidAmount: 0,
          remaining: totals.totalTTC,
        }),
        ...totals,
      };

      const quoteStockSync = isQuote
        ? syncQuoteProductionStock(data.products || [], null, doc, {
            user: currentRole,
          })
        : null;

      const nextProducts = !isQuote && doc.stockAdjusted
        ? applyStockByLines(data.products || [], cleanLines, "remove", {
            type: "invoice",
            reason: "Création facture",
            reference: doc.number,
            user: currentRole,
          })
        : isQuote
          ? quoteStockSync.products
          : data.products || [];

      const savedDoc = isQuote
        ? { ...doc, productionStockAdjusted: quoteStockSync.productionStockAdjusted }
        : doc;

      setData({ ...data, products: nextProducts, [listKey]: [...documents, savedDoc] });
      logActivity?.(`Création ${isQuote ? "devis" : "facture"}`, doc.number, money(doc.totalTTC));
    }

   localStorage.removeItem(
  "crm_prefill_client_id"
);

reset();
  }

  function edit(doc) {
    const lines = doc.lines?.length
      ? doc.lines.map((line) => ({
          productId: line.productId || "",
          sku: line.sku || "",
          category: line.category || "",
          categoryId: line.categoryId || "",
          description: line.description || "",
          quantity: Number(line.quantity || 1),
          price: Number(line.price || 0),
          discount: Number(line.discount || 0),
          taille: line.taille || "",
          couleur: line.couleur || "",
          emplacementMarquage: line.emplacementMarquage || "",
          technique: line.technique || "",
        }))
      : [
          {
            productId: doc.productId || "",
            description: doc.description || "",
            quantity: Number(doc.quantity || 1),
            price: Number(doc.price || 0),
            discount: Number(doc.discount || 0),
          },
        ];

    setEditingId(doc.id);
    setAttachments(doc.attachments || []);
    setForm({
      clientId: doc.clientId || "",
      status: doc.status || defaultStatus,
      globalDiscount: Number(doc.globalDiscount || 0),
      depositPercent: Number(doc.depositPercent || 0),
      promisedDeliveryDateInput: toDateInputValue(doc.promisedDeliveryDate),
      processType: doc.processType || "",
      assignedTo: doc.assignedTo || "",
      atelierNotes: doc.atelierNotes || "",
      priority: doc.priority || "normal",
      lines,
    });
  }

useEffect(() => {
  const openDocumentId = localStorage.getItem("crm_open_document_id");
  const openDocumentType = localStorage.getItem("crm_open_document_type");

  if (!openDocumentId) return;

  if (
    (openDocumentType === "quote" && !isQuote) ||
    (openDocumentType === "invoice" && isQuote)
  ) {
    return;
  }

  const doc = documents.find(
    (d) => String(d.id) === String(openDocumentId)
  );

  if (!doc) return;

  setPreviewDoc(doc);
  setPreviewType(openDocumentType === "quote" ? "quote" : "invoice");

  localStorage.removeItem("crm_open_document_id");
  localStorage.removeItem("crm_open_document_type");
}, []);
  function remove(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (!confirm(`Supprimer ce ${isQuote ? "devis" : "facture"} ?`)) return;
    const removedDoc = documents.find((d) => d.id === id);
    let nextProducts = data.products || [];

    if (!isQuote && removedDoc?.stockAdjusted) {
      nextProducts = applyStockByLines(nextProducts, removedDoc.lines || [], "add", {
        type: "invoice",
        reason: "Suppression facture",
        reference: removedDoc?.number || "",
        user: currentRole,
      });
    }

    if (isQuote && removedDoc?.productionStockAdjusted) {
      nextProducts = syncQuoteProductionStock(
        nextProducts,
        removedDoc,
        { ...removedDoc, status: "Accepté" },
        { user: currentRole }
      ).products;
    }

    setData({
      ...data,
      products: nextProducts,
      [listKey]: documents.filter((d) => d.id !== id),
    });
    logActivity?.(`Suppression ${isQuote ? "devis" : "facture"}`, removedDoc?.number || id);
  }

  function updateStatus(id, status) {
    const existingDoc = (data[listKey] || []).find((d) => String(d.id) === String(id));
    const updatedDoc = existingDoc
      ? { ...existingDoc, status, stockAdjusted: !isQuote && status !== "Annulée" }
      : null;

    let nextProducts = data.products || [];

    if (!isQuote && updatedDoc) {
      nextProducts = syncDocumentStock(nextProducts, existingDoc, updatedDoc, {
        isQuote,
        user: currentRole,
      });
    }

    if (isQuote && updatedDoc) {
      const stockSync = syncQuoteProductionStock(
        nextProducts,
        existingDoc,
        updatedDoc,
        { user: currentRole }
      );
      nextProducts = stockSync.products;
      updatedDoc.productionStockAdjusted = stockSync.productionStockAdjusted;
    }

    const nextDocuments = dedupeDocuments((data[listKey] || []).map((d) =>
      String(d.id) === String(id) && updatedDoc ? updatedDoc : d
    ));

    const changedDoc = nextDocuments.find((d) => String(d.id) === String(id));
    setData({
      ...data,
      products: nextProducts,
      [listKey]: nextDocuments,
    });
    logActivity?.(`Changement statut ${isQuote ? "devis" : "facture"}`, changedDoc?.number || id, status);
  }

  function sendInvoiceReminder(invoice) {
    const client = (data.clients || []).find((c) => c.id === invoice.clientId);
    const result = openInvoiceReminderMailto(invoice, client, data.settings || {});
    if (!result.ok) {
      showToast("Ce client n'a pas d'adresse email enregistrée.", "error");
      return;
    }

    const nextInvoices = documents.map((doc) =>
      String(doc.id) === String(invoice.id)
        ? markDocumentReminder(doc)
        : doc
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Relance facture", invoice.number, client?.name || "");
    showToast(`Relance préparée pour ${invoice.number}.`, "success");
  }

  function openPreview(doc, docType = isQuote ? "quote" : "invoice") {
    setPreviewDoc(doc);
    setPreviewType(docType);
  }

  function generateDeliveryNote(quote) {
    try {
      const deliveryInfo = window.prompt(
        "Informations de livraison (optionnel) :",
        getDeliveryNoteForQuote(data, quote)?.deliveryInfo || ""
      );
      if (deliveryInfo === null) return;

      const result = createDeliveryNoteFromQuote(data, quote, {
        deliveryInfo: deliveryInfo.trim(),
      });
      setData(result);
      logActivity?.(
        result.created ? "Création bon de livraison" : "Mise à jour bon de livraison",
        result.deliveryNote.number,
        quote.number
      );
      showToast(
        result.created
          ? `Bon de livraison ${result.deliveryNote.number} créé.`
          : `Bon de livraison ${result.deliveryNote.number} mis à jour.`,
        "success"
      );
      openPreview(result.deliveryNote, "delivery");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Impossible de générer le bon de livraison.", "error");
    }
  }

  function previewDeliveryNote(quote) {
    const note = getDeliveryNoteForQuote(data, quote);
    if (!note) {
      showToast("Aucun bon de livraison pour ce devis. Générez-le d'abord.", "info");
      return;
    }
    openPreview(note, "delivery");
  }

  function createBalanceInvoice(quote) {
    try {
      const result = createBalanceInvoiceFromQuote(data, quote);
      setData(result);
      logActivity?.(
        "Création facture de solde",
        result.invoice.number,
        quote.number
      );
      showToast(
        `Facture de solde ${result.invoice.number} créée (${money(result.invoice.totalTTC)}).`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showToast(error.message || "Impossible de créer la facture de solde.", "error");
    }
  }

  function createDepositInvoice(quote, percent) {
    try {
      const result = createDepositInvoiceFromQuote(data, quote, percent);
      setData(result);
      logActivity?.(
        "Création facture d'acompte",
        result.invoice.number,
        `${percent}% — ${quote.number}`
      );
      showToast(
        `Facture d'acompte ${result.invoice.number} (${percent}%) créée.`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showToast(error.message || "Impossible de créer la facture d'acompte.", "error");
    }
  }

  function recordPartialPayment(invoice) {
    const remaining = getInvoiceRemaining(invoice);
    if (remaining <= 0.01) {
      showToast("Cette facture est déjà réglée.", "info");
      return;
    }

    const raw = window.prompt(
      `Montant du paiement reçu (reste dû : ${money(remaining)})`,
      String(remaining.toFixed(2)).replace(".", ",")
    );
    if (raw === null) return;

    const normalized = String(raw).replace(",", ".").replace(/[^\d.]/g, "");
    const amount = Number(normalized);
    if (!amount || amount <= 0) {
      showToast("Montant invalide.", "error");
      return;
    }

    const updated = applyPartialPayment(invoice, amount);
    const nextInvoices = documents.map((doc) =>
      String(doc.id) === String(invoice.id) ? updated : doc
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Paiement partiel facture", invoice.number, money(amount));
    showToast(
      updated.status === "Payée"
        ? `${invoice.number} entièrement payée.`
        : `Paiement enregistré — reste ${money(getInvoiceRemaining(updated))}.`,
      "success"
    );
  }

  function handleDocumentSent(doc) {
    const nextDocuments = documents.map((entry) =>
      String(entry.id) === String(doc.id) ? markDocumentSent(entry) : entry
    );
    setData({ ...data, [listKey]: nextDocuments });
    setPreviewDoc(markDocumentSent(doc));
    logActivity?.(
      `Envoi ${isQuote ? "devis" : "facture"}`,
      doc.number,
      formatTrackingDate(new Date().toISOString())
    );
    showToast(`${doc.number} marqué comme envoyé.`, "success");
  }

  function convertQuoteToInvoice(doc) {
    if (quoteRequiresDepositFlow(data, doc)) {
      const summary = getQuoteDepositSummary(data, doc);
      if (summary.depositInvoices.length > 0) {
        showToast(
          "Ce devis possède des acomptes. Utilisez « Facture de solde ».",
          "error"
        );
        return;
      }
      showToast(
        "Ce devis prévoit un acompte. Créez d'abord la facture d'acompte.",
        "error"
      );
      return;
    }

    try {
      const nextData = convertQuoteToInvoiceData(data, doc);
      const invoice = nextData.invoices[nextData.invoices.length - 1];
      setData(nextData);
      logActivity?.("Conversion devis en facture", doc.number, invoice?.number);
      showToast(`Facture ${invoice?.number} créée depuis ${doc.number}`, "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de convertir ce devis", "error");
    }
  }

  function handleExportCsv() {
    if (documents.length === 0) {
      showToast(`Aucun${isQuote ? " devis" : "e facture"} à exporter.`, "error");
      return;
    }

    if (isQuote) {
      showToast("Export CSV disponible pour les factures uniquement.", "info");
      return;
    }

    exportInvoicesCsv(
      sortedDocuments,
      data,
      `factures-${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast(`${sortedDocuments.length} facture(s) exportée(s).`, "success");
  }

  return (
    <section className="documents-page" data-testid={isQuote ? "quotes-page" : "invoices-page"}>
      <div className="page-header">
        <div>
          <h2>{title}</h2>
          <p>
            {isQuote
              ? "Créez, suivez et convertissez vos devis en factures."
              : "Gérez vos factures, suivez les paiements et le stock associé."}
          </p>
        </div>
        {editingId && (
          <span className="documents-editing-badge">Modification en cours</span>
        )}
      </div>

      <div className="documents-stats">
        <div className="documents-stat-card">
          <span>{isQuote ? "Devis" : "Factures"}</span>
          <strong>{stats.count}</strong>
        </div>
        <div className="documents-stat-card">
          <span>Total TTC</span>
          <strong>{money(stats.totalTTC)}</strong>
        </div>
        {isQuote ? (
          <>
            <div className="documents-stat-card">
              <span>En attente</span>
              <strong>{stats.pending}</strong>
            </div>
            <div className="documents-stat-card documents-stat-card--accent">
              <span>Acceptés · convertibles</span>
              <strong>
                {stats.accepted}
                {stats.convertible > 0 ? ` · ${stats.convertible}` : ""}
              </strong>
            </div>
            {stats.staleDrafts > 0 && (
              <div className="documents-stat-card documents-stat-card--danger">
                <span>Brouillons &gt; 7 j</span>
                <strong>{stats.staleDrafts}</strong>
              </div>
            )}
            {stats.inProduction > 0 && (
              <div className="documents-stat-card documents-stat-card--production">
                <span>En atelier</span>
                <strong>{stats.inProduction}</strong>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={`documents-stat-card${stats.overdueCount > 0 ? " documents-stat-card--danger" : ""}`}>
              <span>En retard</span>
              <strong>{stats.overdueCount}</strong>
              {stats.overdueCount > 0 && (
                <em>{money(stats.overdueTotal)}</em>
              )}
            </div>
            <div className="documents-stat-card documents-stat-card--accent">
              <span>Non payées</span>
              <strong>{stats.unpaid}</strong>
            </div>
          </>
        )}
      </div>

      <DocumentForm
        isQuote={isQuote}
        editingId={editingId}
        form={form}
        setForm={setForm}
        totals={totals}
        taxRate={data.settings.taxRate}
        products={data.products || []}
        clients={data.clients || []}
        users={data.users || []}
        onSubmit={submit}
        onReset={reset}
        onUpdateLine={updateLine}
        onSelectProduct={selectProduct}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        lineTotal={lineTotal}
        depositPresets={DEPOSIT_PRESETS}
        attachments={isQuote ? attachments : undefined}
        onAttachmentsChange={isQuote ? setAttachments : undefined}
      />

      <DocumentList
        isQuote={isQuote}
        data={data}
        sortedDocuments={sortedDocuments}
        paginatedDocuments={paginatedDocuments}
        stats={stats}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setCurrentPage(1);
        }}
        canDelete={canDeleteData(currentRole)}
        overdueOnly={overdueOnly}
        sortBy={sortBy}
        onExportCsv={handleExportCsv}
        onToggleOverdueOnly={() => {
          setOverdueOnly((value) => !value);
          setCurrentPage(1);
        }}
        onSortChange={(value) => {
          setSortBy(value);
          setCurrentPage(1);
        }}
        onPreview={openPreview}
        onEdit={edit}
        onRemove={remove}
        onUpdateStatus={updateStatus}
        onSendReminder={sendInvoiceReminder}
        onConvertQuote={convertQuoteToInvoice}
        onGenerateDeliveryNote={generateDeliveryNote}
        onPreviewDeliveryNote={previewDeliveryNote}
        onCreateDeposit={createDepositInvoice}
        onCreateBalance={createBalanceInvoice}
        onRecordPayment={recordPartialPayment}
        depositPresets={DEPOSIT_PRESETS}
      />

      <PaginationControls
        page={documentPage}
        totalPages={documentTotalPages}
        onPageChange={setCurrentPage}
        totalItems={sortedDocuments.length}
        perPage={itemsPerPage}
      />

      {previewDoc && (
        <DocumentPreview
          doc={previewDoc}
          type={previewType}
          data={data}
          onClose={() => {
            setPreviewDoc(null);
            setPreviewType(type);
          }}
          onDocumentSent={handleDocumentSent}
        />
      )}
    </section>
  );
}
export default Documents;