import { useEffect, useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import ClientFileLibrary from "./ClientFileLibrary";
import { canDeleteData } from "../services/authService";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";
import { isRequired, validateFields } from "../utils/validation";
import { filterCreditNotesByClient } from "../utils/creditNotes";
import { filterAfterSalesByClient } from "../utils/afterSales";
import { computeInvoiceProfitability } from "../utils/profitability";
import { customerApplicationService } from "../application/CustomerApplicationService";

function statusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value.includes("vip")) return "vip";
  if (value.includes("actif")) return "client";
  if (value.includes("prospect")) return "quote";
  if (value.includes("accept")) return "client";
  if (value.includes("pay")) return "client";
  if (value.includes("impay")) return "danger";
  if (value.includes("retard")) return "danger";
  if (value.includes("inactif")) return "danger";

  return "client";
}

function money(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function docDate(doc) {
  return doc?.date || doc?.createdAt || doc?.updatedAt || "";
}

function docTotal(doc) {
  return Number(doc?.totalTTC || doc?.total || doc?.amount || 0);
}

function isAcceptedQuote(quote) {
  const status = String(quote?.status || "").toLowerCase();
  return (
    status.includes("accept") ||
    status.includes("valid") ||
    status.includes("sign")
  );
}

function isRejectedQuote(quote) {
  const status = String(quote?.status || "").toLowerCase();
  return (
    status.includes("refus") ||
    status.includes("rejet") ||
    status.includes("perdu")
  );
}

function isPaidInvoice(invoice) {
  const status = String(invoice?.status || "").toLowerCase();
  return (
    status.includes("pay") || status.includes("régl") || status.includes("regl")
  );
}

function isUnpaidInvoice(invoice) {
  const status = String(invoice?.status || "").toLowerCase();
  return (
    status.includes("impay") ||
    status.includes("non payé") ||
    status.includes("non paye") ||
    status.includes("en attente") ||
    status.includes("retard")
  );
}

const emptyClientForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  status: "Prospect",
  clientType: "Professionnel",
  website: "",
  vat: "",
  taxRateOverride: "",
  zip: "",
  city: "",
  country: "Luxembourg",
  notes: "",
};

