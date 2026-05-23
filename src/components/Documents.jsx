import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import DocumentPreview from "./DocumentPreview";
import DocumentForm from "./documents/DocumentForm";
import DocumentList from "./documents/DocumentList";
import { money } from "../utils/money";
import {
  clientName,
  dedupeDocuments,
  nextDocumentNumber,
  convertQuoteToInvoiceData,
  isQuoteConvertible,
  uid,
  today,
} from "../utils/documents";
import { applyStockByLines, syncDocumentStock } from "../utils/stock";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
} from "../utils/invoices";
import { computeDueDate, openInvoiceReminderMailto } from "../utils/invoiceReminders";
import { consumeQuoteDraft } from "../utils/quoteDraft";
import { PRODUCTION_STATUSES, QUOTE_STATUSES } from "../utils/production";
import { exportInvoicesCsv } from "../utils/exportCsv";
import { showToast } from "../utils/toast";

function Documents({ type, data, setData, currentRole = 'Admin', logActivity }) {
  const location = useLocation();
  const isQuote = type === "quote";
  const listKey = isQuote ? "quotes" : "invoices";
  const title = isQuote ? "Devis" : "Factures";
  const prefix = isQuote ? "DEV" : "FAC";
  const defaultStatus = isQuote ? "Brouillon" : "Non payée";

  const emptyLine = { productId: "", sku: "", description: "", quantity: 1, price: 0, discount: 0 };
  const [editingId, setEditingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("dateDesc");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const prefilledClientId =
  localStorage.getItem(
    "crm_prefill_client_id"
  ) || "";
const [form, setForm] = useState({
  clientId: prefilledClientId,
  status: defaultStatus,
  globalDiscount: 0,
  lines: [{ ...emptyLine }]
});

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
    setForm({
      clientId: draft.clientId || prefilledClientId || "",
      status: "Brouillon",
      globalDiscount: 0,
      lines: draft.lines.map((line) => ({
        productId: line.productId || "",
        sku: line.sku || "",
        category: line.category || "",
        categoryId: line.categoryId || "",
        description: line.description || "",
        quantity: Number(line.quantity || 1),
        price: Number(line.price || 0),
        discount: Number(line.discount || 0),
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
    const list = [...documents].filter(
      (doc) => !overdueOnly || isQuote || isInvoiceOverdue(doc)
    );

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
  }, [documents, sortBy, data, overdueOnly, isQuote]);

  const documentTotalPages = Math.max(1, Math.ceil(sortedDocuments.length / itemsPerPage));
  const documentPage = Math.min(currentPage, documentTotalPages);
  const paginatedDocuments = sortedDocuments.slice((documentPage - 1) * itemsPerPage, documentPage * itemsPerPage);

  const stats = useMemo(() => {
    const totalTTC = documents.reduce((sum, doc) => sum + Number(doc.totalTTC || 0), 0);

    if (isQuote) {
      const pending = documents.filter(
        (doc) => doc.status === "Brouillon" || doc.status === "Envoyé"
      ).length;
      const accepted = documents.filter((doc) => doc.status === "Accepté").length;
      const inProduction = documents.filter((doc) =>
        PRODUCTION_STATUSES.includes(doc.status)
      ).length;
      const convertible = documents.filter((doc) => isQuoteConvertible(data, doc)).length;
      return { count: documents.length, totalTTC, pending, accepted, inProduction, convertible };
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
    const discountAmount = subtotal * (Number(line.discount || 0) / 100);
    const totalHT = subtotal - discountAmount;
    return { subtotal, discountAmount, totalHT };
  }

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => sum + lineTotal(line).subtotal, 0);
    const lineDiscountAmount = form.lines.reduce((sum, line) => sum + lineTotal(line).discountAmount, 0);
    const totalBeforeGlobalDiscount = form.lines.reduce((sum, line) => sum + lineTotal(line).totalHT, 0);
    const globalDiscountRate = Math.min(100, Math.max(0, Number(form.globalDiscount || 0)));
    const globalDiscountAmount = totalBeforeGlobalDiscount * (globalDiscountRate / 100);
    const discountAmount = lineDiscountAmount + globalDiscountAmount;
    const totalHT = Math.max(0, totalBeforeGlobalDiscount - globalDiscountAmount);
    const taxAmount = totalHT * (Number(data.settings.taxRate || 0) / 100);
    const totalTTC = totalHT + taxAmount;
    return { subtotal, lineDiscountAmount, globalDiscountRate, globalDiscountAmount, discountAmount, totalHT, taxAmount, totalTTC };
  }, [form.lines, form.globalDiscount, data.settings.taxRate]);

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

  function getProductById(products, productId) {
    return (products || []).find((product) => String(product.id) === String(productId));
  }

  function reset() {
    setEditingId(null);
    setForm({ clientId: "", status: defaultStatus, globalDiscount: 0, lines: [{ ...emptyLine }] });
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
          discount: Number(line.discount || 0),
          ...lineTotal(line),
        };
      })
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0) return showToast("Ajoute au moins un produit ou une prestation.", "error");

    const firstDescription = cleanLines.length === 1 ? cleanLines[0].description : `${cleanLines.length} lignes`;

    if (editingId) {
      const existingDoc = documents.find((d) => d.id === editingId);
      const updatedDoc = {
        ...existingDoc,
        clientId: form.clientId,
        status: form.status,
        globalDiscount: Number(form.globalDiscount || 0),
        description: firstDescription,
        lines: cleanLines,
        taxRate: data.settings.taxRate,
        stockAdjusted: !isQuote && form.status !== "Annulée",
        ...totals,
      };

      const nextProducts = isQuote
        ? data.products || []
        : syncDocumentStock(data.products || [], existingDoc, updatedDoc, {
            isQuote,
            user: currentRole,
          });

      setData({
        ...data,
        products: nextProducts,
        [listKey]: documents.map((d) =>
          d.id === editingId ? updatedDoc : d
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
        description: firstDescription,
        lines: cleanLines,
        stockAdjusted: !isQuote && form.status !== "Annulée",
        ...(!isQuote && {
          dueDate: computeDueDate(today(), data.settings.paymentDays || 30),
        }),
        ...totals,
      };

      const nextProducts = !isQuote && doc.stockAdjusted
        ? applyStockByLines(data.products || [], cleanLines, "remove", {
            type: "invoice",
            reason: "Création facture",
            reference: doc.number,
            user: currentRole,
          })
        : data.products || [];

      setData({ ...data, products: nextProducts, [listKey]: [...documents, doc] });
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
    setForm({
      clientId: doc.clientId || "",
      status: doc.status || defaultStatus,
      globalDiscount: Number(doc.globalDiscount || 0),
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

  localStorage.removeItem("crm_open_document_id");
  localStorage.removeItem("crm_open_document_type");
}, []);
  function remove(id) {
    if (!confirm(`Supprimer ce ${isQuote ? "devis" : "facture"} ?`)) return;
    const removedDoc = documents.find((d) => d.id === id);
    const nextProducts = !isQuote && removedDoc?.stockAdjusted
      ? applyStockByLines(data.products || [], removedDoc.lines || [], "add", {
          type: "invoice",
          reason: "Suppression facture",
          reference: removedDoc?.number || "",
          user: currentRole,
        })
      : data.products || [];

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

    const nextDocuments = dedupeDocuments((data[listKey] || []).map((d) =>
      String(d.id) === String(id) && updatedDoc ? updatedDoc : d
    ));

    const nextProducts = !isQuote && updatedDoc
      ? syncDocumentStock(data.products || [], existingDoc, updatedDoc, {
          isQuote,
          user: currentRole,
        })
      : data.products || [];

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
        ? { ...doc, lastReminderDate: today() }
        : doc
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Relance facture", invoice.number, client?.name || "");
    showToast(`Relance préparée pour ${invoice.number}.`, "success");
  }

  function convertQuoteToInvoice(doc) {
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
        onSubmit={submit}
        onReset={reset}
        onUpdateLine={updateLine}
        onSelectProduct={selectProduct}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        lineTotal={lineTotal}
      />

      <DocumentList
        isQuote={isQuote}
        data={data}
        sortedDocuments={sortedDocuments}
        paginatedDocuments={paginatedDocuments}
        stats={stats}
        overdueOnly={overdueOnly}
        sortBy={sortBy}
        documentPage={documentPage}
        documentTotalPages={documentTotalPages}
        onExportCsv={handleExportCsv}
        onToggleOverdueOnly={() => {
          setOverdueOnly((value) => !value);
          setCurrentPage(1);
        }}
        onSortChange={(value) => {
          setSortBy(value);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        onPreview={setPreviewDoc}
        onEdit={edit}
        onRemove={remove}
        onUpdateStatus={updateStatus}
        onSendReminder={sendInvoiceReminder}
        onConvertQuote={convertQuoteToInvoice}
      />

      {previewDoc && (
        <DocumentPreview
          doc={previewDoc}
          type={type}
          data={data}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </section>
  );
}
export default Documents;