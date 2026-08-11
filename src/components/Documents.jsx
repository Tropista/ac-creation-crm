import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DocumentPreview from "./DocumentPreview";
import DocumentForm from "./documents/DocumentForm";
import DocumentList from "./documents/DocumentList";
import PaginationControls from "./PaginationControls";
import { money } from "../utils/money";
import {
  clientName,
  dedupeDocuments,
  nextDocumentNumber,
  nextInvoiceNumber,
  detectInvoiceNumberGaps,
  detectDocumentNumberGaps,
  currentDocumentYear,
  isQuoteConvertible,
  createDeliveryNoteFromQuote,
  getDeliveryNoteForQuote,
  getQuoteDepositSummary,
  quoteRequiresDepositFlow,
  computeDocumentLineTotals,
  computeDocumentTotals,
  enrichInvoicePaymentFields,
  uid,
  today,
  resolveDocumentTaxRate,
} from "../utils/documents";
import {
  applyStockByLines,
  syncDocumentStock,
  syncQuoteProductionStock,
} from "../utils/stock";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
  isPaidInvoice,
  isCancelledInvoice,
  getInvoiceRemaining,
  parseDocumentDate,
  DEPOSIT_PRESETS,
} from "../utils/invoices";
import {
  computeDueDate,
  openInvoiceReminderMailto,
} from "../utils/invoiceReminders";
import {
  INVOICE_PERIOD_MODES,
  INVOICES_PERIOD_FILTER_KEY,
} from "../utils/invoicePeriodStats";
import { syncQuoteProductionSheetFromLines } from "../utils/quoteMarginAssistant";
import {
  clearInvoiceDraft,
  clearQuoteDraft,
  markQuoteDraftApplied,
  resolveQuoteDraftForApply,
  INVOICES_LIST_VIEW_EVENT,
  QUOTES_LIST_VIEW_EVENT,
  wasQuoteDraftApplied,
} from "../utils/quoteDraft";
import {
  cleanupNavigationBlockers,
  CRM_ROUTE_CHANGE_EVENT,
} from "../utils/uiCleanup";
import {
  copyQuoteShareLink,
  getQuoteIdFromLocation,
  openQuoteWhatsAppShare,
  prepareQuoteForShare,
} from "../utils/quoteShare";
import {
  PRODUCTION_STATUSES,
  QUOTES_STATUS_FILTER_KEY,
} from "../utils/production";
import { downloadProductionSheetPdf } from "../utils/productionPdf";
import { fromDateInputValue, toDateInputValue } from "../utils/quoteDelivery";
import { exportInvoicesCsv } from "../utils/exportCsv";
import {
  formatTrackingDate,
  getStaleDraftQuotes,
  markDocumentReminder,
  markDocumentSent,
} from "../utils/documentTracking";
import { showToast } from "../utils/toast";
import { parseQuoteOpenIdFromLocation } from "../utils/quoteOpenUrl";
import { canDeleteData } from "../services/authService";
import {
  countUnavailableAttachments,
  hydrateQuoteAttachmentsAsync,
} from "../utils/quoteAttachments";
import {
  buildPaymentSummary,
  PAYMENT_METHODS,
  upsertHistoricalInvoicePayment,
} from "../utils/payments";
import { getInvoicePaymentLink } from "../utils/onlinePayments";
import { buildCompanySnapshot } from "../utils/companySnapshot";
import { confirmAction } from "../utils/confirmAction";
import { invoiceApplicationService } from "../application/InvoiceApplicationService";
import { paymentApplicationService } from "../application/PaymentApplicationService";
import {
  appendInvoiceReminderHistory,
  buildInvoiceReminderPdfData,
} from "../utils/invoiceReminderPdf";

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPeriodDateRange(period) {
  if (!period || period.mode === INVOICE_PERIOD_MODES.ALL) {
    return { from: "", to: "" };
  }
  const year = Number(period.year);
  if (!Number.isFinite(year)) return { from: "", to: "" };
  if (period.mode === INVOICE_PERIOD_MODES.YEAR) {
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    };
  }
  if (period.mode === INVOICE_PERIOD_MODES.MONTH) {
    const month = Number(period.month);
    if (!Number.isFinite(month) || month < 0 || month > 11) {
      return { from: "", to: "" };
    }
    return {
      from: toInputDate(new Date(year, month, 1)),
      to: toInputDate(new Date(year, month + 1, 0)),
    };
  }
  return { from: "", to: "" };
}

