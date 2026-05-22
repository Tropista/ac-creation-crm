import { useEffect, useMemo, useState } from "react";
import DocumentPreview from "./DocumentPreview";
import { money } from "../utils/money";
import {
  clientName,
  dedupeDocuments,
  nextDocumentNumber,
  convertQuoteToInvoiceData,
} from "../utils/documents";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
} from "../utils/invoices";
import { showToast } from "../utils/toast";

function Documents({ type, data, setData, currentRole = 'Admin', logActivity }) {
  const isQuote = type === "quote";
  const listKey = isQuote ? "quotes" : "invoices";
  const title = isQuote ? "Devis" : "Factures";
  const prefix = isQuote ? "DEV" : "FAC";
  const defaultStatus = isQuote ? "Brouillon" : "Non payée";

  const emptyLine = { productId: "", description: "", quantity: 1, price: 0, discount: 0 };
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
        category: "",
        categoryId: "",
        description: "",
        price: 0,
      });
      return;
    }

    updateLine(index, {
      productId: product.id,
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
    if (form.lines.length === 1) return alert("Il faut au moins une ligne.");
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  }

  function getProductById(products, productId) {
    return (products || []).find((product) => String(product.id) === String(productId));
  }

  function addStock(products, lines) {
    return (products || []).map((product) => {
      const quantityToAdd = (lines || [])
        .filter((line) => String(line.productId || "") === String(product.id))
        .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

      if (!quantityToAdd) return product;
      return { ...product, stock: Number(product.stock || 0) + quantityToAdd };
    });
  }

  function removeStock(products, lines) {
    return (products || []).map((product) => {
      const quantityToRemove = (lines || [])
        .filter((line) => String(line.productId || "") === String(product.id))
        .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

      if (!quantityToRemove) return product;
      return { ...product, stock: Math.max(0, Number(product.stock || 0) - quantityToRemove) };
    });
  }

  function syncInvoiceStock(products, previousDoc, nextDoc) {
    let nextProducts = [...(products || [])];
    const previousWasStocked = Boolean(previousDoc?.stockAdjusted);
    const nextShouldBeStocked = !isQuote && nextDoc?.status !== "Annulée";

    if (previousWasStocked) {
      nextProducts = addStock(nextProducts, previousDoc.lines || []);
    }

    if (nextShouldBeStocked) {
      nextProducts = removeStock(nextProducts, nextDoc.lines || []);
    }

    return nextProducts;
  }

  function reset() {
    setEditingId(null);
    setForm({ clientId: "", status: defaultStatus, globalDiscount: 0, lines: [{ ...emptyLine }] });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId) return alert("Choisis un client.");

    const cleanLines = form.lines
      .map((line) => {
        const product = (data.products || []).find((p) => String(p.id) === String(line.productId));
        return {
          ...line,
          productId: product?.id || line.productId || "",
          category: product?.category || line.category || "Sans catégorie",
          categoryId: product?.categoryId || line.categoryId || "",
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
          discount: Number(line.discount || 0),
          ...lineTotal(line),
        };
      })
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0) return alert("Ajoute au moins un produit ou une prestation.");

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
        : syncInvoiceStock(data.products || [], existingDoc, updatedDoc);

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
        ...totals,
      };

      const nextProducts = !isQuote && doc.stockAdjusted
        ? removeStock(data.products || [], cleanLines)
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
      ? addStock(data.products || [], removedDoc.lines || [])
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
      ? syncInvoiceStock(data.products || [], existingDoc, updatedDoc)
      : data.products || [];

    const changedDoc = nextDocuments.find((d) => String(d.id) === String(id));
    setData({
      ...data,
      products: nextProducts,
      [listKey]: nextDocuments,
    });
    logActivity?.(`Changement statut ${isQuote ? "devis" : "facture"}`, changedDoc?.number || id, status);
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

  return (
    <section>
      <div className="page-header"><div><h2>{title}</h2><p>Crée des {isQuote ? "devis" : "factures"} avec plusieurs produits ou prestations.</p></div></div>

      <form className="card" onSubmit={submit}>
        <div className="document-form-header">
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Choisir un client</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Payée</option><option>En retard</option><option>Annulée</option></>}
          </select>
        </div>

        <div className="document-lines">
          <div className="document-line document-line-head">
            <span>Produit</span><span>Description</span><span>Qté</span><span>Prix HT</span><span>Remise %</span><span>Total HT</span><span></span>
          </div>

          {(form.lines || []).map((line, index) => {
            const total = lineTotal(line).totalHT;
            return (
              <div className="document-line" key={index}>
                <select value={line.productId || ""} onChange={(e) => selectProduct(index, e.target.value)}>
                  <option value="">Produit libre</option>
                  {(data.products || []).map((p) => <option key={p.id} value={p.id}>{p.category ? `${p.category} — ` : ""}{p.name} - {money(p.price)}</option>)}
                </select>
                <input placeholder="Produit / Prestation" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                <input
type="number"
min="0"
step="0.0001"
value={line.price}
onChange={(e) =>
  updateLine(index, {
    price: e.target.value
  })
}
/>
                <input type="number" min="0" max="100" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
                <strong>{money(total)}</strong>
                <button type="button" className="danger" onClick={() => removeLine(index)}>✕</button>
              </div>
            );
          })}
        </div>

        <div className="document-form-footer">
          <button type="button" onClick={addLine}>+ Ajouter une ligne</button>
          <label className="global-discount-field">
            Remise globale %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.globalDiscount || 0}
              onChange={(e) => setForm({ ...form, globalDiscount: e.target.value })}
            />
          </label>
          <div className="total-box">
            <span>Sous-total HT : {money(totals.subtotal)}</span>
            <span>Remise lignes : {money(totals.lineDiscountAmount)}</span>
            <span>Remise globale : {money(totals.globalDiscountAmount)}</span>
            <span>HT : {money(totals.totalHT)}</span>
            <span>TVA : {money(totals.taxAmount)}</span>
            <strong>TTC : {money(totals.totalTTC)}</strong>
          </div>
          <button className="primary">{editingId ? "Modifier" : `Créer ${isQuote ? "le devis" : "la facture"}`}</button>
          {editingId && <button type="button" onClick={reset}>Annuler</button>}
        </div>
      </form>

      <div className="table card">
        <div className="sort-row">
          {!isQuote && (
            <label className="filter-chip">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => {
                  setOverdueOnly(e.target.checked);
                  setCurrentPage(1);
                }}
              />
              En retard uniquement
            </label>
          )}
          <label>
            Trier par
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="dateDesc">Date : plus récent</option>
              <option value="dateAsc">Date : plus ancien</option>
              <option value="numberDesc">N° : décroissant</option>
              <option value="numberAsc">N° : croissant</option>
              <option value="clientAsc">Client : A → Z</option>
              <option value="clientDesc">Client : Z → A</option>
              <option value="totalDesc">Total : plus élevé</option>
              <option value="totalAsc">Total : plus bas</option>
              <option value="statusAsc">Statut : A → Z</option>
              <option value="statusDesc">Statut : Z → A</option>
            </select>
          </label>
        </div>

        <table>
          <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Lignes</th><th>Total TTC</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {paginatedDocuments.map((d) => (
              <tr key={`${d.id || d.number}-${d.number || ""}`}>
                <td>{d.number}</td><td>{d.date}</td><td>{clientName(data, d.clientId)}</td><td>{d.lines?.length || 1}</td><td>{money(d.totalTTC)}</td>
                <td>
                  <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)}>
                    {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Payée</option><option>En retard</option><option>Annulée</option></>}
                  </select>
                </td>
                <td className="actions">
                  <button onClick={() => setPreviewDoc(d)}>Voir</button>
                  <button onClick={() => edit(d)}>Modifier</button>
                  {isQuote && <button onClick={() => convertQuoteToInvoice(d)}>Convertir</button>}
                  <button className="danger" onClick={() => remove(d.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

       <div className="pagination">
  <button
    type="button"
    disabled={documentPage <= 1}
    onClick={() => setCurrentPage(documentPage - 1)}
  >
    Précédent
  </button>

  <span>
    Page {documentPage} / {documentTotalPages}
  </span>

  <button
    type="button"
    disabled={documentPage >= documentTotalPages}
    onClick={() => setCurrentPage(documentPage + 1)}
  >
    Suivant
  </button>
</div>
      </div>

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