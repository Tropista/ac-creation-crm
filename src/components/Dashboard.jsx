import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clientName,
  statusClass,
  convertQuoteToInvoiceData,
  isQuoteConvertible,
} from "../utils/documents";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
  parseDocumentDate,
  sortOverdueInvoices,
} from "../utils/invoices";
import {
  INVOICE_PERIOD_MODES,
  collectInvoiceYears,
  computeInvoicePeriodTotals,
  filterInvoicesByPeriod,
  formatInvoicePeriodLabel,
} from "../utils/invoicePeriodStats";
import {
  formatAccountingMonthInput,
  parseAccountingMonthInput,
} from "../utils/exportCsv";
import { openInvoiceReminderMailto } from "../utils/invoiceReminders";
import { openQuoteReminderMailto } from "../utils/quoteReminders";
import { getProductionQueue, QUOTES_STATUS_FILTER_KEY } from "../utils/production";
import { getOverdueQuotes, getQuotesToLaunchToday } from "../utils/quoteDelivery";
import DeliveryUrgencyBadge from "./DeliveryUrgencyBadge";
import { money } from "../utils/money";
import { pageToPath } from "../utils/routes";
import { getPermissions } from "../utils/permissions";
import { isExpenseInMonth, getExpenseDate } from "../utils/expenseSuppliers";
import { exportInvoicesCsv, exportLowStockPurchaseOrderCsv, buildPurchaseOrderText } from "../utils/exportCsv";
import MonthlyAccountingExport from "./MonthlyAccountingExport";
import { getStaleDraftQuotes, getStaleSentQuotes, markDocumentReminder, formatTrackingDate } from "../utils/documentTracking";
import { buildMondayWorkQueue, MONDAY_QUEUE_KINDS } from "../utils/mondayWorkQueue";
import { collectAnnualYears, computeAnnualStats } from "../utils/annualStats";
import { downloadPurchaseOrderPdf } from "../utils/purchaseOrderPdf";
import {
  buildLeadMailtoHref,
  buildLeadTelHref,
  convertLeadToClientAndQuote,
  countActiveLeads,
  countUnreadLeads,
  getActiveLeads,
  LEAD_STATUS,
  loadLocalPublicLeads,
  markLeadRead,
  mergePublicLeadsIntoData,
  PUBLIC_LEADS_UPDATED_EVENT,
} from "../services/leadsService";
import {
  navigateToInvoicesList,
  navigateToQuotesList,
  openQuoteFromCalculator,
} from "../utils/quoteDraft";
import { showToast } from "../utils/toast";
import { useAtelierRealtime } from "../hooks/useAtelierRealtime";
import {
  dismissPublicAcceptance,
  getRecentPublicAcceptances,
} from "../utils/publicQuoteAcceptance";
import {
  allocateExpensesByProcessRevenue,
  computeProcessTypeStats,
} from "../utils/processTypeStats";
import {
  buildDashboardProfitability,
} from "../utils/profitability";
import { buildDirectionDashboard } from "../utils/directionDashboard";
import AutomationCenter from "./AutomationCenter";
const DashboardCharts = lazy(() => import("./DashboardCharts"));
import ErrorBoundary from "./ErrorBoundary";
import DashboardStatCard from "./dashboard/DashboardStatCard";
import BillingPeriodCard from "./dashboard/BillingPeriodCard";
import AnnualStatsCard from "./dashboard/AnnualStatsCard";
import DeliveryCalendarCard from "./dashboard/DeliveryCalendarCard";
import { getInvoicesDueForReminder } from "../utils/autoReminderEngine";
import { sendReminderEmail } from "../services/emailService";
import {
  countLowStockByKind,
  getLowStockProductsByKind,
  getMinStock,
  getStock,
  isOutOfStock,
  resolveProductSupplier,
  suggestedReorderQty,
  PRODUCTS_KIND_FILTER_KEY,
  PRODUCTS_STOCK_FILTER_KEY,
} from "../utils/stock";

function leadStatusMeta(lead) {
  const status = String(lead?.status || LEAD_STATUS.NEW);
  if (status === LEAD_STATUS.CONVERTED) {
    return { label: "Converti", className: "dashboard-lead-status dashboard-lead-status--converted" };
  }
  if (status === LEAD_STATUS.READ) {
    return { label: "Lu", className: "dashboard-lead-status dashboard-lead-status--read" };
  }
  return { label: "Nouveau", className: "dashboard-lead-status dashboard-lead-status--new" };
}