function Documents({
  type,
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  pendingOpenDoc = null,
  onClearPendingOpenDoc,
}) {
  const location = useLocation();
  const navigate = useNavigate();
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
    purchasePrice: "",
    materialCost: "",
    printWidthCm: "",
    printHeightCm: "",
    materialPricePerM2: "",
    laborMinutes: "",
    laborHourlyRate: "",
    machineMinutes: "",
    machineHourlyRate: "",
    machineCost: "",
    subcontractingCost: "",
    targetMarginRate: "",
    productionTemplateId: "",
    taille: "",
    couleur: "",
    emplacementMarquage: "",
    technique: "",
  };
  const [editingId, setEditingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewType, setPreviewType] = useState(type);
  const [previewIsReminder, setPreviewIsReminder] = useState(false);
  const [previewReminderAction, setPreviewReminderAction] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("dateDesc");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [paidOnly, setPaidOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const prefilledClientId = localStorage.getItem("crm_prefill_client_id") || "";
  const [form, setForm] = useState({
    clientId: prefilledClientId,
    status: defaultStatus,
    billingDetail: "",
    globalDiscount: 0,
    depositPercent: 0,
    promisedDeliveryDateInput: "",
    dateInput: isQuote ? "" : toDateInputValue(today()),
    processType: "",
    assignedTo: "",
    atelierNotes: "",
    priority: "normal",
    numberOverride: "",
    paymentId: "",
    paymentStatus: "",
    paymentAmount: "",
    paymentDateInput: "",
    paymentMethod: "Virement",
    bankTransactionId: "",
    lines: [{ ...emptyLine }],
  });
  const [attachments, setAttachments] = useState([]);
  const [formSessionKey, setFormSessionKey] = useState(0);
  const quotesListViewHandledKeyRef = useRef(null);
  const invoicesListViewHandledKeyRef = useRef(null);

  const itemsPerPage = 25;
  const documents = data[listKey] || [];

  const selectedClient = useMemo(
    () =>
      (data.clients || []).find((client) => client.id === form.clientId) ||
      null,
    [data.clients, form.clientId],
  );

  const effectiveTaxRate = useMemo(
    () => resolveDocumentTaxRate(selectedClient, data.settings),
    [selectedClient, data.settings],
  );

  const invoiceNumberGaps = useMemo(() => {
    if (isQuote) {
      return detectDocumentNumberGaps(documents, prefix, currentDocumentYear());
    }
    return detectInvoiceNumberGaps(
      documents,
      data.settings || {},
      currentDocumentYear(),
    );
  }, [documents, data.settings, isQuote, prefix]);

  const nextAutoNumber = useMemo(() => {
    if (editingId) return "";
    return isQuote
      ? nextDocumentNumber(documents, prefix)
      : nextInvoiceNumber(documents, data.settings);
  }, [documents, data.settings, isQuote, editingId, prefix]);

  function resetDocumentsListView() {
    if (isQuote) {
      clearQuoteDraft();
    } else {
      clearInvoiceDraft();
    }
    setPreviewDoc(null);
    setPreviewType(type);
    if (!localStorage.getItem("crm_prefill_client_id")) {
      setEditingId(null);
      setAttachments([]);
      setForm({
        clientId: "",
        status: defaultStatus,
        billingDetail: "",
        globalDiscount: 0,
        depositPercent: 0,
        promisedDeliveryDateInput: "",
        dateInput: isQuote ? "" : toDateInputValue(today()),
        processType: "",
        assignedTo: "",
        atelierNotes: "",
        priority: "normal",
        numberOverride: "",
        paymentId: "",
        paymentStatus: "",
        paymentAmount: "",
        paymentDateInput: "",
        paymentMethod: "Virement",
        bankTransactionId: "",
        lines: [{ ...emptyLine }],
      });
      setFormSessionKey((value) => value + 1);
    }
  }

  useEffect(() => {
    function onNewItem(e) {
      e.preventDefault();
      reset();
      setTimeout(() => {
        document
          .querySelector(
            `[data-testid="${isQuote ? "quote-form" : "invoice-form"}"] select`,
          )
          ?.focus();
        document
          .querySelector(
            `[data-testid="${isQuote ? "quote-form" : "invoice-form"}"]`,
          )
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    window.addEventListener("crm:new-item", onNewItem);
    return () => window.removeEventListener("crm:new-item", onNewItem);
  }, [isQuote]);

  useEffect(() => {
    const listViewEvent = isQuote
      ? QUOTES_LIST_VIEW_EVENT
      : INVOICES_LIST_VIEW_EVENT;

    function onListViewRequest() {
      resetDocumentsListView();
    }

    window.addEventListener(listViewEvent, onListViewRequest);
    return () => {
      window.removeEventListener(listViewEvent, onListViewRequest);
    };
  }, [isQuote, defaultStatus]);

  useEffect(
    () => () => {
      cleanupNavigationBlockers();
    },
    [],
  );

  useEffect(() => {
    function onRouteChange() {
      setPreviewDoc(null);
      setPreviewType(type);
      setEditingId(null);
      setAttachments([]);
    }

    window.addEventListener(CRM_ROUTE_CHANGE_EVENT, onRouteChange);
    return () =>
      window.removeEventListener(CRM_ROUTE_CHANGE_EVENT, onRouteChange);
  }, [type]);

  useEffect(() => {
    if (!isQuote) {
      if (location.state?.invoicesListView) {
        if (invoicesListViewHandledKeyRef.current === location.key) {
          return undefined;
        }
        invoicesListViewHandledKeyRef.current = location.key;
        resetDocumentsListView();
      }
      return undefined;
    }

    if (location.state?.quotesListView && !location.state?.quoteDraft) {
      if (quotesListViewHandledKeyRef.current === location.key) {
        return undefined;
      }
      quotesListViewHandledKeyRef.current = location.key;
      resetDocumentsListView();
      return undefined;
    }

    const draft = resolveQuoteDraftForApply(location.state);
    if (!draft?.lines?.length) return undefined;
    if (wasQuoteDraftApplied(draft)) return undefined;

    let cancelled = false;

    function draftLinesToForm(lines) {
      return (lines || []).map((line) => ({
        productId: line.productId || "",
        sku: line.sku || "",
        category: line.category || "",
        categoryId: line.categoryId || "",
        description: line.description || "",
        quantity: Number(line.quantity || 1),
        price: Number(line.price || 0),
        discount: Number(line.discount || 0),
        purchasePrice: line.purchasePrice || "",
        materialCost: line.materialCost || "",
        printWidthCm: line.printWidthCm || "",
        printHeightCm: line.printHeightCm || "",
        materialPricePerM2: line.materialPricePerM2 || "",
        laborMinutes: line.laborMinutes || "",
        laborHourlyRate: line.laborHourlyRate || "",
        machineMinutes: line.machineMinutes || "",
        machineHourlyRate: line.machineHourlyRate || "",
        machineCost: line.machineCost || "",
        subcontractingCost: line.subcontractingCost || "",
        targetMarginRate: line.targetMarginRate || "",
        productionTemplateId: line.productionTemplateId || "",
        taille: line.taille || "",
        couleur: line.couleur || "",
        emplacementMarquage: line.emplacementMarquage || "",
        technique: line.technique || "",
      }));
    }

    async function applyDraft() {
      let hydratedAttachments = [];
      try {
        hydratedAttachments = await hydrateQuoteAttachmentsAsync(
          draft.attachments || [],
        );
      } catch (error) {
        console.error("Hydratation pièces jointes brouillon devis :", error);
      }
      if (cancelled) return;

      setEditingId(null);
      setAttachments(hydratedAttachments);
      setForm({
        clientId: draft.clientId || prefilledClientId || "",
        status: "Brouillon",
        billingDetail: draft.billingDetail || "",
        globalDiscount: 0,
        depositPercent: 0,
        promisedDeliveryDateInput: "",
        dateInput: "",
        processType: "",
        assignedTo: "",
        atelierNotes: draft.notes || "",
        priority: "normal",
        lines: draftLinesToForm(draft.lines),
      });
      setFormSessionKey((value) => value + 1);
      markQuoteDraftApplied(draft);
      clearQuoteDraft();
      const attachmentHint =
        hydratedAttachments.length > 0
          ? ` · ${hydratedAttachments.length} pièce(s) jointe(s)`
          : "";
      showToast(
        draft.source
          ? `Devis pré-rempli depuis ${draft.source}${attachmentHint}.`
          : `Devis pré-rempli${attachmentHint}.`,
        "success",
      );
    }

    applyDraft();
    return () => {
      cancelled = true;
    };
  }, [
    isQuote,
    location.key,
    location.state?.quoteDraft,
    location.state?.quotesListView,
    location.state?.invoicesListView,
    prefilledClientId,
    defaultStatus,
  ]);

  useEffect(() => {
    if (!pendingOpenDoc) return;
    const doc = documents.find(
      (d) => String(d.id) === String(pendingOpenDoc.id),
    );
    if (doc) {
      setPreviewDoc(doc);
      setPreviewType(isQuote ? "quote" : "invoice");
      onClearPendingOpenDoc?.();
    }
  }, [pendingOpenDoc, documents]);

  useEffect(() => {
    if (!isQuote) return;
    const quoteId = getQuoteIdFromLocation(location);
    if (!quoteId) return;

    const quote = documents.find(
      (entry) =>
        String(entry.id) === String(quoteId) ||
        String(entry.number) === String(quoteId),
    );
    if (quote) {
      setPreviewDoc(quote);
      setPreviewType("quote");
    }
  }, [isQuote, location.search, documents]);

  useEffect(() => {
    if (isQuote) {
      const value = localStorage.getItem(QUOTES_STATUS_FILTER_KEY);
      if (!value) return;
      localStorage.removeItem(QUOTES_STATUS_FILTER_KEY);
      setStatusFilter(value);
      setCurrentPage(1);
      return;
    }

    const filter = localStorage.getItem(INVOICES_FILTER_KEY);
    const periodFilter = localStorage.getItem(INVOICES_PERIOD_FILTER_KEY);
    if (!filter && !periodFilter) return;
    if (filter) {
      localStorage.removeItem(INVOICES_FILTER_KEY);
    }
    if (periodFilter) {
      localStorage.removeItem(INVOICES_PERIOD_FILTER_KEY);
    }
    if (filter === "overdue") {
      setOverdueOnly(true);
    } else if (filter === "unpaid") {
      setUnpaidOnly(true);
    } else if (filter === "paid") {
      setPaidOnly(true);
    }
    if (periodFilter) {
      try {
        const { from, to } = getPeriodDateRange(JSON.parse(periodFilter));
        setDateFrom(from);
        setDateTo(to);
      } catch {
        setDateFrom("");
        setDateTo("");
      }
    }
    setCurrentPage(1);
  }, [isQuote]);

  const sortedDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = [...documents].filter((doc) => {
      if (statusFilter && doc.status !== statusFilter) return false;
      if (overdueOnly && !isQuote && !isInvoiceOverdue(doc)) return false;
      if (
        unpaidOnly &&
        !isQuote &&
        (isPaidInvoice(doc) || isCancelledInvoice(doc))
      ) {
        return false;
      }
      if (paidOnly && !isQuote && !isPaidInvoice(doc)) return false;

      if (dateFrom || dateTo) {
        const docDate = parseDocumentDate(doc.date);
        if (!docDate) return false;
        if (dateFrom && docDate < new Date(dateFrom)) return false;
        if (dateTo) {
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          if (docDate > end) return false;
        }
      }

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
      if (sortBy === "clientAsc")
        return clientName(data, a.clientId).localeCompare(
          clientName(data, b.clientId),
        );
      if (sortBy === "clientDesc")
        return clientName(data, b.clientId).localeCompare(
          clientName(data, a.clientId),
        );
      if (sortBy === "totalAsc")
        return Number(a.totalTTC || 0) - Number(b.totalTTC || 0);
      if (sortBy === "totalDesc")
        return Number(b.totalTTC || 0) - Number(a.totalTTC || 0);
      if (sortBy === "statusAsc")
        return String(a.status || "").localeCompare(String(b.status || ""));
      if (sortBy === "statusDesc")
        return String(b.status || "").localeCompare(String(a.status || ""));
      return 0;
    });
  }, [
    documents,
    sortBy,
    data,
    overdueOnly,
    unpaidOnly,
    paidOnly,
    statusFilter,
    isQuote,
    search,
    dateFrom,
    dateTo,
  ]);

  const documentTotalPages = Math.max(
    1,
    Math.ceil(sortedDocuments.length / itemsPerPage),
  );
  const documentPage = Math.min(currentPage, documentTotalPages);
  const paginatedDocuments = sortedDocuments.slice(
    (documentPage - 1) * itemsPerPage,
    documentPage * itemsPerPage,
  );

  const stats = useMemo(() => {
    const totalTTC = documents.reduce(
      (sum, doc) => sum + Number(doc.totalTTC || 0),
      0,
    );

    if (isQuote) {
      const pending = documents.filter(
        (doc) => doc.status === "Brouillon" || doc.status === "Envoyé",
      ).length;
      const staleDrafts = getStaleDraftQuotes(documents).length;
      const accepted = documents.filter(
        (doc) => doc.status === "Accepté",
      ).length;
      const inProduction = documents.filter((doc) =>
        PRODUCTION_STATUSES.includes(doc.status),
      ).length;
      const convertible = documents.filter((doc) =>
        isQuoteConvertible(data, doc),
      ).length;
      return {
        count: documents.length,
        totalTTC,
        pending,
        staleDrafts,
        accepted,
        inProduction,
        convertible,
      };
    }

    const overdueDocs = documents.filter((doc) => isInvoiceOverdue(doc));
    const overdueTotal = overdueDocs.reduce(
      (sum, doc) => sum + Number(doc.totalTTC || 0),
      0,
    );
    const unpaid = documents.filter(
      (doc) => doc.status === "Non payée" || doc.status === "En retard",
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
    return computeDocumentLineTotals(line);
  }

  const totals = useMemo(() => {
    return computeDocumentTotals(form.lines, {
      globalDiscount: form.globalDiscount,
      depositPercent: form.depositPercent,
      taxRate: effectiveTaxRate,
    });
  }, [form.lines, form.globalDiscount, form.depositPercent, effectiveTaxRate]);

  function updateLine(index, changes) {
    setForm({
      ...form,
      lines: (form.lines || []).map((line, i) =>
        i === index ? { ...line, ...changes } : line,
      ),
    });
  }

  function selectProduct(index, productId) {
    const product = (data.products || []).find(
      (p) => String(p.id) === String(productId),
    );

    if (!product) {
      updateLine(index, {
        productId: "",
        sku: "",
        category: "",
        categoryId: "",
        description: "",
        price: 0,
        purchasePrice: "",
        materialCost: "",
        printWidthCm: "",
        printHeightCm: "",
        materialPricePerM2: "",
        laborMinutes: "",
        laborHourlyRate: "",
        machineMinutes: "",
        machineHourlyRate: "",
        machineCost: "",
        subcontractingCost: "",
        targetMarginRate: "",
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
      purchasePrice: Number(product.purchasePrice || 0) || "",
    });
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  }

  function removeLine(index) {
    if (form.lines.length === 1)
      return showToast("Il faut au moins une ligne.", "error");
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  }

  function reset() {
    setEditingId(null);
    setAttachments([]);
    setForm({
      clientId: "",
      status: defaultStatus,
      billingDetail: "",
      globalDiscount: 0,
      depositPercent: 0,
      promisedDeliveryDateInput: "",
      dateInput: isQuote ? "" : toDateInputValue(today()),
      processType: "",
      assignedTo: "",
      atelierNotes: "",
      priority: "normal",
      paymentId: "",
      paymentStatus: "",
      paymentAmount: "",
      paymentDateInput: "",
      paymentMethod: "Virement",
      bankTransactionId: "",
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

  function parsePaymentAmount(value) {
    return Number(
      String(value || "")
        .replace(",", ".")
        .replace(/[^\d.]/g, ""),
    );
  }

  function applyInvoiceFormPayment(nextData, invoice) {
    if (isQuote) return nextData;
    const amount = parsePaymentAmount(form.paymentAmount);
    if (!amount || amount <= 0) return nextData;
    return upsertHistoricalInvoicePayment(nextData, invoice, {
      paymentId: form.paymentId || "",
      amount,
      method: form.paymentMethod || "Virement",
      date: form.paymentDateInput || "",
      bankTransactionId: form.bankTransactionId || "",
      notes: "Paiement saisi depuis la fiche facture",
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId && (!isQuote || form.status !== "Brouillon")) {
      return showToast("Choisis un client.", "error");
    }
    const formPaymentAmount = !isQuote
      ? parsePaymentAmount(form.paymentAmount)
      : 0;
    if (!isQuote && formPaymentAmount > 0 && !form.paymentDateInput) {
      return showToast(
        "Date d'encaissement obligatoire pour enregistrer un paiement.",
        "error",
      );
    }

    const cleanLines = form.lines
      .map((line) => {
        const product = (data.products || []).find(
          (p) => String(p.id) === String(line.productId),
        );
        const cleanLine = {
          ...line,
          productId: product?.id || line.productId || "",
          sku: product?.sku || line.sku || "",
          category: product?.category || line.category || "Sans catégorie",
          categoryId: product?.categoryId || line.categoryId || "",
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
          discount: 0,
          purchasePrice: Number(line.purchasePrice || 0),
          materialCost: Number(line.materialCost || 0),
          printWidthCm: Number(line.printWidthCm || 0),
          printHeightCm: Number(line.printHeightCm || 0),
          materialPricePerM2: Number(line.materialPricePerM2 || 0),
          laborMinutes: Number(line.laborMinutes || 0),
          laborHourlyRate: Number(line.laborHourlyRate || 0),
          machineMinutes: Number(line.machineMinutes || 0),
          machineHourlyRate: Number(line.machineHourlyRate || 0),
          machineCost: Number(line.machineCost || 0),
          subcontractingCost: Number(line.subcontractingCost || 0),
          targetMarginRate: Number(line.targetMarginRate || 0),
          productionTemplateId: line.productionTemplateId || "",
          ...(isQuote && {
            taille: String(line.taille || "").trim(),
            couleur: String(line.couleur || "").trim(),
            emplacementMarquage: String(line.emplacementMarquage || "").trim(),
            technique: String(line.technique || "").trim(),
          }),
        };
        return {
          ...cleanLine,
          ...lineTotal(cleanLine),
        };
      })
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0)
      return showToast(
        "Ajoute au moins un produit ou une prestation.",
        "error",
      );

    const firstDescription =
      cleanLines.length === 1
        ? cleanLines[0].description
        : `${cleanLines.length} lignes`;
    const promisedDeliveryDate = isQuote
      ? fromDateInputValue(form.promisedDeliveryDateInput)
      : "";
    const invoiceDate = !isQuote
      ? fromDateInputValue(form.dateInput) || today()
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
      const updatedDocBase = enrichInvoicePaymentFields({
        ...existingDoc,
        companySnapshot:
          existingDoc?.companySnapshot ||
          buildCompanySnapshot(data.settings || {}),
        clientId: form.clientId,
        billingDetail: String(form.billingDetail || "").trim(),
        status: form.status,
        globalDiscount: Number(form.globalDiscount || 0),
        depositPercent: totals.depositPercent,
        depositAmount: totals.depositAmount,
        balanceAfterDeposit: totals.balanceAfterDeposit,
        description: firstDescription,
        lines: cleanLines,
        taxRate: effectiveTaxRate,
        stockAdjusted: !isQuote && form.status !== "Annulée",
        ...quoteExtras,
        ...(!isQuote && { date: invoiceDate }),
        ...totals,
      });
      const updatedDoc = isQuote
        ? syncQuoteProductionSheetFromLines(updatedDocBase, data.products || [])
        : updatedDocBase;

      const stockSync = isQuote
        ? syncQuoteProductionStock(
            data.products || [],
            existingDoc,
            updatedDoc,
            { user: currentRole },
          )
        : null;

      const nextProducts = isQuote
        ? stockSync.products
        : syncDocumentStock(data.products || [], existingDoc, updatedDoc, {
            isQuote,
            user: currentRole,
          });

      const savedDoc = isQuote
        ? {
            ...updatedDoc,
            productionStockAdjusted: stockSync.productionStockAdjusted,
          }
        : updatedDoc;

      const nextData = {
        ...data,
        products: nextProducts,
        [listKey]: documents.map((d) => (d.id === editingId ? savedDoc : d)),
      };
      setData(isQuote ? nextData : applyInvoiceFormPayment(nextData, savedDoc));
      logActivity?.(
        `Modification ${isQuote ? "devis" : "facture"}`,
        existingDoc?.number || editingId,
        money(totals.totalTTC),
      );
    } else {
      const docBase = {
        id: uid(),
        number: form.numberOverride?.trim() || nextAutoNumber,
        companySnapshot: buildCompanySnapshot(data.settings || {}),
        date: isQuote ? today() : invoiceDate,
        taxRate: effectiveTaxRate,
        clientId: form.clientId,
        billingDetail: String(form.billingDetail || "").trim(),
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
          dueDate: computeDueDate(invoiceDate, data.settings.paymentDays),
          paidAmount: 0,
          remaining: totals.totalTTC,
        }),
        ...totals,
      };
      const doc = isQuote
        ? syncQuoteProductionSheetFromLines(docBase, data.products || [])
        : docBase;

      const quoteStockSync = isQuote
        ? syncQuoteProductionStock(data.products || [], null, doc, {
            user: currentRole,
          })
        : null;

      const nextProducts =
        !isQuote && doc.stockAdjusted
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
        ? {
            ...doc,
            productionStockAdjusted: quoteStockSync.productionStockAdjusted,
          }
        : doc;

      const nextData = {
        ...data,
        products: nextProducts,
        [listKey]: [...documents, savedDoc],
      };
      setData(isQuote ? nextData : applyInvoiceFormPayment(nextData, savedDoc));
      logActivity?.(
        `Création ${isQuote ? "devis" : "facture"}`,
        doc.number,
        money(doc.totalTTC),
      );
    }

    localStorage.removeItem("crm_prefill_client_id");

    reset();
  }

  async function edit(doc) {
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
          purchasePrice: line.purchasePrice || "",
          materialCost: line.materialCost || "",
          printWidthCm: line.printWidthCm || "",
          printHeightCm: line.printHeightCm || "",
          materialPricePerM2: line.materialPricePerM2 || "",
          laborMinutes: line.laborMinutes || "",
          laborHourlyRate: line.laborHourlyRate || "",
          machineMinutes: line.machineMinutes || "",
          machineHourlyRate: line.machineHourlyRate || "",
          machineCost: line.machineCost || "",
          subcontractingCost: line.subcontractingCost || "",
          targetMarginRate: line.targetMarginRate || "",
          productionTemplateId: line.productionTemplateId || "",
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
    const hydrated = await hydrateQuoteAttachmentsAsync(doc.attachments || []);
    setAttachments(hydrated);
    if (isQuote) {
      const unavailable = countUnavailableAttachments(hydrated);
      if (unavailable > 0) {
        showToast(
          `${unavailable} pièce(s) jointe(s) absente(s) sur cet appareil — vérifiez Supabase Storage ou réimportez.`,
          "warning",
        );
      }
    }
    const paymentSummary = !isQuote
      ? buildPaymentSummary(doc, data.payments || [])
      : null;
    const primaryPayment = paymentSummary?.paymentHistory?.[0] || null;
    setForm({
      clientId: doc.clientId || "",
      status: doc.status || defaultStatus,
      billingDetail: doc.billingDetail || "",
      globalDiscount: Number(doc.globalDiscount || 0),
      depositPercent: Number(doc.depositPercent || 0),
      promisedDeliveryDateInput: toDateInputValue(doc.promisedDeliveryDate),
      dateInput: isQuote ? "" : toDateInputValue(doc.date),
      processType: doc.processType || "",
      assignedTo: doc.assignedTo || "",
      atelierNotes: doc.atelierNotes || "",
      priority: doc.priority || "normal",
      paymentId: primaryPayment?.id || "",
      paymentStatus: paymentSummary?.status || doc.status || defaultStatus,
      paymentAmount: primaryPayment?.amount ?? doc.paidAmount ?? "",
      paymentDateInput: primaryPayment?.date || doc.paymentDate || "",
      paymentMethod: primaryPayment?.method || doc.paymentMethod || "Virement",
      bankTransactionId:
        primaryPayment?.bankTransactionId || doc.bankTransactionId || "",
      lines,
    });
  }

  useEffect(() => {
    const openFromUrl = parseQuoteOpenIdFromLocation(location);
    const openDocumentId =
      location.state?.openDocumentId ||
      localStorage.getItem("crm_open_document_id") ||
      openFromUrl;
    const openDocumentType =
      location.state?.openDocumentType ||
      localStorage.getItem("crm_open_document_type") ||
      (openFromUrl ? (isQuote ? "quote" : "invoice") : "");

    if (!openDocumentId) return undefined;

    if (
      (openDocumentType === "quote" && !isQuote) ||
      (openDocumentType === "invoice" && isQuote)
    ) {
      localStorage.removeItem("crm_open_document_id");
      localStorage.removeItem("crm_open_document_type");
      return undefined;
    }

    const doc = documents.find((d) => String(d.id) === String(openDocumentId));

    localStorage.removeItem("crm_open_document_id");
    localStorage.removeItem("crm_open_document_type");

    if (!doc) {
      if (openFromUrl && documents.length > 0) {
        showToast(`Devis introuvable (${openDocumentId}).`, "warning");
      }
      return undefined;
    }

    setPreviewDoc(doc);
    setPreviewType(openDocumentType === "quote" ? "quote" : "invoice");
    if (location.state?.openDocumentId) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: {
          ...location.state,
          openDocumentId: null,
          openDocumentType: null,
        },
      });
    }

    return undefined;
  }, [
    documents,
    isQuote,
    location.search,
    location.hash,
    location.pathname,
    location.state,
    navigate,
  ]);
  function duplicate(doc) {
    const newId = crypto.randomUUID();
    const newNum = isQuote
      ? nextDocumentNumber(documents, prefix)
      : nextInvoiceNumber(documents, data.settings);
    const base = {
      ...doc,
      id: newId,
      number: newNum,
      companySnapshot: buildCompanySnapshot(data.settings || {}),
      date: today(),
      acceptedAt: null,
      sentAt: null,
      signature: null,
      shareToken: null,
      convertedToInvoiceId: null,
      emailSentAt: null,
      emailReadAt: null,
      attachments: [],
    };
    const copy = isQuote
      ? { ...base, status: "Brouillon" }
      : {
          ...base,
          status: "Non payée",
          paidAmount: 0,
          remaining: Number(doc.totalTTC || 0),
          dueDate: computeDueDate(today(), data.settings?.paymentDays),
        };
    setData({ ...data, [listKey]: [...documents, copy] });
    const label = isQuote ? "Devis" : "Facture";
    logActivity?.(
      `Duplication ${label.toLowerCase()}`,
      `${doc.number} → ${newNum}`,
    );
    showToast(`${label} ${newNum} créée depuis ${doc.number}.`, "success");
  }

  async function remove(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (
      !(await confirmAction({
        title: `Supprimer ${isQuote ? "le devis" : "la facture"}`,
        message: `Ce ${isQuote ? "devis" : "facture"} sera supprimé définitivement.`,
        detail: isQuote
          ? "Le stock réservé en production sera ajusté si nécessaire."
          : "Le stock facturé sera réintégré si cette facture l'avait déjà déduit.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    )
      return;
    const removedDoc = documents.find((d) => d.id === id);
    let nextProducts = data.products || [];

    if (!isQuote && removedDoc?.stockAdjusted) {
      nextProducts = applyStockByLines(
        nextProducts,
        removedDoc.lines || [],
        "add",
        {
          type: "invoice",
          reason: "Suppression facture",
          reference: removedDoc?.number || "",
          user: currentRole,
        },
      );
    }

    if (isQuote && removedDoc?.productionStockAdjusted) {
      nextProducts = syncQuoteProductionStock(
        nextProducts,
        removedDoc,
        { ...removedDoc, status: "Accepté" },
        { user: currentRole },
      ).products;
    }

    setData({
      ...data,
      products: nextProducts,
      [listKey]: documents.filter((d) => d.id !== id),
    });
    logActivity?.(
      `Suppression ${isQuote ? "devis" : "facture"}`,
      removedDoc?.number || id,
    );
  }

  function updateStatus(id, status) {
    const existingDoc = (data[listKey] || []).find(
      (d) => String(d.id) === String(id),
    );
    const updatedDoc = existingDoc
      ? {
          ...existingDoc,
          status,
          stockAdjusted: !isQuote && status !== "Annulée",
        }
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
        { user: currentRole },
      );
      nextProducts = stockSync.products;
      updatedDoc.productionStockAdjusted = stockSync.productionStockAdjusted;
    }

    const nextDocuments = dedupeDocuments(
      (data[listKey] || []).map((d) =>
        String(d.id) === String(id) && updatedDoc ? updatedDoc : d,
      ),
    );

    const changedDoc = nextDocuments.find((d) => String(d.id) === String(id));
    setData({
      ...data,
      products: nextProducts,
      [listKey]: nextDocuments,
    });
    logActivity?.(
      `Changement statut ${isQuote ? "devis" : "facture"}`,
      changedDoc?.number || id,
      status,
    );
  }

  function sendInvoiceReminder(invoice) {
    const client = (data.clients || []).find((c) => c.id === invoice.clientId);
    const result = openInvoiceReminderMailto(
      invoice,
      client,
      data.settings || {},
    );
    if (!result.ok) {
      showToast("Ce client n'a pas d'adresse email enregistrée.", "error");
      return;
    }

    const nextInvoices = documents.map((doc) =>
      String(doc.id) === String(invoice.id) ? markDocumentReminder(doc) : doc,
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Relance facture", invoice.number, client?.name || "");
    showToast(
      `Relance n°${result.reminderNumber || 1} préparée pour ${invoice.number}.`,
      "success",
    );
  }

  async function handleCopyQuoteLink(quote) {
    const client = (data.clients || []).find((c) => c.id === quote.clientId);
    const prepared = prepareQuoteForShare(quote, client);
    const result = await copyQuoteShareLink(prepared, {
      client,
      settings: data.settings || {},
    });
    if (prepared.shareToken && prepared.shareToken !== quote.shareToken) {
      setData({
        ...data,
        quotes: (data.quotes || []).map((entry) =>
          String(entry.id) === String(quote.id) ? prepared : entry,
        ),
      });
    }
    if (result.ok) {
      showToast("Lien devis copié dans le presse-papiers.", "success");
      logActivity?.("Partage lien devis", quote.number);
      return;
    }
    showToast("Copie impossible — copiez l'URL manuellement.", "warning");
  }

  function handleShareQuoteWhatsApp(quote) {
    const client = (data.clients || []).find((c) => c.id === quote.clientId);
    openQuoteWhatsAppShare(quote, data.settings || {}, client);
    logActivity?.("Partage WhatsApp devis", quote.number, client?.name || "");
    showToast("WhatsApp ouvert avec le message pré-rempli.", "info");
  }

  function closePreview() {
    setPreviewDoc(null);
    setPreviewType(type);
    cleanupNavigationBlockers();
  }

  function openPreview(doc, docType = isQuote ? "quote" : "invoice") {
    setPreviewIsReminder(false);
    setPreviewReminderAction("");
    setPreviewDoc(doc);
    setPreviewType(docType);
  }

  function openReminderPreview(invoice, action = "") {
    setPreviewIsReminder(true);
    setPreviewReminderAction(action);
    setPreviewDoc(invoice);
    setPreviewType("invoice");
  }

  function recordReminderDocument(invoice, reminderData, historyType) {
    const updated = appendInvoiceReminderHistory(
      invoice,
      reminderData,
      historyType,
      currentRole,
    );
    const nextInvoices = (data.invoices || []).map((entry) =>
      String(entry.id) === String(invoice.id) ? updated : entry,
    );
    setData({ ...data, invoices: nextInvoices });
    setPreviewDoc(updated);
    logActivity?.(
      historyType === "impression"
        ? "Impression rappel facture"
        : "PDF rappel facture",
      invoice.number,
      `${reminderData.label} · solde ${money(reminderData.remainingAmount)}`,
    );
  }

  function generateDeliveryNote(quote) {
    try {
      const deliveryInfo = window.prompt(
        "Informations de livraison (optionnel) :",
        getDeliveryNoteForQuote(data, quote)?.deliveryInfo || "",
      );
      if (deliveryInfo === null) return;

      const result = createDeliveryNoteFromQuote(data, quote, {
        deliveryInfo: deliveryInfo.trim(),
      });
      setData(result);
      logActivity?.(
        result.created
          ? "Création bon de livraison"
          : "Mise à jour bon de livraison",
        result.deliveryNote.number,
        quote.number,
      );
      showToast(
        result.created
          ? `Bon de livraison ${result.deliveryNote.number} créé.`
          : `Bon de livraison ${result.deliveryNote.number} mis à jour.`,
        "success",
      );
      openPreview(result.deliveryNote, "delivery");
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "Impossible de générer le bon de livraison.",
        "error",
      );
    }
  }

  function previewDeliveryNote(quote) {
    const note = getDeliveryNoteForQuote(data, quote);
    if (!note) {
      showToast(
        "Aucun bon de livraison pour ce devis. Générez-le d'abord.",
        "info",
      );
      return;
    }
    openPreview(note, "delivery");
  }

  async function downloadProductionSheet(quote) {
    try {
      await downloadProductionSheetPdf({ quote, data });
      logActivity?.("Fiche atelier PDF", quote.number);
      showToast(`Fiche atelier ${quote.number} téléchargée.`, "success");
    } catch (error) {
      console.error(error);
      showToast("Impossible de générer la fiche atelier.", "error");
    }
  }

  function createBalanceInvoice(quote) {
    try {
      const result = invoiceApplicationService.createBalance(data, quote);
      setData(result);
      logActivity?.(
        "Création facture de solde",
        result.invoice.number,
        quote.number,
      );
      showToast(
        `Facture de solde ${result.invoice.number} créée (${money(result.invoice.totalTTC)}).`,
        "success",
      );
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "Impossible de créer la facture de solde.",
        "error",
      );
    }
  }

  function createDepositInvoice(quote, percent) {
    try {
      const result = invoiceApplicationService.createDeposit(
        data,
        quote,
        percent,
      );
      setData(result);
      logActivity?.(
        "Création facture d'acompte",
        result.invoice.number,
        `${percent}% — ${quote.number}`,
      );
      showToast(
        `Facture d'acompte ${result.invoice.number} (${percent}%) créée.`,
        "success",
      );
    } catch (error) {
      console.error(error);
      showToast(
        error.message || "Impossible de créer la facture d'acompte.",
        "error",
      );
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
      String(remaining.toFixed(2)).replace(".", ","),
    );
    if (raw === null) return;

    const normalized = String(raw)
      .replace(",", ".")
      .replace(/[^\d.]/g, "");
    const amount = Number(normalized);
    if (!amount || amount <= 0) {
      showToast("Montant invalide.", "error");
      return;
    }

    const method =
      window.prompt(
        `Mode de paiement (${PAYMENT_METHODS.join(", ")})`,
        "Virement",
      ) || "Virement";

    try {
      const result = paymentApplicationService.record(data, invoice, {
        amount,
        method: PAYMENT_METHODS.includes(method) ? method : "Autre",
        notes: "",
        isDeposit: invoice.invoiceType === "acompte",
      });
      setData(result);
      logActivity?.(
        "Paiement facture",
        invoice.number,
        `${money(amount)} · ${method}`,
      );
      showToast(
        result.invoice.status === "Payée"
          ? `${invoice.number} entièrement payée.`
          : `Paiement enregistré — reste ${money(getInvoiceRemaining(result.invoice))}.`,
        "success",
      );
    } catch (error) {
      showToast(
        error.message || "Impossible d'enregistrer le paiement.",
        "error",
      );
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard?.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  function handleCreatePaymentLink(invoice) {
    const client = (data.clients || []).find(
      (entry) => String(entry.id) === String(invoice.clientId),
    );
    const generatedLink = getInvoicePaymentLink(
      invoice,
      data.settings || {},
      client,
    );
    const paymentLink =
      generatedLink ||
      window.prompt(
        `Lien de paiement pour ${invoice.number}`,
        invoice.paymentLink || "",
      );

    if (!paymentLink) {
      showToast(
        "Configurez un modèle de lien dans Paramètres ou collez un lien manuel.",
        "info",
      );
      return;
    }

    const trimmedLink = String(paymentLink).trim();
    const nextInvoices = (data.invoices || []).map((entry) =>
      String(entry.id) === String(invoice.id)
        ? {
            ...entry,
            paymentLink: trimmedLink,
            paymentLinkCreatedAt: new Date().toISOString(),
          }
        : entry,
    );

    setData({ ...data, invoices: nextInvoices });
    copyText(trimmedLink);
    logActivity?.("Lien paiement facture", invoice.number, client?.name || "");
    showToast(`Lien de paiement copié pour ${invoice.number}.`, "success");
    window.open(trimmedLink, "_blank", "noopener,noreferrer");
  }

  function handleQuoteSignatureAccept(signedQuote) {
    const nextQuotes = documents.map((entry) =>
      String(entry.id) === String(signedQuote.id) ? signedQuote : entry,
    );
    setData({ ...data, quotes: nextQuotes });
    setPreviewDoc(signedQuote);
    logActivity?.(
      "Signature devis",
      signedQuote.number,
      signedQuote.signature?.clientEmail || "",
    );
  }

  function handleDocumentSent(doc) {
    const updatedDoc = {
      ...markDocumentSent(doc),
      ...(doc.emailSentAt ? { emailSentAt: doc.emailSentAt } : {}),
    };
    const nextDocuments = documents.map((entry) =>
      String(entry.id) === String(doc.id) ? updatedDoc : entry,
    );
    setData({ ...data, [listKey]: nextDocuments });
    setPreviewDoc(updatedDoc);
    logActivity?.(
      `Envoi ${isQuote ? "devis" : "facture"}`,
      doc.number,
      formatTrackingDate(new Date().toISOString()),
    );
    showToast(`${doc.number} marqué comme envoyé.`, "success");
  }

  function convertQuoteToInvoice(doc) {
    if (quoteRequiresDepositFlow(data, doc)) {
      const summary = getQuoteDepositSummary(data, doc);
      if (summary.depositInvoices.length > 0) {
        showToast(
          "Ce devis possède des acomptes. Utilisez « Facture de solde ».",
          "error",
        );
        return;
      }
      showToast(
        "Ce devis prévoit un acompte. Créez d'abord la facture d'acompte.",
        "error",
      );
      return;
    }

    try {
      const nextData = invoiceApplicationService.convertQuote(data, doc);
      const invoice = nextData.invoice;
      const {
        invoice: _invoice,
        created: _created,
        ...persistedData
      } = nextData;
      setData(persistedData);
      logActivity?.("Conversion devis en facture", doc.number, invoice?.number);
      showToast(
        nextData.created
          ? `Facture ${invoice?.number} créée depuis ${doc.number}`
          : `La facture ${invoice?.number} existe déjà.`,
        nextData.created ? "success" : "info",
      );
    } catch (error) {
      console.error(error);
      showToast("Impossible de convertir ce devis", "error");
    }
  }

  function handleExportCsv() {
    if (documents.length === 0) {
      showToast(
        `Aucun${isQuote ? " devis" : "e facture"} à exporter.`,
        "error",
      );
      return;
    }

    if (isQuote) {
      showToast("Export CSV disponible pour les factures uniquement.", "info");
      return;
    }

    exportInvoicesCsv(
      sortedDocuments,
      data,
      `factures-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    showToast(`${sortedDocuments.length} facture(s) exportée(s).`, "success");
  }

  return (
    <section
      className={`documents-page${previewDoc ? " documents-page--preview-open" : ""}`}
      data-testid={isQuote ? "quotes-page" : "invoices-page"}
    >
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
            <div
              className={`documents-stat-card${stats.overdueCount > 0 ? " documents-stat-card--danger" : ""}`}
            >
              <span>En retard</span>
              <strong>{stats.overdueCount}</strong>
              {stats.overdueCount > 0 && <em>{money(stats.overdueTotal)}</em>}
            </div>
            <div className="documents-stat-card documents-stat-card--accent">
              <span>Non payées</span>
              <strong>{stats.unpaid}</strong>
            </div>
          </>
        )}
      </div>

      {!isQuote && documents.some((d) => d.isTemplate) && (
        <div className="card" style={{ marginBottom: 0, padding: "14px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              ⭐ Modèles de facture
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {documents.filter((d) => d.isTemplate).length} modèle(s)
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {documents
              .filter((d) => d.isTemplate)
              .map((tpl) => {
                const tplClient = (data.clients || []).find(
                  (c) => c.id === tpl.clientId,
                );
                return (
                  <div
                    key={tpl.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.07)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{tpl.number}</span>
                    {tplClient && (
                      <span style={{ color: "var(--muted)" }}>
                        {tplClient.name}
                      </span>
                    )}
                    <span style={{ color: "var(--muted)" }}>
                      {money(tpl.totalTTC)}
                    </span>
                    <button
                      type="button"
                      className="primary"
                      style={{ padding: "4px 12px", fontSize: 11 }}
                      onClick={() => duplicate(tpl)}
                    >
                      Créer depuis ce modèle
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {invoiceNumberGaps.length > 0 && (
        <div className="card documents-gap-warning">
          <strong>Numérotation {currentDocumentYear()} — trous détectés</strong>
          <p className="muted">
            Numéros manquants : {invoiceNumberGaps.slice(0, 8).join(", ")}
            {invoiceNumberGaps.length > 8
              ? ` … (+${invoiceNumberGaps.length - 8})`
              : ""}
          </p>
          {!editingId && (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              {invoiceNumberGaps.slice(0, 4).map((gap) => (
                <button
                  key={gap}
                  type="button"
                  className="compact"
                  onClick={() =>
                    setForm((f) => ({ ...f, numberOverride: gap }))
                  }
                  title={`Utiliser le numéro manquant ${gap}`}
                >
                  Utiliser {gap}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DocumentForm
        key={formSessionKey}
        isQuote={isQuote}
        editingId={editingId}
        form={form}
        setForm={setForm}
        totals={totals}
        taxRate={effectiveTaxRate}
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
        nextAutoNumber={nextAutoNumber}
        paymentMethods={PAYMENT_METHODS}
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
        onPreviewReminder={openReminderPreview}
        onConvertQuote={convertQuoteToInvoice}
        onCopyQuoteLink={isQuote ? handleCopyQuoteLink : undefined}
        onShareQuoteWhatsApp={isQuote ? handleShareQuoteWhatsApp : undefined}
        onGenerateDeliveryNote={generateDeliveryNote}
        onPreviewDeliveryNote={previewDeliveryNote}
        onDownloadProductionSheet={downloadProductionSheet}
        onCreateDeposit={createDepositInvoice}
        onCreateBalance={createBalanceInvoice}
        onRecordPayment={recordPartialPayment}
        onCreatePaymentLink={handleCreatePaymentLink}
        onDuplicate={duplicate}
        onMarkEmailRead={(doc) => {
          const key = isQuote ? "quotes" : "invoices";
          setData({
            ...data,
            [key]: documents.map((d) =>
              String(d.id) === String(doc.id)
                ? { ...d, emailReadAt: new Date().toISOString() }
                : d,
            ),
          });
          showToast(`${doc.number} marqué comme lu.`, "success");
        }}
        onToggleTemplate={
          !isQuote
            ? (doc) => {
                const next = !doc.isTemplate;
                setData({
                  ...data,
                  invoices: documents.map((d) =>
                    String(d.id) === String(doc.id)
                      ? { ...d, isTemplate: next }
                      : d,
                  ),
                });
                showToast(
                  `${doc.number} ${next ? "enregistré comme modèle ⭐" : "retiré des modèles"}.`,
                  "success",
                );
              }
            : undefined
        }
        onToggleNoReminder={
          !isQuote
            ? (doc) => {
                const next = !doc.noAutoReminder;
                setData({
                  ...data,
                  invoices: documents.map((d) =>
                    String(d.id) === String(doc.id)
                      ? { ...d, noAutoReminder: next }
                      : d,
                  ),
                });
                showToast(
                  `Relances ${next ? "désactivées" : "réactivées"} pour ${doc.number}.`,
                  "success",
                );
              }
            : undefined
        }
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(v) => {
          setDateFrom(v);
          setCurrentPage(1);
        }}
        onDateToChange={(v) => {
          setDateTo(v);
          setCurrentPage(1);
        }}
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
          onClose={closePreview}
          onDocumentSent={handleDocumentSent}
          onQuoteSharePrepared={(prepared) => {
            if (!isQuote) return;
            setData({
              ...data,
              quotes: (data.quotes || []).map((entry) =>
                String(entry.id) === String(prepared.id) ? prepared : entry,
              ),
            });
            if (previewDoc && String(previewDoc.id) === String(prepared.id)) {
              setPreviewDoc(prepared);
            }
          }}
          onQuoteAccept={isQuote ? handleQuoteSignatureAccept : undefined}
          paymentSummary={
            !isQuote ? buildPaymentSummary(previewDoc, data.payments) : null
          }
          reminderMode={previewIsReminder}
          initialReminderAction={previewReminderAction}
          reminderData={
            previewIsReminder
              ? buildInvoiceReminderPdfData(previewDoc, data.settings || {})
              : null
          }
          onReminderDocumentGenerated={recordReminderDocument}
        />
      )}
    </section>
  );
}
export default Documents;