export default function Clients({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  setPage,
}) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(() => {
    const pending = localStorage.getItem("crm_open_client_id");
    if (pending) {
      localStorage.removeItem("crm_open_client_id");
      return pending;
    }
    return null;
  });

  useEffect(() => {
    function onOpenClient(e) {
      const id = e.detail?.id;
      if (id) {
        localStorage.removeItem("crm_open_client_id");
        setSelectedClientId(id);
        setClientTab("infos");
      }
    }
    function onNewItem(e) {
      e.preventDefault();
      setShowClientForm(true);
      setSelectedClientId(null);
    }
    window.addEventListener("crm:openClient", onOpenClient);
    window.addEventListener("crm:new-item", onNewItem);
    return () => {
      window.removeEventListener("crm:openClient", onOpenClient);
      window.removeEventListener("crm:new-item", onNewItem);
    };
  }, []);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [clientTab, setClientTab] = useState("infos");
  const [form, setForm] = useState(emptyClientForm);
  const [showClientForm, setShowClientForm] = useState(false);

  const itemsPerPage = 25;

  const clientDocIndex = useMemo(() => {
    const map = new Map();

    function append(clientId, value) {
      if (!clientId || !value) return;
      const key = String(clientId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(String(value).toLowerCase());
    }

    for (const quote of data.quotes || []) {
      append(quote.clientId, quote.number);
      append(quote.clientId, quote.reference);
    }
    for (const invoice of data.invoices || []) {
      append(invoice.clientId, invoice.number);
      append(invoice.clientId, invoice.reference);
    }

    return map;
  }, [data.quotes, data.invoices]);

  const clients = (data.clients || [])
    .filter((client) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;

      const baseMatch = [
        client.name,
        client.email,
        client.phone,
        client.company,
        client.status,
        client.address,
        client.clientType,
        client.website,
        client.vat,
        client.zip,
        client.city,
        client.country,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);

      if (baseMatch) return true;

      const docNumbers = clientDocIndex.get(String(client.id)) || [];
      return docNumbers.some((entry) => entry.includes(term));
    })
    .sort((a, b) => {
      if (sortBy === "nameAsc")
        return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "nameDesc")
        return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "dateDesc")
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "dateAsc")
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "status")
        return String(a.status || "").localeCompare(String(b.status || ""));
      return 0;
    });

  const clientTotalPages = Math.max(
    1,
    Math.ceil(clients.length / itemsPerPage),
  );
  const clientPage = Math.min(currentPage, clientTotalPages);
  const paginatedClients = clients.slice(
    (clientPage - 1) * itemsPerPage,
    clientPage * itemsPerPage,
  );
  const selectedClient = (data.clients || []).find(
    (client) => client.id === selectedClientId,
  );

  const selectedClientInvoices = useMemo(() => {
    if (!selectedClient) return [];

    return (data.invoices || [])
      .filter(
        (invoice) => String(invoice.clientId) === String(selectedClient.id),
      )
      .sort((a, b) => new Date(docDate(b) || 0) - new Date(docDate(a) || 0));
  }, [data.invoices, selectedClient]);

  const clientPriceHistory = useMemo(() => {
    if (!selectedClient) return [];
    const map = new Map();
    for (const inv of selectedClientInvoices) {
      for (const line of inv.lines || []) {
        const key = line.description || line.productId || "?";
        if (!map.has(key))
          map.set(key, { description: key, prices: [], dates: [] });
        const entry = map.get(key);
        if (line.price != null) entry.prices.push(Number(line.price));
        if (inv.date) entry.dates.push(inv.date);
      }
    }
    return [...map.values()]
      .filter((e) => e.prices.length > 0)
      .map((e) => ({
        description: e.description,
        count: e.prices.length,
        avgPrice: e.prices.reduce((s, p) => s + p, 0) / e.prices.length,
        minPrice: Math.min(...e.prices),
        maxPrice: Math.max(...e.prices),
        lastPrice: e.prices[0],
        lastDate: e.dates[0] || "",
      }))
      .sort((a, b) => b.count - a.count);
  }, [selectedClientInvoices, selectedClient]);

  const selectedClientQuotes = useMemo(() => {
    if (!selectedClient) return [];

    return (data.quotes || [])
      .filter((quote) => String(quote.clientId) === String(selectedClient.id))
      .sort((a, b) => new Date(docDate(b) || 0) - new Date(docDate(a) || 0));
  }, [data.quotes, selectedClient]);

  const selectedClientDeliveryNotes = useMemo(() => {
    if (!selectedClient) return [];

    return (data.deliveryNotes || [])
      .filter((note) => String(note.clientId) === String(selectedClient.id))
      .sort((a, b) => new Date(docDate(b) || 0) - new Date(docDate(a) || 0));
  }, [data.deliveryNotes, selectedClient]);

  const selectedClientCreditNotes = useMemo(() => {
    if (!selectedClient) return [];
    return filterCreditNotesByClient(data.creditNotes, selectedClient.id);
  }, [data.creditNotes, selectedClient]);

  const selectedClientSavCases = useMemo(() => {
    if (!selectedClient) return [];
    return filterAfterSalesByClient(data.afterSalesCases, selectedClient.id);
  }, [data.afterSalesCases, selectedClient]);

  const selectedClientPayments = useMemo(() => {
    if (!selectedClient) return [];
    const invoiceIds = new Set(
      selectedClientInvoices.map((invoice) => String(invoice.id)),
    );
    return (data.payments || [])
      .filter(
        (payment) =>
          String(payment.clientId || "") === String(selectedClient.id) ||
          invoiceIds.has(String(payment.invoiceId || "")),
      )
      .sort(
        (a, b) =>
          new Date(b.date || b.createdAt || 0) -
          new Date(a.date || a.createdAt || 0),
      );
  }, [data.payments, selectedClient, selectedClientInvoices]);

  const selectedClientFiles = useMemo(() => {
    if (!selectedClient) return [];
    return (data.clientFiles || [])
      .filter((file) => String(file.clientId) === String(selectedClient.id))
      .sort(
        (a, b) =>
          new Date(b.uploadedAt || b.createdAt || 0) -
          new Date(a.uploadedAt || a.createdAt || 0),
      );
  }, [data.clientFiles, selectedClient]);

  const selectedClientNotes = useMemo(() => {
    if (!selectedClient) return [];
    return (data.clientNotes || [])
      .filter((note) => String(note.clientId) === String(selectedClient.id))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [data.clientNotes, selectedClient]);

  const selectedClientLeads = useMemo(() => {
    if (!selectedClient) return [];
    const clientEmail = String(selectedClient.email || "")
      .trim()
      .toLowerCase();
    return (data.leads || [])
      .filter(
        (lead) =>
          String(lead.clientId || "") === String(selectedClient.id) ||
          (clientEmail &&
            String(lead.email || "")
              .trim()
              .toLowerCase() === clientEmail),
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [data.leads, selectedClient]);

  const clientHistory = useMemo(() => {
    const quotes = selectedClientQuotes.map((quote) => ({
      id: `quote-${quote.id}`,
      type: "Devis",
      docType: "quote",
      doc: quote,
      icon: "🧾",
      title: quote.number || quote.reference || "Devis",
      status: quote.status || "Sans statut",
      date: docDate(quote),
      total: docTotal(quote),
    }));

    const invoices = selectedClientInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "Facture",
      docType: "invoice",
      doc: invoice,
      icon: "💶",
      title: invoice.number || invoice.reference || "Facture",
      status: invoice.status || "Sans statut",
      date: docDate(invoice),
      total: docTotal(invoice),
    }));

    const deliveryNotes = selectedClientDeliveryNotes.map((note) => ({
      id: `delivery-${note.id}`,
      type: "Bon de livraison",
      docType: "delivery",
      doc: note,
      icon: "📦",
      title: note.number || note.reference || "BL",
      status: note.status || "Émis",
      date: docDate(note),
      total: 0,
    }));

    const created = selectedClient
      ? [
          {
            id: `client-${selectedClient.id}`,
            type: "Client",
            icon: "👤",
            title: "Client créé",
            status: selectedClient.status || "Sans statut",
            date: selectedClient.createdAt,
            total: 0,
          },
        ]
      : [];

    const creditNotes = selectedClientCreditNotes.map((note) => ({
      id: `credit-${note.id}`,
      type: "Avoir",
      docType: "credit",
      doc: note,
      icon: "📉",
      title: note.number || "Avoir",
      status: note.status || "brouillon",
      date: note.date || note.createdAt,
      total: -docTotal(note),
    }));

    const savCases = selectedClientSavCases.map((entry) => ({
      id: `sav-${entry.id}`,
      type: "SAV",
      docType: "sav",
      doc: entry,
      icon: "🔧",
      title: entry.subject || entry.type || "SAV",
      status: entry.status || "Ouvert",
      date: entry.openedAt || entry.updatedAt,
      total: 0,
    }));

    const payments = selectedClientPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      type: "Paiement",
      icon: "Paiement",
      tone:
        payment.status === "Recu" || payment.status === "Reçu"
          ? "green"
          : "purple",
      title: payment.invoiceNumber || payment.method || "Paiement",
      status: payment.status || payment.method || "Enregistre",
      date: payment.date || payment.createdAt,
      total: Number(payment.amount || 0),
      detail:
        payment.notes || (payment.method ? `Mode : ${payment.method}` : ""),
    }));

    const files = selectedClientFiles.map((file) => ({
      id: `file-${file.id}`,
      type: "Fichier",
      icon: "Fichier",
      tone: "purple",
      title: file.name || "Fichier client",
      status: file.source || "Ajoute",
      date: file.uploadedAt || file.createdAt,
      total: 0,
      detail: file.mimeType || "",
      href: file.url || "",
    }));

    const noteLabels = {
      note: "Note",
      call: "Appel",
      email: "Email",
    };
    const noteIcons = {
      note: "Note",
      call: "Appel",
      email: "Email",
    };
    const notes = selectedClientNotes.map((note) => {
      const kind = note.kind || "note";
      return {
        id: `note-${note.id}`,
        type: noteLabels[kind] || "Note",
        icon: noteIcons[kind] || "Note",
        tone: kind === "call" ? "green" : kind === "email" ? "purple" : "",
        title: String(note.text || "").slice(0, 70) || "Note client",
        status: "Saisi",
        date: note.createdAt,
        total: 0,
        detail: note.text || "",
      };
    });

    const leads = selectedClientLeads.map((lead) => ({
      id: `lead-${lead.id}`,
      type: "Lead",
      icon: "Lead",
      tone: "green",
      title: lead.metadata?.projectName || lead.email || "Lead",
      status: lead.status || "nouveau",
      date: lead.convertedAt || lead.createdAt,
      total: Number(
        lead.estimatedAmount || lead.metadata?.estimatedAmount || 0,
      ),
      detail: `${lead.source || "site e-commerce"}${lead.probability ? ` · ${lead.probability}%` : ""}`,
    }));

    const emailEvents = [
      ...selectedClientQuotes,
      ...selectedClientInvoices,
      ...selectedClientDeliveryNotes,
    ].flatMap((doc) => {
      const label = doc.number || doc.reference || "Document";
      const events = [];
      if (doc.sentAt || doc.emailSentAt) {
        events.push({
          id: `email-sent-${doc.id}`,
          type: "Email",
          icon: "Email",
          tone: "purple",
          title: `${label} envoye`,
          status: "Envoye",
          date: doc.emailSentAt || doc.sentAt,
          total: 0,
        });
      }
      if (doc.emailReadAt) {
        events.push({
          id: `email-read-${doc.id}`,
          type: "Email",
          icon: "Email",
          tone: "green",
          title: `${label} lu`,
          status: "Lu",
          date: doc.emailReadAt,
          total: 0,
        });
      }
      if (doc.lastReminderAt || doc.lastReminderDate) {
        events.push({
          id: `email-reminder-${doc.id}`,
          type: "Relance",
          icon: "Relance",
          tone: "purple",
          title: `${label} relance`,
          status: `Relance n°${Number(doc.reminderCount || 1)}`,
          date: doc.lastReminderAt || doc.lastReminderDate,
          total: 0,
        });
      }
      return events;
    });

    return [
      ...quotes,
      ...invoices,
      ...deliveryNotes,
      ...creditNotes,
      ...savCases,
      ...payments,
      ...files,
      ...notes,
      ...leads,
      ...emailEvents,
      ...created,
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [
    selectedClient,
    selectedClientInvoices,
    selectedClientQuotes,
    selectedClientDeliveryNotes,
    selectedClientCreditNotes,
    selectedClientSavCases,
    selectedClientPayments,
    selectedClientFiles,
    selectedClientNotes,
    selectedClientLeads,
  ]);

  const selectedClientInvoiceTotal = selectedClientInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0,
  );

  const _selectedClientQuoteTotal = selectedClientQuotes.reduce(
    (sum, quote) => sum + docTotal(quote),
    0,
  );

  const selectedClientPaidInvoices =
    selectedClientInvoices.filter(isPaidInvoice);
  const selectedClientUnpaidInvoices =
    selectedClientInvoices.filter(isUnpaidInvoice);
  const selectedClientAcceptedQuotes =
    selectedClientQuotes.filter(isAcceptedQuote);
  const selectedClientLastInvoice = selectedClientInvoices[0];
  const _selectedClientLastQuote = selectedClientQuotes[0];
  const _selectedClientLastOrder =
    selectedClientInvoices[0] || selectedClientAcceptedQuotes[0] || null;

  const _selectedClientPaidTotal = selectedClientPaidInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0,
  );

  const _clientAverageBasket =
    selectedClientInvoices.length > 0
      ? selectedClientInvoiceTotal / selectedClientInvoices.length
      : 0;

  const _clientConversionRate =
    selectedClientQuotes.length > 0
      ? (selectedClientAcceptedQuotes.length / selectedClientQuotes.length) *
        100
      : 0;

  const clientUnpaidAmount = selectedClientUnpaidInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0,
  );

  const clientCommercialSummary = useMemo(() => {
    if (!selectedClient) {
      return {
        revenueHT: 0,
        marginHT: 0,
        marginRate: 0,
        unknownCostRevenueHT: 0,
        acceptedQuotes: 0,
        rejectedQuotes: 0,
        quoteConversionRate: 0,
        topProducts: [],
        lastReminders: [],
        recentNotes: [],
      };
    }

    const profitabilityRows = selectedClientInvoices.map((invoice) =>
      computeInvoiceProfitability(invoice, data),
    );
    const knownRows = profitabilityRows.filter(
      (row) => row.costSource !== "unknown",
    );
    const revenueHT = knownRows.reduce(
      (sum, row) => sum + Number(row.revenueHT || 0),
      0,
    );
    const marginHT = knownRows.reduce(
      (sum, row) => sum + Number(row.marginHT || 0),
      0,
    );
    const unknownCostRevenueHT = profitabilityRows
      .filter((row) => row.costSource === "unknown")
      .reduce((sum, row) => sum + Number(row.revenueHT || 0), 0);

    const productMap = new Map();
    for (const invoice of selectedClientInvoices) {
      for (const line of invoice.lines || []) {
        const key = line.productId || line.description || "Produit libre";
        const current = productMap.get(key) || {
          key,
          name: line.description || "Produit libre",
          quantity: 0,
          revenueHT: 0,
          lastDate: "",
        };
        current.quantity += Number(line.quantity || 0);
        current.revenueHT += Number(
          line.totalHT ||
            line.subtotal ||
            Number(line.quantity || 0) * Number(line.price || 0),
        );
        const date = docDate(invoice);
        if (
          !current.lastDate ||
          new Date(date || 0) > new Date(current.lastDate || 0)
        ) {
          current.lastDate = date;
        }
        productMap.set(key, current);
      }
    }

    const acceptedQuotes = selectedClientQuotes.filter(isAcceptedQuote).length;
    const rejectedQuotes = selectedClientQuotes.filter(isRejectedQuote).length;
    const lastReminders = [...selectedClientQuotes, ...selectedClientInvoices]
      .filter(
        (doc) =>
          doc.lastReminderAt || doc.lastReminderDate || doc.reminderCount,
      )
      .map((doc) => ({
        id: doc.id,
        number: doc.number || doc.reference || "Document",
        date:
          doc.lastReminderAt ||
          doc.lastReminderDate ||
          doc.updatedAt ||
          doc.date,
        count: Number(doc.reminderCount || 1),
        type: selectedClientInvoices.some(
          (invoice) => String(invoice.id) === String(doc.id),
        )
          ? "Facture"
          : "Devis",
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 5);

    return {
      revenueHT: Math.round(revenueHT * 100) / 100,
      marginHT: Math.round(marginHT * 100) / 100,
      marginRate:
        revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0,
      unknownCostRevenueHT: Math.round(unknownCostRevenueHT * 100) / 100,
      acceptedQuotes,
      rejectedQuotes,
      quoteConversionRate:
        selectedClientQuotes.length > 0
          ? Math.round((acceptedQuotes / selectedClientQuotes.length) * 1000) /
            10
          : 0,
      topProducts: [...productMap.values()]
        .map((entry) => ({
          ...entry,
          revenueHT: Math.round(entry.revenueHT * 100) / 100,
        }))
        .sort((a, b) => b.revenueHT - a.revenueHT)
        .slice(0, 6),
      lastReminders,
      recentNotes: selectedClientNotes.slice(0, 4),
    };
  }, [
    data,
    selectedClient,
    selectedClientInvoices,
    selectedClientNotes,
    selectedClientQuotes,
  ]);

  const _topProducts = useMemo(() => {
    const stats = {};

    selectedClientInvoices.forEach((invoice) => {
      (invoice.lines || []).forEach((line) => {
        const key = line.description || "Sans nom";
        stats[key] = (stats[key] || 0) + Number(line.quantity || 0);
      });
    });

    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [selectedClientInvoices]);

  function reset() {
    setEditing(null);
    setForm(emptyClientForm);
    setShowClientForm(false);
  }

  function submit(e) {
    e.preventDefault();

    const validationError = validateFields(form, {
      name: [
        { test: isRequired, message: "Le nom du client est obligatoire." },
      ],
    });
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const result = customerApplicationService.save(data, form, {
      customerId: editing || "",
    });
    const { customer: savedCustomer, created: _created, ...nextData } = result;
    setData(nextData);

    if (editing) {
      logActivity?.("Modification client", form.name);
    } else {
      setSelectedClientId(savedCustomer.id);
      setClientTab("infos");
      logActivity?.("Création client", savedCustomer.name);
    }

    reset();
  }

  function edit(client) {
    setEditing(client.id);
    setShowClientForm(true);

    setForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      company: client.company || "",
      address: client.address || "",
      status: client.status || "Prospect",
      clientType: client.clientType || "Professionnel",
      website: client.website || "",
      vat: client.vat || "",
      taxRateOverride:
        client.taxRateOverride === null || client.taxRateOverride === undefined
          ? ""
          : String(client.taxRateOverride),
      zip: client.zip || "",
      city: client.city || "",
      country: client.country || "Luxembourg",
      notes: client.notes || "",
    });
  }

  async function remove(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (
      !(await confirmAction({
        title: "Supprimer le client",
        message: "Cette fiche client sera supprimée.",
        detail:
          "Les documents existants conservent leurs informations, mais le client ne sera plus disponible dans la liste.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    )
      return;

    const removedClient = (data.clients || []).find(
      (client) => client.id === id,
    );

    setData(customerApplicationService.remove(data, id));

    logActivity?.("Suppression client", removedClient?.name || id);

    if (selectedClientId === id) {
      setSelectedClientId(null);
    }
  }

  function goToDocumentPage(pageName) {
    if (!selectedClient) return;

    localStorage.setItem("crm_prefill_client_id", selectedClient.id);
    setPage?.(pageName);
  }

  function openDocument(doc, type) {
    if (!doc) return;

    localStorage.setItem("crm_open_document_id", doc.id);
    localStorage.setItem("crm_open_document_type", type);

    if (type === "quote") {
      setPage?.("quotes", {
        state: { openDocumentId: doc.id, openDocumentType: "quote" },
      });
      return;
    }
    if (type === "delivery") {
      setPage?.("quotes", {
        state: { openDocumentId: doc.id, openDocumentType: "delivery" },
      });
      return;
    }
    setPage?.("invoices", {
      state: { openDocumentId: doc.id, openDocumentType: "invoice" },
    });
  }

  function remindClient(mode = "copy") {
    if (!selectedClient) return;

    const invoices = selectedClientUnpaidInvoices;

    if (invoices.length === 0) {
      showToast("Aucune facture impayée.", "info");
      return;
    }

    const invoiceList = invoices
      .map((inv) => `${inv.number} - ${money(docTotal(inv))}`)
      .join("\n");

    const text = `Bonjour ${selectedClient.name},

Nous vous rappelons que les factures suivantes restent impayées :

${invoiceList}

Montant total dû :
${money(clientUnpaidAmount)}

Merci.

AC Creation`;

    if (mode === "copy") {
      navigator.clipboard.writeText(text);
      showToast("Relance copiée", "success");
      return;
    }

    const subject = encodeURIComponent("Relance facture impayée - AC Creation");
    const body = encodeURIComponent(text);

    window.open(
      `mailto:${selectedClient.email || ""}?subject=${subject}&body=${body}`,
    );
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="clients-page">
      <div className="page-header">
        <div>
          <h2>Clients</h2>
          <p>Ajoute tes prospects et clients.</p>
        </div>
      </div>

      <div className="clients-form-toggle">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(emptyClientForm);
            setShowClientForm(true);
          }}
        >
          + Nouveau client
        </button>
      </div>

      {showClientForm && (
        <form className="card form-grid client-form-panel" onSubmit={submit}>
          <input
            placeholder="Nom client *"
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateForm("email", e.target.value)}
          />
          <input
            placeholder="Téléphone"
            value={form.phone}
            onChange={(e) => updateForm("phone", e.target.value)}
          />
          <input
            placeholder="Société"
            value={form.company}
            onChange={(e) => updateForm("company", e.target.value)}
          />
          <input
            placeholder="Site web"
            value={form.website}
            onChange={(e) => updateForm("website", e.target.value)}
          />
          <input
            placeholder="TVA (n°)"
            value={form.vat}
            onChange={(e) => updateForm("vat", e.target.value)}
          />
          <label className="documents-field">
            <span>Taux TVA sur devis/factures</span>
            <select
              value={
                form.taxRateOverride === ""
                  ? "default"
                  : String(form.taxRateOverride)
              }
              onChange={(e) =>
                updateForm(
                  "taxRateOverride",
                  e.target.value === "default" ? "" : e.target.value,
                )
              }
            >
              <option value="default">Par défaut (paramètres)</option>
              <option value="17">17 % — TVA Luxembourg</option>
              <option value="0">0 % — autoliquidation / intra-UE B2B</option>
            </select>
          </label>
          <input
            placeholder="Adresse"
            value={form.address}
            onChange={(e) => updateForm("address", e.target.value)}
          />
          <input
            placeholder="Code postal"
            value={form.zip}
            onChange={(e) => updateForm("zip", e.target.value)}
          />
          <input
            placeholder="Ville"
            value={form.city}
            onChange={(e) => updateForm("city", e.target.value)}
          />
          <input
            placeholder="Pays"
            value={form.country}
            onChange={(e) => updateForm("country", e.target.value)}
          />

          <select
            value={form.clientType}
            onChange={(e) => updateForm("clientType", e.target.value)}
          >
            <option>Professionnel</option>
            <option>Particulier</option>
            <option>Association</option>
          </select>

          <select
            value={form.status}
            onChange={(e) => updateForm("status", e.target.value)}
          >
            <option>Prospect</option>
            <option>Client</option>
            <option>VIP</option>
            <option>Inactif</option>
          </select>

          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
          />

          <button className="primary">
            {editing ? "Modifier" : "Ajouter"}
          </button>
          <button type="button" onClick={reset}>
            Annuler
          </button>
        </form>
      )}

      <div className="clients-toolbar">
        <input
          className="search"
          placeholder="Rechercher : nom, email, téléphone, n° devis/facture…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />

        <select
          className="client-sort"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="nameAsc">Nom : A → Z</option>
          <option value="nameDesc">Nom : Z → A</option>
          <option value="dateDesc">Date : récent</option>
          <option value="dateAsc">Date : ancien</option>
          <option value="status">Statut</option>
        </select>
      </div>

      <div className="two-columns clients-layout">
        <div className="table card clients-table-card">
          <p className="muted">{clients.length} client(s) trouvé(s)</p>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />

          <div className="clients-erp-list">
            {paginatedClients.map((client) => {
              const clientInvoices = (data.invoices || []).filter(
                (invoice) => String(invoice.clientId) === String(client.id),
              );

              const clientCa = clientInvoices.reduce(
                (sum, invoice) => sum + docTotal(invoice),
                0,
              );

              const isSelected = selectedClientId === client.id;

              return (
                <div
                  key={client.id}
                  className={
                    isSelected ? "client-erp-row selected" : "client-erp-row"
                  }
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setClientTab("infos");
                  }}
                >
                  <div className="client-erp-avatar">
                    {(client.name || "?")
                      .split(" ")
                      .slice(0, 2)
                      .map((value) => value[0])
                      .join("")
                      .toUpperCase()}
                  </div>

                  <div className="client-erp-main">
                    <div className="client-erp-name-row">
                      <strong>{client.name || "Sans nom"}</strong>
                      <span
                        className={"status-badge " + statusClass(client.status)}
                      >
                        {client.status || "Prospect"}
                      </span>
                    </div>

                    <span className="client-erp-sub">
                      {client.email || client.phone || "Aucun contact"}
                    </span>

                    <div className="client-erp-meta">
                      <span>
                        {client.company || client.clientType || "Client"}
                      </span>
                      <span>CA : {money(clientCa)}</span>
                    </div>
                  </div>

                  <div
                    className="client-erp-actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button type="button" onClick={() => edit(client)}>
                      Modifier
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(client.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />
        </div>

        <div className="card client-side-card">
          <div className="client-header erp-client-header">
            <div className="erp-client-left">
              <div className="client-avatar">
                {(selectedClient?.name || "?")
                  .split(" ")
                  .slice(0, 2)
                  .map((value) => value[0])
                  .join("")
                  .toUpperCase()}
              </div>

              <div className="erp-client-title">
                <div className="erp-client-top">
                  <h2>{selectedClient?.name || "Fiche client"}</h2>

                  {selectedClient && (
                    <span
                      className={
                        "status-badge " + statusClass(selectedClient.status)
                      }
                    >
                      {selectedClient.status || "Client"}
                    </span>
                  )}
                </div>

                {selectedClient && (
                  <span className="erp-created">
                    Client depuis le {formatDate(selectedClient.createdAt)}
                  </span>
                )}
              </div>
            </div>

            {selectedClient && (
              <button
                className="erp-print-btn"
                onClick={() => {
                  if (!selectedClient) return;

                  const win = window.open("", "_blank");

                  win.document.write(`
      <html>
        <head>
          <title>Fiche client</title>
         <style>
body{
  font-family:Arial,sans-serif;
  padding:22px;
  color:#111827;
  background:white;
}

.header{
  display:flex;
  align-items:center;
  gap:18px;
  border-bottom:2px solid #eee;
  padding-bottom:14px;
  margin-bottom:16px;
}

.avatar{
  width:58px;
  height:58px;
  border-radius:50%;
  background:linear-gradient(135deg,#f472b6,#8b5cf6);
  color:white;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:20px;
  font-weight:700;
}

h1{
  margin:0;
  font-size:24px;
}

.badge{
  display:inline-block;
  padding:4px 10px;
  border-radius:20px;
  background:#dcfce7;
  color:#15803d;
  font-weight:700;
  margin-top:6px;
}

.grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:10px;
  margin-top:14px;
}

.box{
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:10px 12px;
  background:#f8fafc;
  page-break-inside:avoid;
}

.box strong{
  display:block;
  font-size:10px;
  color:#64748b;
  margin-bottom:4px;
  text-transform:uppercase;
}

.box span{
  font-size:13px;
  font-weight:600;
}

.notes-box{
  margin-top:10px;
}

@page{
  size:A4;
  margin:10mm;
}
</style>
        </head>
        <body>
          <div class="header">
            <div class="avatar">
              ${(selectedClient.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1>${selectedClient.name || "-"}</h1>
              <div>Client depuis le ${formatDate(selectedClient.createdAt)}</div>
              <div class="badge">${selectedClient.status || "Client"}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box"><strong>Société</strong><span>${selectedClient.company || "-"}</span></div>
            <div class="box"><strong>Type client</strong><span>${selectedClient.clientType || "-"}</span></div>
            <div class="box"><strong>Email</strong><span>${selectedClient.email || "-"}</span></div>
            <div class="box"><strong>Téléphone</strong><span>${selectedClient.phone || "-"}</span></div>
            <div class="box"><strong>Site web</strong><span>${selectedClient.website || "-"}</span></div>
            <div class="box"><strong>TVA</strong><span>${selectedClient.vat || "-"}</span></div>
            <div class="box"><strong>Adresse</strong><span>${selectedClient.address || "-"}</span></div>
            <div class="box"><strong>Ville</strong><span>${selectedClient.zip || ""} ${selectedClient.city || ""}</span></div>
            <div class="box"><strong>Pays</strong><span>${selectedClient.country || "-"}</span></div>
            <div class="box"><strong>CA total</strong><span>${money(selectedClientInvoiceTotal)}</span></div>
            <div class="box"><strong>Devis</strong><span>${selectedClientQuotes.length}</span></div>
            <div class="box"><strong>Factures</strong><span>${selectedClientInvoices.length}</span></div>
          </div>

          <div class="box notes-box">
            <strong>Notes</strong>
            <span>${selectedClient.notes || "-"}</span>
          </div>
        </body>
      </html>
    `);

                  win.document.close();

                  setTimeout(() => {
                    win.print();
                  }, 300);
                }}
              >
                🖨 Imprimer la fiche
              </button>
            )}
          </div>

          {selectedClient && (
            <div className="client-mini-stats">
              <div>
                <strong>{selectedClientQuotes.length}</strong>
                <span>Devis</span>
              </div>

              <div>
                <strong>{selectedClientInvoices.length}</strong>
                <span>Factures</span>
              </div>

              <div>
                <strong>{money(selectedClientInvoiceTotal)}</strong>
                <span>CA total</span>
              </div>

              <div>
                <strong>
                  {formatDate(
                    selectedClientLastInvoice?.date ||
                      selectedClientLastInvoice?.createdAt,
                  )}
                </strong>
                <span>Dernière facture</span>
              </div>
            </div>
          )}

          {!selectedClient ? (
            <p className="muted">Clique sur un client pour voir sa fiche.</p>
          ) : (
            <>
              <div className="client-tabs">
                <button
                  type="button"
                  className={clientTab === "commercial" ? "active" : ""}
                  onClick={() => setClientTab("commercial")}
                >
                  Commercial
                </button>
                <button
                  type="button"
                  className={clientTab === "infos" ? "active" : ""}
                  onClick={() => setClientTab("infos")}
                >
                  ℹ Informations
                </button>
                <button
                  type="button"
                  className={clientTab === "contact" ? "active" : ""}
                  onClick={() => setClientTab("contact")}
                >
                  📞 Contact
                </button>
                <button
                  type="button"
                  className={clientTab === "address" ? "active" : ""}
                  onClick={() => setClientTab("address")}
                >
                  📍 Adresse
                </button>
                <button
                  type="button"
                  className={clientTab === "documents" ? "active" : ""}
                  onClick={() => setClientTab("documents")}
                >
                  📄 Documents
                </button>
                <button
                  type="button"
                  className={clientTab === "history" ? "active" : ""}
                  onClick={() => setClientTab("history")}
                >
                  🕘 Historique
                </button>
                <button
                  type="button"
                  className={clientTab === "files" ? "active" : ""}
                  onClick={() => setClientTab("files")}
                >
                  📂 Fichiers
                </button>
                <button
                  type="button"
                  className={clientTab === "notes" ? "active" : ""}
                  onClick={() => setClientTab("notes")}
                >
                  📝 Notes
                </button>
                <button
                  type="button"
                  className={clientTab === "prices" ? "active" : ""}
                  onClick={() => setClientTab("prices")}
                >
                  💰 Historique prix
                </button>
              </div>

              <div className="client-card">
                {clientTab === "commercial" && (
                  <div className="client-commercial">
                    <div className="client-doc-top">
                      <DashboardCard
                        label="CA HT suivi"
                        value={money(clientCommercialSummary.revenueHT)}
                      />
                      <DashboardCard
                        label="Marge connue"
                        value={`${money(clientCommercialSummary.marginHT)} (${clientCommercialSummary.marginRate} %)`}
                      />
                      <DashboardCard
                        label="CA sans coût"
                        value={money(
                          clientCommercialSummary.unknownCostRevenueHT,
                        )}
                        danger={
                          clientCommercialSummary.unknownCostRevenueHT > 0
                        }
                      />
                      <DashboardCard
                        label="Conversion devis"
                        value={`${clientCommercialSummary.quoteConversionRate} %`}
                      />
                      <DashboardCard
                        label="Devis acceptés"
                        value={clientCommercialSummary.acceptedQuotes}
                      />
                      <DashboardCard
                        label="Devis refusés"
                        value={clientCommercialSummary.rejectedQuotes}
                        danger={clientCommercialSummary.rejectedQuotes > 0}
                      />
                    </div>

                    <div className="client-commercial-grid">
                      <div className="client-history-section">
                        <h4>Produits achetés</h4>
                        <div className="client-commercial-list">
                          {clientCommercialSummary.topProducts.length === 0 ? (
                            <p className="muted">Aucun produit facturé.</p>
                          ) : (
                            clientCommercialSummary.topProducts.map(
                              (product) => (
                                <div
                                  key={product.key}
                                  className="client-commercial-row"
                                >
                                  <div>
                                    <strong>{product.name}</strong>
                                    <span>
                                      {product.quantity} unité(s) · dernier
                                      achat {formatDate(product.lastDate)}
                                    </span>
                                  </div>
                                  <strong>{money(product.revenueHT)}</strong>
                                </div>
                              ),
                            )
                          )}
                        </div>
                      </div>

                      <div className="client-history-section">
                        <h4>Dernières relances</h4>
                        <div className="client-commercial-list">
                          {clientCommercialSummary.lastReminders.length ===
                          0 ? (
                            <p className="muted">Aucune relance enregistrée.</p>
                          ) : (
                            clientCommercialSummary.lastReminders.map(
                              (reminder) => (
                                <div
                                  key={`${reminder.type}-${reminder.id}`}
                                  className="client-commercial-row"
                                >
                                  <div>
                                    <strong>
                                      {reminder.type} {reminder.number}
                                    </strong>
                                    <span>
                                      Relance n°{reminder.count} ·{" "}
                                      {formatDate(reminder.date)}
                                    </span>
                                  </div>
                                </div>
                              ),
                            )
                          )}
                        </div>
                      </div>

                      <div className="client-history-section">
                        <h4>Notes internes récentes</h4>
                        <div className="client-commercial-list">
                          {clientCommercialSummary.recentNotes.length === 0 &&
                          !selectedClient.notes ? (
                            <p className="muted">Aucune note interne.</p>
                          ) : (
                            <>
                              {selectedClient.notes ? (
                                <div className="client-commercial-note">
                                  {selectedClient.notes}
                                </div>
                              ) : null}
                              {clientCommercialSummary.recentNotes.map(
                                (note) => (
                                  <div
                                    key={note.id}
                                    className="client-commercial-note"
                                  >
                                    <strong>
                                      {note.kind === "call"
                                        ? "Appel"
                                        : note.kind === "email"
                                          ? "Email"
                                          : "Note"}
                                    </strong>
                                    <span>{formatDate(note.createdAt)}</span>
                                    <p>{note.text}</p>
                                  </div>
                                ),
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="client-history-section">
                        <h4>Documents & fichiers</h4>
                        <div className="client-commercial-docs">
                          <button
                            type="button"
                            onClick={() => setClientTab("documents")}
                          >
                            {selectedClientQuotes.length +
                              selectedClientInvoices.length +
                              selectedClientDeliveryNotes.length}{" "}
                            document(s)
                          </button>
                          <button
                            type="button"
                            onClick={() => setClientTab("files")}
                          >
                            {selectedClientFiles.length} fichier(s)
                          </button>
                          <button
                            type="button"
                            onClick={() => setClientTab("history")}
                          >
                            Historique complet
                          </button>
                          <button
                            type="button"
                            onClick={() => setClientTab("notes")}
                          >
                            Ajouter une note
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {clientTab === "infos" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Société" value={selectedClient.company} />
                    <InfoBox
                      label="Type client"
                      value={selectedClient.clientType}
                    />
                    <InfoBox label="Site web" value={selectedClient.website} />
                    <InfoBox label="TVA (n°)" value={selectedClient.vat} />
                    <InfoBox
                      label="Taux TVA"
                      value={
                        selectedClient.taxRateOverride === "" ||
                        selectedClient.taxRateOverride === null ||
                        selectedClient.taxRateOverride === undefined
                          ? "Par défaut"
                          : `${selectedClient.taxRateOverride} %`
                      }
                    />
                    <InfoBox label="Statut" value={selectedClient.status} />
                    <InfoBox label="Notes" value={selectedClient.notes} />
                  </div>
                )}

                {clientTab === "contact" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Email" value={selectedClient.email} />
                    <InfoBox label="Téléphone" value={selectedClient.phone} />
                  </div>
                )}

                {clientTab === "address" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Adresse" value={selectedClient.address} />
                    <InfoBox label="CP" value={selectedClient.zip} />
                    <InfoBox label="Ville" value={selectedClient.city} />
                    <InfoBox label="Pays" value={selectedClient.country} />
                  </div>
                )}

                {clientTab === "documents" && (
                  <div className="client-documents">
                    <div className="client-doc-top">
                      <DashboardCard
                        label="CA client"
                        value={money(selectedClientInvoiceTotal)}
                      />
                      <DashboardCard
                        label="Impayés"
                        value={money(clientUnpaidAmount)}
                        danger
                      />
                      <DashboardCard
                        label="Devis"
                        value={selectedClientQuotes.length}
                      />
                      <DashboardCard
                        label="Factures"
                        value={selectedClientInvoices.length}
                      />
                      <DashboardCard
                        label="BL"
                        value={selectedClientDeliveryNotes.length}
                      />
                    </div>

                    <div className="client-doc-actions">
                      <button onClick={() => goToDocumentPage("quotes")}>
                        🧾 Nouveau devis
                      </button>
                      <button onClick={() => goToDocumentPage("invoices")}>
                        💶 Nouvelle facture
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setClientTab("history")}
                      >
                        🕘 Historique complet ({clientHistory.length})
                      </button>
                      {selectedClientUnpaidInvoices.length > 0 && (
                        <button
                          className="danger"
                          onClick={() => remindClient("mail")}
                        >
                          ✉ Relancer
                        </button>
                      )}
                    </div>

                    <div className="client-doc-grid">
                      <div className="client-history-section">
                        <h4>Devis ({selectedClientQuotes.length})</h4>
                        <div className="client-history-list">
                          {selectedClientQuotes.length === 0 ? (
                            <p className="muted">Aucun devis.</p>
                          ) : (
                            selectedClientQuotes.map((quote) => (
                              <DocumentRow
                                key={quote.id}
                                doc={quote}
                                type="quote"
                                label="Devis"
                                onOpen={openDocument}
                              />
                            ))
                          )}
                        </div>
                      </div>

                      <div className="client-history-section">
                        <h4>Factures ({selectedClientInvoices.length})</h4>
                        <div className="client-history-list">
                          {selectedClientInvoices.length === 0 ? (
                            <p className="muted">Aucune facture.</p>
                          ) : (
                            selectedClientInvoices.map((invoice) => (
                              <DocumentRow
                                key={invoice.id}
                                doc={invoice}
                                type="invoice"
                                label="Facture"
                                onOpen={openDocument}
                              />
                            ))
                          )}
                        </div>
                      </div>

                      <div className="client-history-section client-history-section--full">
                        <h4>
                          Bons de livraison (
                          {selectedClientDeliveryNotes.length})
                        </h4>
                        <div className="client-history-list">
                          {selectedClientDeliveryNotes.length === 0 ? (
                            <p className="muted">Aucun bon de livraison.</p>
                          ) : (
                            selectedClientDeliveryNotes.map((note) => (
                              <DocumentRow
                                key={note.id}
                                doc={note}
                                type="delivery"
                                label="BL"
                                onOpen={openDocument}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {clientTab === "history" && (
                  <Timeline items={clientHistory} onOpen={openDocument} />
                )}

                {clientTab === "files" && (
                  <ClientFileLibrary
                    clientId={selectedClient.id}
                    files={selectedClientFiles}
                    onFilesChange={(updated) => {
                      const clientId = selectedClient.id;
                      setData((prev) => {
                        const others = (prev.clientFiles || []).filter(
                          (f) => String(f.clientId) !== String(clientId),
                        );
                        return {
                          ...prev,
                          clientFiles: [...others, ...updated],
                        };
                      });
                    }}
                  />
                )}

                {clientTab === "prices" && (
                  <div>
                    {clientPriceHistory.length === 0 ? (
                      <p style={{ color: "var(--muted)", fontSize: 13 }}>
                        Aucune facture enregistrée pour ce client.
                      </p>
                    ) : (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 13,
                        }}
                      >
                        <thead>
                          <tr
                            style={{ borderBottom: "2px solid var(--border)" }}
                          >
                            <th
                              style={{
                                textAlign: "left",
                                padding: "6px 8px",
                                color: "var(--muted)",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Produit / Prestation
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "6px 8px",
                                color: "var(--muted)",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Commandes
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "6px 8px",
                                color: "var(--muted)",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Dernier prix
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "6px 8px",
                                color: "var(--muted)",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Prix moyen
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                padding: "6px 8px",
                                color: "var(--muted)",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              Min / Max
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientPriceHistory.map((row, i) => (
                            <tr
                              key={i}
                              style={{
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <td
                                style={{ padding: "7px 8px", fontWeight: 500 }}
                              >
                                {row.description}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "7px 8px",
                                  color: "var(--muted)",
                                }}
                              >
                                {row.count}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "7px 8px",
                                  fontWeight: 700,
                                  color: "var(--pink, #ec4899)",
                                }}
                              >
                                {row.lastPrice.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "7px 8px",
                                }}
                              >
                                {row.avgPrice.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "7px 8px",
                                  color: "var(--muted)",
                                  fontSize: 11,
                                }}
                              >
                                {row.minPrice.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                /{" "}
                                {row.maxPrice.toLocaleString("fr-FR", {
                                  minimumFractionDigits: 2,
                                })}{" "}
                                €
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {clientTab === "notes" && (
                  <ClientNotes
                    clientId={selectedClient.id}
                    notes={selectedClientNotes}
                    onNotesChange={(updated) => {
                      const others = (data.clientNotes || []).filter(
                        (n) => String(n.clientId) !== String(selectedClient.id),
                      );
                      setData({
                        ...data,
                        clientNotes: [...others, ...updated],
                      });
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ClientNotes({ clientId, notes = [], onNotesChange }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("note");

  function addNote() {
    const t = text.trim();
    if (!t) return;
    onNotesChange([
      ...notes,
      {
        id: crypto.randomUUID(),
        clientId,
        kind,
        text: t,
        createdAt: new Date().toISOString(),
      },
    ]);
    setText("");
  }

  function deleteNote(id) {
    onNotesChange(notes.filter((n) => n.id !== id));
  }

  const sorted = [...notes].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          style={{ width: 120, alignSelf: "flex-start", fontSize: 13 }}
        >
          <option value="note">Note</option>
          <option value="call">Appel</option>
          <option value="email">Email</option>
        </select>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter une note…"
          style={{ flex: 1, resize: "vertical", fontSize: 13 }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) addNote();
          }}
        />
        <button
          type="button"
          className="primary"
          onClick={addNote}
          style={{ alignSelf: "flex-end" }}
        >
          Ajouter
        </button>
      </div>
      {sorted.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          Aucune note pour ce client.
        </p>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sorted.map((n) => (
            <li
              key={n.id}
              style={{
                background: "var(--surface-2)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                gap: 10,
              }}
            >
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    margin: "0 0 4px",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {n.text}
                </p>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {n.kind === "call"
                    ? "Appel"
                    : n.kind === "email"
                      ? "Email"
                      : "Note"}{" "}
                  ·{" "}
                  {new Date(n.createdAt).toLocaleString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => deleteNote(n.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  fontSize: 14,
                  alignSelf: "flex-start",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="client-info-box">
      <strong>{label}</strong>
      <span>{value || "-"}</span>
    </div>
  );
}

function DashboardCard({ label, value, danger = false }) {
  return (
    <div
      className={
        danger ? "client-dashboard-card danger" : "client-dashboard-card"
      }
    >
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DocumentRow({ doc, type, label, onOpen }) {
  const total = type === "delivery" ? null : docTotal(doc);

  return (
    <div
      className="client-history-item clickable"
      onClick={() => onOpen(doc, type)}
    >
      <div>
        <strong>{doc.number || doc.reference || label}</strong>
        <span>{formatDate(docDate(doc))}</span>
      </div>

      <div>
        {total != null ? <strong>{money(total)}</strong> : null}
        <span className={"status-badge " + statusClass(doc.status)}>
          {doc.status || "Sans statut"}
        </span>
      </div>
    </div>
  );
}

function Timeline({ items, onOpen }) {
  if (!items.length) {
    return <p className="muted">Aucune activite pour ce client.</p>;
  }

  return (
    <div className="client-timeline">
      {items.map((item) => {
        const canOpenDocument = Boolean(item.doc && item.docType);

        return (
          <div
            className={`timeline-item${canOpenDocument ? " clickable" : ""}`}
            key={item.id}
            onClick={
              canOpenDocument
                ? () => onOpen?.(item.doc, item.docType)
                : undefined
            }
            onKeyDown={
              canOpenDocument
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen?.(item.doc, item.docType);
                    }
                  }
                : undefined
            }
            role={canOpenDocument ? "button" : undefined}
            tabIndex={canOpenDocument ? 0 : undefined}
          >
            <div className={`timeline-dot ${item.tone || ""}`} />

            <div>
              <strong>
                {item.icon} {item.type} - {item.title}
              </strong>

              <p>
                {formatDate(item.date)} - {item.status}
                {Number(item.total || 0) !== 0 ? ` - ${money(item.total)}` : ""}
              </p>
              {item.detail ? <small>{item.detail}</small> : null}
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  Ouvrir le fichier
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