export default function Dashboard({
  data,
  setData,
  logActivity,
  currentRole = "Admin",
  cloudAvailable = false,
  onCloudResync,
}) {
  const navigate = useNavigate();
  const [billingPeriodMode, setBillingPeriodMode] = useState(
    INVOICE_PERIOD_MODES.MONTH
  );
  const [billingMonthValue, setBillingMonthValue] = useState(() =>
    formatAccountingMonthInput(
      new Date().getFullYear(),
      new Date().getMonth()
    )
  );
  const [billingYear, setBillingYear] = useState(() =>
    String(new Date().getFullYear())
  );
  const [annualStatsYear, setAnnualStatsYear] = useState(() =>
    String(new Date().getFullYear())
  );
  const [sendingReminders, setSendingReminders] = useState(false);
  const [, setPublicAcceptanceDismissTick] = useState(0);
  const permissions = getPermissions(currentRole);
  const canManageInvoices = permissions.pages.includes("invoices");
  const canManageQuotes = permissions.pages.includes("quotes");
  const canManageClients = permissions.pages.includes("clients");
  const canConvertLeads = canManageQuotes && canManageClients;
  const canManageProducts = permissions.pages.includes("products");
  const canManageExpenses = permissions.pages.includes("expenses");

  useAtelierRealtime({
    enabled: cloudAvailable && typeof onCloudResync === "function",
    onRefresh: onCloudResync,
    alertPublicAcceptances: canManageQuotes,
    syncToastMessage: "Tableau de bord synchronisé (temps réel)",
  });

  useEffect(() => {
    function syncPendingLeads() {
      if (!loadLocalPublicLeads().length || typeof setData !== "function") return;
      setData((current) => mergePublicLeadsIntoData(current));
    }

    syncPendingLeads();
    window.addEventListener("focus", syncPendingLeads);
    window.addEventListener(PUBLIC_LEADS_UPDATED_EVENT, syncPendingLeads);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncPendingLeads();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", syncPendingLeads);
      window.removeEventListener(PUBLIC_LEADS_UPDATED_EVENT, syncPendingLeads);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [setData]);

  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const clients = data.clients || [];
  const products = data.products || [];
  const categories = data.categories || [];
  const expenses = data.expenses || [];
  const leads = data.leads || [];
  const suppliers = data.suppliers || [];

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthLabel = now.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const monthExpenses = expenses.filter((expense) =>
    isExpenseInMonth(expense, currentYear, currentMonth)
  );
  const monthExpensesTTC = monthExpenses.reduce(
    (sum, expense) => sum + Number(expense.totalTTC || expense.amountHT || 0),
    0
  );
  const monthExpensesHT = monthExpenses.reduce(
    (sum, expense) => sum + Number(expense.amountHT || 0),
    0
  );

  const monthInvoices = invoices.filter((invoice) => {
    const date = parseDocumentDate(invoice.date);
    return (
      date &&
      date.getFullYear() === currentYear &&
      date.getMonth() === currentMonth
    );
  });
  const monthRevenueHT = monthInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.totalHT || 0),
    0
  );
  const monthMarginHT = monthRevenueHT - monthExpensesHT;
  const marginCalculable = monthRevenueHT > 0 || monthExpensesHT > 0;

  const overdueInvoices = sortOverdueInvoices(
    invoices.filter(isInvoiceOverdue)
  );
  const overdueTotal = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.totalTTC || 0),
    0
  );

  const settings = data.settings || {};
  const lowStockProducts = getLowStockProductsByKind(products, "blank", 8, settings);
  const lowStockCount = countLowStockByKind(products, "blank", settings);
  const lowStockConsumables = getLowStockProductsByKind(
    products,
    "consumable",
    8,
    settings
  );
  const lowStockConsumablesCount = countLowStockByKind(
    products,
    "consumable",
    settings
  );
  const outOfStockCount = products.filter(isOutOfStock).length;

  const convertibleQuotes = quotes
    .filter((quote) => isQuoteConvertible(data, quote))
    .slice()
    .reverse()
    .slice(0, 8);

  const productionQueue = getProductionQueue(quotes);
  const overdueDeliveries = getOverdueQuotes(quotes);
  const quotesToLaunchToday = getQuotesToLaunchToday(quotes);
  const staleDraftQuotes = getStaleDraftQuotes(quotes).slice(0, 8);
  const staleSentQuotes = getStaleSentQuotes(quotes).slice(0, 8);
  const mondayWorkQueue = useMemo(
    () => buildMondayWorkQueue({ quotes, invoices, data }),
    [quotes, invoices, data]
  );
  const activeLeads = getActiveLeads(leads);
  const unreadLeadCount = countUnreadLeads(leads);
  const activeLeadCount = countActiveLeads(leads);
  const recentPublicAcceptances = getRecentPublicAcceptances(quotes);

  const unpaidCount = invoices.filter((i) => i.status !== "Payée").length;

  const remindersDue = useMemo(
    () => getInvoicesDueForReminder(invoices, data.clients || [], data.settings || {}),
    [invoices, data.clients, data.settings]
  );

  async function sendAllReminders() {
    if (!data.settings?.smtpEmail || !data.settings?.smtpAppPassword) {
      showToast("Configure Gmail dans Paramètres avant d'envoyer des relances.", "error");
      return;
    }
    if (remindersDue.length === 0) return;
    setSendingReminders(true);
    let sent = 0;
    let nextInvoices = [...invoices];
    for (const { invoice, client, reminderNumber } of remindersDue) {
      try {
        await sendReminderEmail({ invoice, client, settings: data.settings, reminderNumber });
        nextInvoices = nextInvoices.map((inv) =>
          String(inv.id) === String(invoice.id) ? markDocumentReminder(inv) : inv
        );
        sent++;
        logActivity?.("Relance automatique", invoice.number, client?.name || "");
      } catch (err) {
        showToast(`Erreur relance ${invoice.number} : ${err.message}`, "error");
      }
    }
    setData({ ...data, invoices: nextInvoices });
    if (sent > 0) showToast(`${sent} relance(s) envoyée(s).`, "success");
    setSendingReminders(false);
  }

  async function sendSingleReminder(invoice, client, reminderNumber) {
    if (!data.settings?.smtpEmail || !data.settings?.smtpAppPassword) {
      showToast("Configure Gmail dans Paramètres avant d'envoyer des relances.", "error");
      return;
    }
    try {
      await sendReminderEmail({ invoice, client, settings: data.settings, reminderNumber });
      const nextInvoices = invoices.map((inv) =>
        String(inv.id) === String(invoice.id) ? markDocumentReminder(inv) : inv
      );
      setData({ ...data, invoices: nextInvoices });
      logActivity?.("Relance automatique", invoice.number, client?.name || "");
      showToast(`Relance n°${reminderNumber} envoyée pour ${invoice.number}.`, "success");
    } catch (err) {
      showToast(`Erreur : ${err.message}`, "error");
    }
  }

  const billingPeriod = useMemo(() => {
    const today = new Date();
    const fallbackYear = today.getFullYear();
    const fallbackMonth = today.getMonth();
    if (billingPeriodMode === INVOICE_PERIOD_MODES.ALL) {
      return { mode: INVOICE_PERIOD_MODES.ALL };
    }
    if (billingPeriodMode === INVOICE_PERIOD_MODES.YEAR) {
      return {
        mode: INVOICE_PERIOD_MODES.YEAR,
        year: Number(billingYear) || fallbackYear,
      };
    }
    const parsed =
      parseAccountingMonthInput(billingMonthValue) || {
        year: fallbackYear,
        month: fallbackMonth,
      };
    return {
      mode: INVOICE_PERIOD_MODES.MONTH,
      year: parsed.year,
      month: parsed.month,
    };
  }, [billingPeriodMode, billingMonthValue, billingYear]);

  const billingPeriodLabel = formatInvoicePeriodLabel(billingPeriod);
  const billingYearOptions = useMemo(
    () => collectInvoiceYears(invoices, new Date().getFullYear()),
    [invoices]
  );

  const annualYearOptions = collectAnnualYears(quotes, invoices, expenses);
  const annualStats = computeAnnualStats({
    quotes,
    invoices,
    expenses,
    data,
    year: Number(annualStatsYear) || new Date().getFullYear(),
  });
  const directionDashboard = buildDirectionDashboard(data, {
    year: Number(annualStatsYear) || new Date().getFullYear(),
  });

  const allTimeInvoiceTotals = useMemo(
    () => computeInvoicePeriodTotals(invoices),
    [invoices]
  );

  const periodInvoiceTotals = useMemo(() => {
    const filtered = filterInvoicesByPeriod(invoices, billingPeriod);
    return computeInvoicePeriodTotals(filtered);
  }, [invoices, billingPeriod]);

  const periodInvoices = filterInvoicesByPeriod(invoices, billingPeriod);
  const periodExpensesHT =
    billingPeriod.mode === INVOICE_PERIOD_MODES.ALL
      ? expenses.reduce((sum, expense) => sum + Number(expense.amountHT || 0), 0)
      : billingPeriod.mode === INVOICE_PERIOD_MODES.YEAR
        ? expenses
            .filter((expense) => {
              const date = getExpenseDate(expense);
              return date && date.getFullYear() === billingPeriod.year;
            })
            .reduce((sum, expense) => sum + Number(expense.amountHT || 0), 0)
        : expenses
            .filter((expense) =>
              isExpenseInMonth(expense, billingPeriod.year, billingPeriod.month)
            )
            .reduce((sum, expense) => sum + Number(expense.amountHT || 0), 0);

  const processTypeStats = allocateExpensesByProcessRevenue(
    computeProcessTypeStats(periodInvoices),
    periodExpensesHT
  );

  const acceptedQuotes = quotes.filter((q) => q.status === "Accepté").length;

  const invoiceLines = useMemo(
    () =>
      invoices.flatMap((invoice) =>
        (invoice.lines || []).map((line) => ({
          ...line,
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          clientId: invoice.clientId,
          date: invoice.date,
          status: invoice.status,
        }))
      ),
    [invoices]
  );

  const productStats = useMemo(
    () =>
      products
        .map((product) => {
          const lines = invoiceLines.filter(
            (line) => String(line.productId) === String(product.id)
          );
          const quantity = lines.reduce(
            (sum, line) => sum + Number(line.quantity || 0),
            0
          );
          const revenue = lines.reduce(
            (sum, line) => sum + Number(line.totalHT || 0),
            0
          );
          return { ...product, quantity, revenue };
        })
        .filter((p) => p.quantity > 0 || p.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    [products, invoiceLines]
  );

  const clientStats = useMemo(
    () =>
      clients
        .map((client) => {
          const clientInvoices = invoices.filter(
            (invoice) => invoice.clientId === client.id
          );
          const total = clientInvoices.reduce(
            (sum, inv) => sum + Number(inv.totalTTC || 0),
            0
          );
          return { ...client, invoiceCount: clientInvoices.length, total };
        })
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [clients, invoices]
  );

  const categoryStats = useMemo(() => {
    return categories
    .map((category) => {
      const categoryName =
        category.name || category.label || category.category || "";
      const normalizedCategoryName = String(categoryName).trim().toLowerCase();

      const categoryProducts = products.filter(
        (p) =>
          String(p.categoryId || "") === String(category.id || "") ||
          String(p.category || "").trim().toLowerCase() ===
            normalizedCategoryName
      );

      const categoryProductIds = categoryProducts.map((p) => String(p.id));

      const lines = invoiceLines.filter((line) => {
        const lineProductId = String(line.productId || "");
        const lineCategory = String(line.category || "").trim().toLowerCase();

        return (
          categoryProductIds.includes(lineProductId) ||
          lineCategory === normalizedCategoryName
        );
      });

      const revenue = lines.reduce(
        (sum, line) => sum + Number(line.totalHT || line.subtotal || 0),
        0
      );
      const quantity = lines.reduce(
        (sum, line) => sum + Number(line.quantity || 0),
        0
      );

      return {
        ...category,
        name: categoryName || "Sans catégorie",
        revenue,
        quantity,
      };
    })
    .filter((c) => c.revenue > 0 || c.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue);
  }, [categories, products, invoiceLines]);

  const maxProductRevenue = Math.max(...productStats.map((p) => p.revenue), 1);
  const maxClientRevenue = Math.max(...clientStats.map((c) => c.total), 1);
  const maxCategoryRevenue = Math.max(
    ...categoryStats.map((c) => c.revenue),
    1
  );

  const monthCompareMax = Math.max(monthRevenueHT, monthExpensesHT, 1);
  const monthRevenueBarPct = (monthRevenueHT / monthCompareMax) * 100;
  const monthExpensesBarPct = (monthExpensesHT / monthCompareMax) * 100;
  const paidInvoiceCount = invoices.filter((i) => i.status === "Payée").length;
  const unpaidBarPct =
    invoices.length > 0 ? (unpaidCount / invoices.length) * 100 : 0;
  const paidBarPct =
    invoices.length > 0 ? (paidInvoiceCount / invoices.length) * 100 : 0;
  const maxProductionGroup = Math.max(
    ...productionQueue.byProcess.map((g) => g.items.length),
    1
  );

  function openQuote(quote) {
    localStorage.setItem("crm_open_document_id", quote.id);
    localStorage.setItem("crm_open_document_type", "quote");
    navigate(pageToPath("quotes"));
  }

  function handleExportPurchaseOrderPdf() {
    if (lowStockCount === 0) {
      showToast("Aucun produit en stock bas à commander.", "info");
      return;
    }
    downloadPurchaseOrderPdf({ products, suppliers, settings });
    logActivity?.("Export bon de commande PDF", `${lowStockCount} produit(s)`);
    showToast(`Bon de commande PDF (${lowStockCount} ligne(s))`, "success");
  }

  function sendQuoteReminder(quote) {
    const client = clients.find((c) => c.id === quote.clientId);
    const result = openQuoteReminderMailto(quote, client, settings);
    if (!result.ok) {
      showToast("Ce client n'a pas d'adresse email enregistrée.", "error");
      return;
    }

    const nextQuotes = quotes.map((doc) =>
      String(doc.id) === String(quote.id) ? markDocumentReminder(doc) : doc
    );
    setData({ ...data, quotes: nextQuotes });
    logActivity?.("Relance devis", quote.number, client?.name || "");
    showToast(`Relance n°${result.reminderNumber || 1} préparée pour ${quote.number}.`, "success");
  }

  function handleMondayQueueAction(item) {
    if (item.kind === MONDAY_QUEUE_KINDS.INVOICE_OVERDUE) {
      const invoice = invoices.find((entry) => String(entry.id) === String(item.invoiceId));
      if (invoice) sendInvoiceReminder(invoice);
      return;
    }
    if (item.quoteId) {
      const quote = quotes.find((entry) => String(entry.id) === String(item.quoteId));
      if (!quote) return;
      if (item.kind === MONDAY_QUEUE_KINDS.QUOTE_FOLLOWUP) {
        sendQuoteReminder(quote);
        return;
      }
      if (item.kind === MONDAY_QUEUE_KINDS.MISSING_DEPOSIT) {
        openQuote(quote);
        return;
      }
      if (item.kind === MONDAY_QUEUE_KINDS.LAUNCH_TODAY) {
        goToAtelier();
      }
    }
  }

  function mondayQueueActionLabel(item) {
    if (item.kind === MONDAY_QUEUE_KINDS.QUOTE_FOLLOWUP) return "Relancer";
    if (item.kind === MONDAY_QUEUE_KINDS.INVOICE_OVERDUE) return "Relancer";
    if (item.kind === MONDAY_QUEUE_KINDS.MISSING_DEPOSIT) return "Ouvrir devis";
    if (item.kind === MONDAY_QUEUE_KINDS.LAUNCH_TODAY) return "Atelier";
    return "Voir";
  }

  function mondayQueueKindLabel(kind) {
    if (kind === MONDAY_QUEUE_KINDS.QUOTE_FOLLOWUP) return "Devis envoyé";
    if (kind === MONDAY_QUEUE_KINDS.INVOICE_OVERDUE) return "Facture en retard";
    if (kind === MONDAY_QUEUE_KINDS.MISSING_DEPOSIT) return "Acompte manquant";
    if (kind === MONDAY_QUEUE_KINDS.LAUNCH_TODAY) return "Commande à lancer";
    return "Action";
  }

  function goToAtelier() {
    navigate(pageToPath("atelier"));
  }

  function goToLeadsPage() {
    navigate(pageToPath("leads"));
  }

  function goToInvoices(filter) {
    if (filter) {
      localStorage.setItem(INVOICES_FILTER_KEY, filter);
    }
    navigateToInvoicesList(navigate);
  }

  function goToOverdueInvoices() {
    goToInvoices("overdue");
  }

  function goToQuotes(status) {
    if (status) {
      localStorage.setItem(QUOTES_STATUS_FILTER_KEY, status);
    }
    navigateToQuotesList(navigate);
  }

  function handleConvertLead(lead) {
    try {
      const result = convertLeadToClientAndQuote(data, lead.id);
      setData(result.data);
      logActivity?.(
        result.isNewClient
          ? "Conversion lead → client + devis"
          : "Conversion lead → devis (client existant)",
        lead.email
      );
      openQuoteFromCalculator(navigate, result.draft);
      showToast(
        result.isNewClient
          ? "Client créé et devis pré-rempli."
          : "Devis pré-rempli pour le client existant.",
        "success"
      );
    } catch (error) {
      showToast(error.message || "Conversion impossible.", "error");
    }
  }

  function handleMarkLeadRead(leadId) {
    setData((current) => ({
      ...current,
      leads: markLeadRead(current.leads || [], leadId),
    }));
    showToast("Lead marqué comme traité.", "success");
  }

  function goToProducts({ stock, kind } = {}) {
    if (stock) {
      localStorage.setItem(PRODUCTS_STOCK_FILTER_KEY, stock);
    }
    if (kind) {
      localStorage.setItem(PRODUCTS_KIND_FILTER_KEY, kind);
    }
    navigate(pageToPath("products"));
  }

  function goToProductsPage() {
    goToProducts();
  }

  function goToSupplier(supplierId) {
    if (supplierId) {
      localStorage.setItem("crm_open_supplier_id", String(supplierId));
    }
    navigate(pageToPath("suppliers"));
  }

  function handleOrderProduct(product) {
    const supplier = resolveProductSupplier(product, suppliers);
    const qty = suggestedReorderQty(product);

    if (supplier?.email) {
      const subject = encodeURIComponent(
        `Commande réassort — ${product.name || product.sku || "produit"}`
      );
      const body = encodeURIComponent(
        `Bonjour,\n\nMerci de nous approvisionner :\n- ${product.name || "Produit"} (SKU: ${product.sku || "—"})\n- Quantité : ${qty}\n\nStock actuel : ${getStock(product)} / seuil ${getMinStock(product)}\n\n${data.settings?.companyName || "AC Creation"}`
      );
      window.open(`mailto:${supplier.email}?subject=${subject}&body=${body}`, "_blank");
      showToast(`Brouillon email pour ${supplier.name}`, "info");
      return;
    }

    if (supplier?.id) {
      goToSupplier(supplier.id);
      showToast(`Fournisseur ${supplier.name} — complétez la commande`, "info");
      return;
    }

    const note = `Commande ${product.name || product.sku} — qté ${qty} — fournisseur à définir`;
    const nextProducts = products.map((entry) =>
      String(entry.id) === String(product.id)
        ? { ...entry, reorderNote: note, reorderNoteAt: new Date().toISOString() }
        : entry
    );
    setData?.({ ...data, products: nextProducts });
    showToast("Note de commande enregistrée sur le produit", "success");
  }

  function handleExportPurchaseOrder() {
    if (lowStockCount === 0) {
      showToast("Aucun produit en stock bas à commander.", "info");
      return;
    }
    exportLowStockPurchaseOrderCsv(products, suppliers, data.settings || {});
    logActivity?.("Export bon de commande fournisseur", `${lowStockCount} produit(s)`);
    showToast(`Bon de commande CSV (${lowStockCount} ligne(s))`, "success");
  }

  function handleCopyPurchaseOrderText() {
    const text = buildPurchaseOrderText(products, suppliers, data.settings || {});
    navigator.clipboard?.writeText(text).then(
      () => showToast("Bon de commande copié dans le presse-papiers", "success"),
      () => showToast("Copie impossible — exportez le CSV", "warning")
    );
  }

  function handleConvertQuote(quote) {
    if (!setData) return;
    try {
      const nextData = convertQuoteToInvoiceData(data, quote);
      const invoice = nextData.invoices[nextData.invoices.length - 1];
      setData(nextData);
      logActivity?.(
        "Conversion devis en facture",
        quote.number,
        invoice?.number
      );
      showToast(
        `Facture ${invoice?.number} créée depuis ${quote.number}`,
        "success"
      );
    } catch (error) {
      console.error(error);
      showToast("Impossible de convertir ce devis", "error");
    }
  }

  function formatDueDate(invoice) {
    return invoice.dueDate || "—";
  }

  function handleExportInvoicesCsv() {
    if (invoices.length === 0) {
      showToast("Aucune facture à exporter.", "error");
      return;
    }

    exportInvoicesCsv(
      invoices,
      data,
      `factures-${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast(`${invoices.length} facture(s) exportée(s).`, "success");
  }

  const dashboardProfitability = useMemo(
    () => buildDashboardProfitability(data),
    [data]
  );

  const profitabilityByClient = dashboardProfitability.byClient.slice(0, 5);
  const profitabilityByMachine = dashboardProfitability.byMachine.slice(0, 5);
  const hasProfitabilityData =
    dashboardProfitability.paidInvoiceCount > 0 ||
    dashboardProfitability.supplementalQuoteCount > 0;

  function sendInvoiceReminder(invoice) {
    const client = clients.find((c) => c.id === invoice.clientId);
    const result = openInvoiceReminderMailto(invoice, client, data.settings || {});
    if (!result.ok) {
      showToast("Ce client n'a pas d'adresse email enregistrée.", "error");
      return;
    }

    const nextInvoices = invoices.map((doc) =>
      String(doc.id) === String(invoice.id)
        ? markDocumentReminder(doc)
        : doc
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Relance facture", invoice.number, client?.name || "");
    showToast(`Relance n°${result.reminderNumber || 1} préparée pour ${invoice.number}.`, "success");
  }

  return (
    <section data-testid="dashboard-page">
      <div className="page-header">
        <div>
          <h2>Tableau de bord</h2>
          <p>Statistiques, factures en retard, stock bas et conversion devis.</p>
        </div>
        {canManageInvoices && (
          <button type="button" onClick={handleExportInvoicesCsv}>
            Exporter factures CSV
          </button>
        )}
      </div>

      {(canManageQuotes || canManageInvoices) && mondayWorkQueue.length > 0 && (
        <div
          className="card dashboard-monday-queue"
          data-testid="dashboard-monday-queue"
        >
          <div className="dashboard-monday-queue__head">
            <div>
              <h3>File de travail</h3>
              <p className="muted">
                {mondayWorkQueue.length} action(s) prioritaire(s) — devis à relancer, factures,
                acomptes et commandes à lancer.
              </p>
            </div>
          </div>
          <ul className="dashboard-monday-queue__list">
            {mondayWorkQueue.slice(0, 12).map((item) => (
              <li key={item.id}>
                <span className="dashboard-monday-queue__kind">
                  {mondayQueueKindLabel(item.kind)}
                </span>
                <strong>{item.label}</strong>
                <span className="muted">{item.detail}</span>
                {item.amount != null ? <span>{money(item.amount)}</span> : null}
                <button
                  type="button"
                  className="compact"
                  onClick={() => handleMondayQueueAction(item)}
                >
                  {mondayQueueActionLabel(item)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card dashboard-automations-card">
        <div className="dashboard-annual-stats__head">
          <div>
            <h3>Alertes automatisations</h3>
            <p className="muted">Devis sans suite, impayés, stock bas, commandes prêtes, SAV.</p>
          </div>
          <button type="button" onClick={() => navigate(pageToPath("automations"))}>
            Voir tout
          </button>
        </div>
        <AutomationCenter data={data} compact limit={6} />
      </div>

      {(canManageExpenses || canManageInvoices || canManageQuotes) && (
        <div className="dashboard-visual-kpis">
          {(canManageExpenses || canManageInvoices) && marginCalculable && (
            <div className="card dashboard-visual-kpi">
              <div className="dashboard-visual-kpi__head">
                <h3>CA vs dépenses — {monthLabel}</h3>
                <span className="muted">Comparaison HT du mois en cours</span>
              </div>
              <div className="dashboard-compare-chart">
                <div className="dashboard-compare-row">
                  <span>Chiffre d&apos;affaires HT</span>
                  <strong>{money(monthRevenueHT)}</strong>
                </div>
                <div className="dashboard-bar-track dashboard-bar-track--revenue">
                  <div
                    className="dashboard-bar-fill dashboard-bar-fill--revenue"
                    style={{ width: `${Math.max(4, monthRevenueBarPct)}%` }}
                  />
                </div>
                <div className="dashboard-compare-row">
                  <span>Dépenses HT</span>
                  <strong>{money(monthExpensesHT)}</strong>
                </div>
                <div className="dashboard-bar-track dashboard-bar-track--expense">
                  <div
                    className="dashboard-bar-fill dashboard-bar-fill--expense"
                    style={{ width: `${Math.max(4, monthExpensesBarPct)}%` }}
                  />
                </div>
                <p className={`dashboard-margin-tag${monthMarginHT < 0 ? " is-danger" : ""}`}>
                  Marge : {money(monthMarginHT)}
                </p>
              </div>
            </div>
          )}

          {canManageInvoices && (
            <div className="card dashboard-visual-kpi">
              <div className="dashboard-visual-kpi__head">
                <h3>Factures impayées</h3>
                <span className="muted">{unpaidCount} sur {invoices.length} facture(s)</span>
              </div>
              <div className="dashboard-unpaid-chart">
                <div className="dashboard-unpaid-bars">
                  <div
                    className="dashboard-unpaid-segment dashboard-unpaid-segment--paid"
                    style={{ width: `${Math.max(unpaidCount === 0 ? 100 : paidBarPct, 0)}%` }}
                    title={`Payées : ${paidInvoiceCount}`}
                  />
                  <div
                    className="dashboard-unpaid-segment dashboard-unpaid-segment--unpaid"
                    style={{ width: `${Math.max(unpaidCount > 0 ? unpaidBarPct : 0, 0)}%` }}
                    title={`Impayées : ${unpaidCount}`}
                  />
                </div>
                <div className="dashboard-unpaid-legend">
                  <span><i className="dot dot--paid" /> Payées ({paidInvoiceCount})</span>
                  <span><i className="dot dot--unpaid" /> Impayées ({unpaidCount})</span>
                </div>
                <strong className="dashboard-unpaid-amount">
                  {money(allTimeInvoiceTotals.unpaidTTC)}
                </strong>
                <span className="muted">Montant à encaisser</span>
                {overdueInvoices.length > 0 && (
                  <button type="button" className="dashboard-kpi-cta" onClick={goToOverdueInvoices}>
                    Voir les retards ({overdueInvoices.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {canManageInvoices && remindersDue.length > 0 && (
            <div className="card dashboard-visual-kpi">
              <div className="dashboard-visual-kpi__head">
                <h3>📬 Relances à envoyer</h3>
                <span className="muted">{remindersDue.length} facture(s) en attente</span>
              </div>
              <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {remindersDue.slice(0, 5).map(({ invoice, client, reminderNumber, daysOverdue }) => (
                  <li key={invoice.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>
                      <strong>{invoice.number}</strong>
                      <span className="muted"> · {client.name} · {daysOverdue}j de retard</span>
                    </span>
                    <span style={{ color: "var(--orange)", fontWeight: 600, fontSize: 11 }}>
                      Relance n°{reminderNumber}
                    </span>
                    <button
                      type="button"
                      className="compact"
                      onClick={() => sendSingleReminder(invoice, client, reminderNumber)}
                      disabled={sendingReminders}
                    >
                      Envoyer
                    </button>
                  </li>
                ))}
                {remindersDue.length > 5 && (
                  <li className="muted" style={{ fontSize: 12 }}>+ {remindersDue.length - 5} autre(s)…</li>
                )}
              </ul>
              <button
                type="button"
                className="primary"
                onClick={sendAllReminders}
                disabled={sendingReminders}
                style={{ width: "100%" }}
              >
                {sendingReminders ? "Envoi en cours…" : `Envoyer toutes les relances (${remindersDue.length})`}
              </button>
            </div>
          )}

          {canManageQuotes && (
            <div className="card dashboard-visual-kpi">
              <div className="dashboard-visual-kpi__head">
                <h3>File atelier</h3>
                <span className="muted">{productionQueue.total} commande(s) en cours</span>
              </div>
              {productionQueue.total === 0 ? (
                <p className="muted">Aucune commande en production pour le moment.</p>
              ) : (
                <div className="dashboard-production-bars">
                  {productionQueue.byProcess.map((group) => (
                    <div key={group.key} className="dashboard-production-bar-row">
                      <div className="dashboard-production-bar-label">
                        <span>{group.label}</span>
                        <strong>{group.items.length}</strong>
                      </div>
                      <div className="dashboard-bar-track">
                        <div
                          className="dashboard-bar-fill dashboard-bar-fill--production"
                          style={{
                            width: `${Math.max(
                              6,
                              (group.items.length / maxProductionGroup) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="dashboard-kpi-cta"
                    onClick={() => navigate(pageToPath("atelier"))}
                  >
                    Ouvrir l&apos;atelier →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(canManageExpenses || canManageInvoices) && (
        <div className="stats dashboard-kpis">
          {canManageExpenses && (
            <DashboardStatCard
              label={`Dépenses du mois (${monthLabel})`}
              value={money(monthExpensesTTC)}
              detail={`${monthExpenses.length} facture(s) · ${money(monthExpensesHT)} HT`}
              className="dashboard-kpi"
              onClick={() => navigate(pageToPath("expenses"))}
            />
          )}
          {canManageInvoices && marginCalculable && (
            <DashboardStatCard
              label="Marge du mois (CA HT − dépenses HT)"
              value={money(monthMarginHT)}
              detail={`CA ${money(monthRevenueHT)} · Dépenses ${money(monthExpensesHT)}`}
              className={`dashboard-kpi${monthMarginHT < 0 ? " stat--danger" : ""}`}
              onClick={() => navigate(pageToPath("expenses"))}
            />
          )}
        </div>
      )}

      <BillingPeriodCard
        billingPeriodMode={billingPeriodMode}
        setBillingPeriodMode={setBillingPeriodMode}
        billingMonthValue={billingMonthValue}
        setBillingMonthValue={setBillingMonthValue}
        billingYear={billingYear}
        setBillingYear={setBillingYear}
        billingPeriodLabel={billingPeriodLabel}
        billingYearOptions={billingYearOptions}
        periodInvoiceTotals={periodInvoiceTotals}
        processTypeStats={processTypeStats}
        canManageInvoices={canManageInvoices}
        goToInvoices={goToInvoices}
      />

      {(canManageInvoices || canManageQuotes) && (
        <ErrorBoundary>
          <Suspense fallback={<div style={{ height: 280, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>Chargement des graphiques…</div>}>
            <DashboardCharts
              annualStats={annualStats}
              processTypeStats={processTypeStats}
              leads={leads}
              quotes={quotes}
              invoices={invoices}
              expenses={data.expenses || []}
              year={Number(annualStatsYear) || new Date().getFullYear()}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {(canManageInvoices || canManageQuotes) && (
        <AnnualStatsCard
          annualStats={annualStats}
          annualStatsYear={annualStatsYear}
          setAnnualStatsYear={setAnnualStatsYear}
          annualYearOptions={annualYearOptions}
        />
      )}

      {canManageQuotes && hasProfitabilityData && (
        <div className="card dashboard-profitability" data-testid="dashboard-profitability">
          <div className="dashboard-annual-stats__head">
            <div>
              <h3>Rentabilité</h3>
              <p className="muted">
                Marge HT sur {dashboardProfitability.paidInvoiceCount} facture(s) payée(s)
                {dashboardProfitability.supplementalQuoteCount > 0
                  ? ` + ${dashboardProfitability.supplementalQuoteCount} commande(s) atelier en cours`
                  : ""}
                . Coûts atelier si fiche production, sinon prix d&apos;achat produits.
              </p>
            </div>
          </div>
          <div className="dashboard-annual-stats__grid">
            <div>
              <h4>Par client</h4>
              <ul className="dashboard-annual-top-clients">
                {profitabilityByClient.map((row) => (
                  <li key={row.clientId}>
                    <span>{row.name}</span>
                    <strong>
                      {money(row.marginHT)} ({row.marginRate} %)
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Par machine / process</h4>
              <ul className="dashboard-annual-top-clients">
                {profitabilityByMachine.map((row) => (
                  <li key={row.machine}>
                    <span>{row.machine}</span>
                    <strong>{money(row.marginHT)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {(canManageInvoices || canManageQuotes) && (
        <div className="card dashboard-direction" data-testid="dashboard-direction">
          <div className="dashboard-annual-stats__head">
            <div>
              <h3>Dashboard direction</h3>
              <p className="muted">
                Pilotage {directionDashboard.year} : CA, conversion, impayés, marge, clients et produits rentables.
              </p>
            </div>
          </div>
          <div className="dashboard-direction__kpis">
            <div><span>CA HT</span><strong>{money(directionDashboard.revenueHT)}</strong></div>
            <div><span>Conversion</span><strong>{directionDashboard.conversionRate} %</strong></div>
            <div><span>Impayés</span><strong>{money(directionDashboard.unpaidAmount)}</strong></div>
            <div>
              <span>Marge connue</span>
              <strong>
                {directionDashboard.marginKnownRevenueHT > 0
                  ? `${money(directionDashboard.marginHT)} (${directionDashboard.marginRate} %)`
                  : "À compléter"}
              </strong>
              {directionDashboard.marginUnknownRevenueHT > 0 && (
                <em className="dashboard-direction__kpi-note">
                  Coûts manquants sur {money(directionDashboard.marginUnknownRevenueHT)} de CA
                </em>
              )}
            </div>
          </div>
          <div className="dashboard-direction__grid">
            <section>
              <h4>CA mensuel</h4>
              <div className="dashboard-direction__months">
                {directionDashboard.monthlyRevenue.map((month) => (
                  <span key={month.month} title={money(month.revenueHT)}>
                    <b style={{ height: `${Math.max(4, Math.min(100, month.revenueHT / Math.max(directionDashboard.revenueHT, 1) * 240))}%` }} />
                    <em>{month.label}</em>
                  </span>
                ))}
              </div>
            </section>
            <section>
              <h4>Meilleurs clients</h4>
              {directionDashboard.topClients.length === 0 ? <p className="muted">Aucune vente.</p> : (
                <ul className="dashboard-annual-top-clients">
                  {directionDashboard.topClients.map((client) => (
                    <li key={client.clientId}><span>{client.name}</span><strong>{money(client.revenueHT)}</strong></li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h4>Produits rentables</h4>
              {directionDashboard.profitableProducts.length === 0 ? <p className="muted">Aucune ligne produit.</p> : (
                <ul className="dashboard-annual-top-clients">
                  {directionDashboard.profitableProducts.map((product) => (
                    <li key={product.key}><span>{product.name}</span><strong>{money(product.marginHT)}</strong></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <div className="stats">
        <DashboardStatCard
          label="Clients"
          value={clients.length}
          onClick={() => navigate(pageToPath("clients"))}
        />
        <DashboardStatCard
          label="Produits"
          value={products.length}
          onClick={goToProductsPage}
        />
        <DashboardStatCard
          label="Devis"
          value={quotes.length}
          onClick={() => goToQuotes()}
        />
        <DashboardStatCard
          label="Devis acceptés"
          value={acceptedQuotes}
          onClick={() => goToQuotes("Accepté")}
        />
        <DashboardStatCard
          label="Factures"
          value={invoices.length}
          onClick={() => goToInvoices()}
        />
        <DashboardStatCard
          label="En retard"
          value={overdueInvoices.length}
          className="stat--danger"
          onClick={goToOverdueInvoices}
        />
        {canManageProducts && (
          <DashboardStatCard
            label="Stock bas (produits)"
            value={lowStockCount}
            className={lowStockCount > 0 ? "stat--danger" : ""}
            onClick={() => goToProducts({ stock: "low", kind: "blank" })}
          />
        )}
        {canManageProducts && (
          <DashboardStatCard
            label="Consommables bas"
            value={lowStockConsumablesCount}
            className={lowStockConsumablesCount > 0 ? "stat--danger" : ""}
            onClick={() => goToProducts({ stock: "low", kind: "consumable" })}
          />
        )}
        {canManageProducts && outOfStockCount > 0 && (
          <DashboardStatCard
            label="Rupture"
            value={outOfStockCount}
            className="stat--danger"
            onClick={() => goToProducts({ stock: "out" })}
          />
        )}
        <DashboardStatCard
          label="Non payées"
          value={unpaidCount}
          onClick={() => goToInvoices("unpaid")}
        />
      </div>

      {(canManageExpenses || canManageInvoices) && (
        <div
          className="card dashboard-action-card dashboard-accounting-export"
          data-testid="dashboard-accounting-export"
        >
          <MonthlyAccountingExport
            data={data}
            logActivity={logActivity}
            layout="card"
          />
        </div>
      )}

      <div className="dashboard-actions-grid">
        {canManageInvoices && (
          <div className="card dashboard-action-card">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Factures en retard</h3>
                <p className="muted">
                  {overdueInvoices.length === 0
                    ? "Aucune facture en retard."
                    : `${overdueInvoices.length} facture(s) — ${money(overdueTotal)} TTC`}
                </p>
              </div>
              {overdueInvoices.length > 0 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={goToOverdueInvoices}
                >
                  Voir toutes →
                </button>
              )}
            </div>
            {overdueInvoices.length === 0 ? (
              <p className="muted">Toutes les échéances sont à jour.</p>
            ) : (
              <div className="table compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Échéance</th>
                      <th>Total TTC</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueInvoices.slice(0, 6).map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>{clientName(data, invoice.clientId)}</td>
                        <td>{formatDueDate(invoice)}</td>
                        <td>{money(invoice.totalTTC)}</td>
                        <td>
                          <span className={statusClass(invoice.status)}>
                            {invoice.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="compact"
                            onClick={() => sendInvoiceReminder(invoice)}
                            title={
                              invoice.lastReminderDate
                                ? `Dernière relance : ${invoice.lastReminderDate} · Relance n°${Number(invoice.reminderCount || 0) + 1}`
                                : "Préparer un email de relance (relance n°1)"
                            }
                          >
                            {Number(invoice.reminderCount || 0) > 0
                              ? `Relance n°${Number(invoice.reminderCount || 0) + 1}`
                              : "Relancer"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {canManageQuotes && canManageInvoices && setData && (
          <div className="card dashboard-action-card">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Devis à facturer</h3>
                <p className="muted">
                  Devis acceptés convertibles en un clic.
                </p>
              </div>
              {convertibleQuotes.length > 0 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => navigateToQuotesList(navigate)}
                >
                  Voir les devis →
                </button>
              )}
            </div>
            {convertibleQuotes.length === 0 ? (
              <p className="muted">Aucun devis accepté en attente de facture.</p>
            ) : (
              <div className="table compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Date</th>
                      <th>Total TTC</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {convertibleQuotes.map((quote) => (
                      <tr key={quote.id}>
                        <td>{quote.number}</td>
                        <td>{clientName(data, quote.clientId)}</td>
                        <td>{quote.date}</td>
                        <td>{money(quote.totalTTC)}</td>
                        <td>
                          <button
                            type="button"
                            className="primary compact"
                            onClick={() => handleConvertQuote(quote)}
                          >
                            → Facture
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {canManageQuotes && staleDraftQuotes.length > 0 && (
          <div className="card dashboard-action-card dashboard-action-card--warning">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Brouillons à relancer</h3>
                <p className="muted">
                  Devis brouillon datant de plus de 7 jours, jamais envoyés.
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => navigateToQuotesList(navigate)}
              >
                Voir les devis →
              </button>
            </div>
            <ul className="dashboard-stale-drafts">
              {staleDraftQuotes.map((quote) => (
                <li key={quote.id}>
                  <strong>{quote.number}</strong>
                  <span>{clientName(data, quote.clientId)}</span>
                  <span className="muted">{quote.date}</span>
                  <span>{money(quote.totalTTC)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canManageQuotes && recentPublicAcceptances.length > 0 && (
          <div
            className="card dashboard-action-card"
            data-testid="dashboard-public-acceptances"
          >
            <div className="dashboard-action-card__header">
              <div>
                <h3>
                  Acceptations en ligne
                  <span className="dashboard-badge">{recentPublicAcceptances.length}</span>
                </h3>
                <p className="muted">
                  Devis acceptés par le client via le lien public.
                </p>
              </div>
              <button type="button" className="ghost" onClick={() => goToQuotes("Accepté")}>
                Voir les devis →
              </button>
            </div>
            <ul className="dashboard-public-acceptances-list">
              {recentPublicAcceptances.slice(0, 6).map((quote) => (
                <li key={quote.id}>
                  <strong>{quote.number}</strong>
                  <span>{clientName(data, quote.clientId)}</span>
                  <span className="muted">
                    {quote.acceptedAt
                      ? new Date(quote.acceptedAt).toLocaleString("fr-FR")
                      : "—"}
                  </span>
                  <button
                    type="button"
                    className="compact"
                    onClick={() => {
                      dismissPublicAcceptance(quote.id);
                      setPublicAcceptanceDismissTick((tick) => tick + 1);
                    }}
                  >
                    Marquer vu
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canManageQuotes && staleSentQuotes.length > 0 && (
          <div className="card dashboard-action-card dashboard-action-card--warning">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Devis envoyés à relancer</h3>
                <p className="muted">
                  Devis « Envoyé » datant de plus de 7 jours sans retour client.
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => goToQuotes("Envoyé")}
              >
                Voir les devis →
              </button>
            </div>
            <div className="table compact-table">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Envoyé le</th>
                    <th>Total TTC</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staleSentQuotes.map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.number}</td>
                      <td>{clientName(data, quote.clientId)}</td>
                      <td>{formatTrackingDate(quote.sentAt)}</td>
                      <td>{money(quote.totalTTC)}</td>
                      <td>
                        <button
                          type="button"
                          className="compact"
                          onClick={() => openQuote(quote)}
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          className="compact"
                          onClick={() => sendQuoteReminder(quote)}
                        >
                          {Number(quote.reminderCount || 0) > 0
                            ? `Relance n°${Number(quote.reminderCount || 0) + 1}`
                            : "Relancer"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {canConvertLeads && (
          <div className="card dashboard-action-card" data-testid="dashboard-leads">
            <div className="dashboard-action-card__header">
              <div>
                <h3>
                  Leads configurateur
                  {unreadLeadCount > 0 ? (
                    <span className="dashboard-badge">{unreadLeadCount}</span>
                  ) : null}
                </h3>
                <p className="muted">
                  {activeLeadCount === 0
                    ? "Aucun contact configurateur en attente."
                    : `${activeLeadCount} contact(s) à traiter${
                        unreadLeadCount > 0 && unreadLeadCount < activeLeadCount
                          ? ` (${unreadLeadCount} nouveau(x))`
                          : ""
                      }.`}
                </p>
              </div>
              <button type="button" className="ghost" onClick={goToLeadsPage}>
                Tous les leads →
              </button>
              {activeLeadCount > 0 ? (
                <button
                  type="button"
                  className="primary compact"
                  onClick={goToLeadsPage}
                  data-testid="dashboard-leads-cta"
                >
                  Traiter {activeLeadCount} lead(s)
                </button>
              ) : null}
            </div>
            {activeLeadCount === 0 ? (
              <p className="muted">
                Les emails laissés sur le configurateur t-shirt apparaissent ici avec le bouton
                « Créer client + devis ».
              </p>
            ) : (
            <ul className="dashboard-leads-list">
              {activeLeads.slice(0, 6).map((lead) => {
                const mailtoHref = buildLeadMailtoHref(lead);
                const telHref = buildLeadTelHref(lead);
                const isUnread = String(lead.status || LEAD_STATUS.NEW) === LEAD_STATUS.NEW;
                const projectName = String(lead.metadata?.projectName || "").trim();
                const statusMeta = leadStatusMeta(lead);

                return (
                  <li key={lead.id} className={isUnread ? "dashboard-leads-list__item--new" : ""}>
                    <div className="dashboard-leads-list__main">
                      <span className={statusMeta.className}>{statusMeta.label}</span>
                      {mailtoHref ? (
                        <a href={mailtoHref} className="dashboard-leads-list__email">
                          {lead.email}
                        </a>
                      ) : (
                        <strong>{lead.email}</strong>
                      )}
                      {telHref ? (
                        <a href={telHref} className="dashboard-leads-list__phone">
                          {lead.phone}
                        </a>
                      ) : lead.phone ? (
                        <span>{lead.phone}</span>
                      ) : null}
                      {projectName ? <span>{projectName}</span> : null}
                      <span className="muted">{lead.source || "configurateur"}</span>
                    </div>
                    <div className="dashboard-leads-list__actions">
                      {canConvertLeads && statusMeta.label !== "Converti" ? (
                        <button
                          type="button"
                          className="compact primary"
                          onClick={() => handleConvertLead(lead)}
                          data-testid={`convert-lead-${lead.id}`}
                        >
                          Convertir → devis
                        </button>
                      ) : null}
                      {isUnread ? (
                        <button
                          type="button"
                          className="compact"
                          onClick={() => handleMarkLeadRead(lead.id)}
                        >
                          Marquer lu
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        )}

        {canManageQuotes && quotesToLaunchToday.length > 0 && (
          <div
            className="card dashboard-action-card dashboard-action-card--warning"
            data-testid="dashboard-launch-today"
          >
            <div className="dashboard-action-card__header">
              <div>
                <h3>À lancer aujourd&apos;hui</h3>
                <p className="muted">
                  {quotesToLaunchToday.length} devis accepté(s) à démarrer — triés
                  par urgence livraison et priorité.
                </p>
              </div>
              <button type="button" className="ghost" onClick={goToAtelier}>
                Ouvrir l&apos;atelier →
              </button>
            </div>
            <div className="table compact-table">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Livraison</th>
                    <th>Urgence</th>
                    <th>Priorité</th>
                  </tr>
                </thead>
                <tbody>
                  {quotesToLaunchToday.slice(0, 8).map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.number}</td>
                      <td>{clientName(data, quote.clientId)}</td>
                      <td>{quote.promisedDeliveryDate || "—"}</td>
                      <td>
                        <DeliveryUrgencyBadge quote={quote} />
                      </td>
                      <td>
                        {quote.priority && quote.priority !== "normal"
                          ? quote.priority === "urgent"
                            ? "Urgente"
                            : "Haute"
                          : "Normale"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {canManageQuotes && productionQueue.total > 0 && (
          <div className="card dashboard-action-card">
            <div className="dashboard-action-card__header">
              <div>
                <h3>File d&apos;attente atelier</h3>
                <p className="muted">
                  {productionQueue.total} commande(s) acceptée(s) ou en production.
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => navigate(pageToPath("atelier"))}
              >
                Ouvrir l&apos;atelier →
              </button>
            </div>
            <div className="dashboard-production-grid">
              {productionQueue.byProcess.map((group) => (
                <div key={group.key} className="dashboard-production-group">
                  <strong>
                    {group.label}
                    <span>{group.items.length}</span>
                  </strong>
                  {group.items.length === 0 ? (
                    <p className="muted">—</p>
                  ) : (
                    <ul>
                      {group.items.slice(0, 4).map((quote) => (
                        <li key={quote.id}>
                          <span>{quote.number}</span>
                          <em>{clientName(data, quote.clientId)}</em>
                          <span className={statusClass(quote.status)}>{quote.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {canManageQuotes && (
          <DeliveryCalendarCard
            quotes={quotes}
            data={data}
            onGoToAtelier={goToAtelier}
          />
        )}

        {canManageQuotes && overdueDeliveries.length > 0 && (
          <div className="card dashboard-action-card dashboard-action-card--danger">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Livraisons en retard</h3>
                <p className="muted">
                  {overdueDeliveries.length} commande(s) dont la date de livraison prévue est dépassée.
                </p>
              </div>
              <button type="button" className="ghost" onClick={goToAtelier}>
                Ouvrir l&apos;atelier →
              </button>
            </div>
            <div className="table compact-table">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Livraison prévue</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueDeliveries.slice(0, 6).map((quote) => (
                    <tr key={quote.id}>
                      <td>{quote.number}</td>
                      <td>{clientName(data, quote.clientId)}</td>
                      <td>{quote.promisedDeliveryDate}</td>
                      <td>
                        <DeliveryUrgencyBadge quote={quote} />
                      </td>
                      <td>
                        <span className={statusClass(quote.status)}>{quote.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {canManageProducts && (
          <div className="card dashboard-action-card">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Alertes stock — produits</h3>
                <p className="muted">
                  {lowStockCount === 0
                    ? "Aucun produit fini sous le seuil minimum."
                    : `${lowStockCount} produit(s) en stock bas${outOfStockCount > 0 ? ` · ${outOfStockCount} en rupture` : ""}`}
                </p>
              </div>
              {(lowStockCount > 0 || outOfStockCount > 0) && (
                <div className="dashboard-action-card__actions">
                  <button type="button" className="ghost" onClick={goToProductsPage}>
                    Voir stock →
                  </button>
                  <button type="button" className="ghost" onClick={handleExportPurchaseOrder}>
                    Exporter bon de commande CSV
                  </button>
                  <button type="button" className="ghost" onClick={handleExportPurchaseOrderPdf}>
                    Exporter bon de commande PDF
                  </button>
                  <button type="button" className="ghost" onClick={handleCopyPurchaseOrderText}>
                    Copier bon de commande
                  </button>
                </div>
              )}
            </div>
            {lowStockProducts.length === 0 ? (
              <p className="muted">Tous les stocks sont au-dessus du seuil d'alerte.</p>
            ) : (
              <>
                <div className="table compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th>SKU</th>
                        <th>Stock</th>
                        <th>Seuil</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockProducts.map((product) => (
                        <tr key={product.id}>
                          <td>{product.name}</td>
                          <td>{product.sku || "—"}</td>
                          <td>
                            <strong>{getStock(product)}</strong>
                          </td>
                          <td>{getMinStock(product)}</td>
                          <td>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => handleOrderProduct(product)}
                            >
                              Commander
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="dashboard-kpi-cta" onClick={goToProductsPage}>
                  Voir stock →
                </button>
              </>
            )}
          </div>
        )}

        {canManageProducts && (
          <div className="card dashboard-action-card">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Consommables (encre, films, vinyle)</h3>
                <p className="muted">
                  {lowStockConsumablesCount === 0
                    ? "Tous les consommables sont au-dessus du seuil."
                    : `${lowStockConsumablesCount} consommable(s) à réapprovisionner.`}
                </p>
              </div>
              {lowStockConsumablesCount > 0 && (
                <div className="dashboard-action-card__actions">
                  <button type="button" className="ghost" onClick={goToProductsPage}>
                    Voir stock →
                  </button>
                </div>
              )}
            </div>
            {lowStockConsumables.length === 0 ? (
              <p className="muted">
                Catégorie « Consommable » ou liste dans Paramètres.
              </p>
            ) : (
              <div className="table compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Consommable</th>
                      <th>SKU</th>
                      <th>Stock</th>
                      <th>Seuil</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockConsumables.map((product) => (
                      <tr key={product.id}>
                        <td>{product.name}</td>
                        <td>{product.sku || "—"}</td>
                        <td>
                          <strong>{getStock(product)}</strong>
                        </td>
                        <td>{getMinStock(product)}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => handleOrderProduct(product)}
                          >
                            Commander
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Top produits vendus</h3>
          {productStats.length === 0 ? (
            <p className="muted">Aucune vente produit pour le moment.</p>
          ) : (
            <div className="bar-list">
              {productStats.map((product) => (
                <div className="bar-row" key={product.id}>
                  <div className="bar-info">
                    <strong>{product.name}</strong>
                    <span>
                      {product.quantity} vendu(s) — {money(product.revenue)} HT
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.max(6, (product.revenue / maxProductRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Meilleurs clients</h3>
          {clientStats.length === 0 ? (
            <p className="muted">Aucune facture client pour le moment.</p>
          ) : (
            <div className="bar-list">
              {clientStats.map((client) => (
                <div className="bar-row" key={client.id}>
                  <div className="bar-info">
                    <strong>{client.name}</strong>
                    <span>
                      {client.invoiceCount} facture(s) — {money(client.total)}{" "}
                      TTC
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.max(6, (client.total / maxClientRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Ventes par catégorie</h3>
          {categoryStats.length === 0 ? (
            <p className="muted">Aucune vente par catégorie pour le moment.</p>
          ) : (
            <div className="bar-list">
              {categoryStats.map((category) => (
                <div className="bar-row" key={category.id}>
                  <div className="bar-info">
                    <strong>{category.name}</strong>
                    <span>
                      {category.quantity} article(s) —{" "}
                      {money(category.revenue)} HT
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.max(6, (category.revenue / maxCategoryRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Dernières factures</h3>
          {invoices.length === 0 ? (
            <p className="muted">Aucune facture pour le moment.</p>
          ) : (
            <div className="table compact-table">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Client</th>
                    <th>Total TTC</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices
                    .slice(-6)
                    .reverse()
                    .map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>{clientName(data, invoice.clientId)}</td>
                        <td>{money(invoice.totalTTC)}</td>
                        <td>
                          <span className={statusClass(invoice.status)}>
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
