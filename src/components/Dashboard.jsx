import { useMemo, useState } from "react";
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
import { openInvoiceReminderMailto } from "../utils/invoiceReminders";
import { getProductionQueue } from "../utils/production";
import { getOverdueQuotes } from "../utils/quoteDelivery";
import {
  addDays,
  buildDeliveryWeekCalendar,
  countWeekDeliveries,
  formatWeekRangeLabel,
  startOfWeekMonday,
} from "../utils/quoteDeliveryCalendar";
import { money } from "../utils/money";
import { pageToPath } from "../utils/routes";
import { getPermissions } from "../utils/permissions";
import { isExpenseInMonth } from "../utils/expenseSuppliers";
import { exportInvoicesCsv, exportLowStockPurchaseOrderCsv, buildPurchaseOrderText } from "../utils/exportCsv";
import { getStaleDraftQuotes, markDocumentReminder } from "../utils/documentTracking";
import { countUnreadLeads, markLeadRead } from "../services/leadsService";
import { showToast } from "../utils/toast";
import {
  countLowStockProducts,
  getLowStockProducts,
  getMinStock,
  getStock,
  isOutOfStock,
  resolveProductSupplier,
  suggestedReorderQty,
} from "../utils/stock";

export default function Dashboard({
  data,
  setData,
  logActivity,
  currentRole = "Admin",
}) {
  const navigate = useNavigate();
  const [deliveryWeekOffset, setDeliveryWeekOffset] = useState(0);
  const permissions = getPermissions(currentRole);
  const canManageInvoices = permissions.pages.includes("invoices");
  const canManageQuotes = permissions.pages.includes("quotes");
  const canManageProducts = permissions.pages.includes("products");
  const canManageExpenses = permissions.pages.includes("expenses");

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

  const lowStockProducts = getLowStockProducts(products, 8);
  const lowStockCount = countLowStockProducts(products);
  const outOfStockCount = products.filter(isOutOfStock).length;

  const convertibleQuotes = quotes
    .filter((quote) => isQuoteConvertible(data, quote))
    .slice()
    .reverse()
    .slice(0, 8);

  const productionQueue = getProductionQueue(quotes);
  const overdueDeliveries = getOverdueQuotes(quotes);
  const deliveryWeekStart = useMemo(
    () => addDays(startOfWeekMonday(new Date()), deliveryWeekOffset * 7),
    [deliveryWeekOffset]
  );
  const deliveryWeekCalendar = useMemo(
    () => buildDeliveryWeekCalendar(quotes, deliveryWeekStart, new Date()),
    [quotes, deliveryWeekStart]
  );
  const deliveryWeekCount = countWeekDeliveries(deliveryWeekCalendar);
  const staleDraftQuotes = getStaleDraftQuotes(quotes).slice(0, 8);
  const unreadLeads = (leads || []).filter(
    (lead) => String(lead?.status || "nouveau") === "nouveau"
  );
  const unreadLeadCount = countUnreadLeads(leads);

  const totalInvoices = invoices.reduce(
    (sum, inv) => sum + Number(inv.totalTTC || 0),
    0
  );
  const paidInvoices = invoices
    .filter((i) => i.status === "Payée")
    .reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
  const unpaidInvoices = totalInvoices - paidInvoices;
  const unpaidCount = invoices.filter((i) => i.status !== "Payée").length;
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

  function goToAtelier() {
    navigate(pageToPath("atelier"));
  }

  function goToOverdueInvoices() {
    localStorage.setItem(INVOICES_FILTER_KEY, "overdue");
    navigate(pageToPath("invoices"));
  }

  function goToProducts() {
    navigate(pageToPath("products"));
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
    showToast(`Relance préparée pour ${invoice.number}.`, "success");
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
                <strong className="dashboard-unpaid-amount">{money(unpaidInvoices)}</strong>
                <span className="muted">Montant à encaisser</span>
                {overdueInvoices.length > 0 && (
                  <button type="button" className="dashboard-kpi-cta" onClick={goToOverdueInvoices}>
                    Voir les retards ({overdueInvoices.length})
                  </button>
                )}
              </div>
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
            <div className="card stat dashboard-kpi">
              <span>Dépenses du mois ({monthLabel})</span>
              <strong>{money(monthExpensesTTC)}</strong>
              <em className="muted">
                {monthExpenses.length} facture(s) · {money(monthExpensesHT)} HT
              </em>
            </div>
          )}
          {canManageInvoices && marginCalculable && (
            <div
              className={`card stat dashboard-kpi${
                monthMarginHT < 0 ? " stat--danger" : ""
              }`}
            >
              <span>Marge du mois (CA HT − dépenses HT)</span>
              <strong>{money(monthMarginHT)}</strong>
              <em className="muted">
                CA {money(monthRevenueHT)} · Dépenses {money(monthExpensesHT)}
              </em>
            </div>
          )}
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <span>Clients</span>
          <strong>{clients.length}</strong>
        </div>
        <div className="card stat">
          <span>Produits</span>
          <strong>{products.length}</strong>
        </div>
        <div className="card stat">
          <span>Devis</span>
          <strong>{quotes.length}</strong>
        </div>
        <div className="card stat">
          <span>Devis acceptés</span>
          <strong>{acceptedQuotes}</strong>
        </div>
        <div className="card stat">
          <span>Factures</span>
          <strong>{invoices.length}</strong>
        </div>
        <div className="card stat stat--danger">
          <span>En retard</span>
          <strong>{overdueInvoices.length}</strong>
        </div>
        {canManageProducts && (
          <div className={`card stat ${lowStockCount > 0 ? "stat--danger" : ""}`}>
            <span>Stock bas</span>
            <strong>{lowStockCount}</strong>
          </div>
        )}
        {canManageProducts && outOfStockCount > 0 && (
          <div className="card stat stat--danger">
            <span>Rupture</span>
            <strong>{outOfStockCount}</strong>
          </div>
        )}
        <div className="card stat">
          <span>Non payées</span>
          <strong>{unpaidCount}</strong>
        </div>
        <div className="card stat">
          <span>Total facturé</span>
          <strong>{money(totalInvoices)}</strong>
        </div>
        <div className="card stat">
          <span>Payé</span>
          <strong>{money(paidInvoices)}</strong>
        </div>
        <div className="card stat">
          <span>À encaisser</span>
          <strong>{money(unpaidInvoices)}</strong>
        </div>
      </div>

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
                                ? `Dernière relance : ${invoice.lastReminderDate}`
                                : "Préparer un email de relance"
                            }
                          >
                            Relancer
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
                  onClick={() => navigate(pageToPath("quotes"))}
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
                onClick={() => navigate(pageToPath("quotes"))}
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

        {unreadLeadCount > 0 && (
          <div className="card dashboard-action-card" data-testid="dashboard-leads">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Nouveaux leads configurateur</h3>
                <p className="muted">
                  {unreadLeadCount} contact(s) depuis le configurateur public.
                </p>
              </div>
            </div>
            <ul className="dashboard-leads-list">
              {unreadLeads.slice(0, 6).map((lead) => (
                <li key={lead.id}>
                  <strong>{lead.email}</strong>
                  {lead.phone ? <span>{lead.phone}</span> : null}
                  <span className="muted">{lead.source || "configurateur"}</span>
                  <button
                    type="button"
                    className="compact"
                    onClick={() =>
                      setData({ ...data, leads: markLeadRead(leads, lead.id) })
                    }
                  >
                    Marquer lu
                  </button>
                </li>
              ))}
            </ul>
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
          <div className="card dashboard-action-card" data-testid="delivery-week-calendar">
            <div className="dashboard-action-card__header">
              <div>
                <h3>Calendrier livraisons</h3>
                <p className="muted">
                  {deliveryWeekCount === 0
                    ? "Aucune livraison prévue cette semaine."
                    : `${deliveryWeekCount} livraison(s) prévue(s) — semaine du ${formatWeekRangeLabel(deliveryWeekStart)}`}
                </p>
              </div>
              <div className="dashboard-delivery-nav">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDeliveryWeekOffset((value) => value - 1)}
                  aria-label="Semaine précédente"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDeliveryWeekOffset(0)}
                  disabled={deliveryWeekOffset === 0}
                >
                  Cette semaine
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDeliveryWeekOffset((value) => value + 1)}
                  aria-label="Semaine suivante"
                >
                  →
                </button>
                <button type="button" className="ghost" onClick={goToAtelier}>
                  Atelier →
                </button>
              </div>
            </div>
            <div className="dashboard-delivery-week">
              {deliveryWeekCalendar.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className={`dashboard-delivery-day${day.isToday ? " dashboard-delivery-day--today" : ""}`}
                >
                  <header className="dashboard-delivery-day__head">
                    <strong>{day.label}</strong>
                    {day.items.length > 0 ? (
                      <span>{day.items.length}</span>
                    ) : null}
                  </header>
                  {day.items.length === 0 ? (
                    <p className="muted dashboard-delivery-day__empty">—</p>
                  ) : (
                    <ul className="dashboard-delivery-day__list">
                      {day.items.map(({ quote, overdue }) => (
                        <li
                          key={quote.id}
                          className={overdue ? "dashboard-delivery-item--overdue" : ""}
                        >
                          <strong>{quote.number}</strong>
                          <em>{clientName(data, quote.clientId)}</em>
                          <span className={statusClass(quote.status)}>{quote.status}</span>
                          {overdue ? <span className="dashboard-delivery-overdue-tag">Retard</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
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
                <h3>Alertes stock</h3>
                <p className="muted">
                  {lowStockCount === 0
                    ? "Aucun produit sous le seuil minimum."
                    : `${lowStockCount} produit(s) en stock bas${outOfStockCount > 0 ? ` · ${outOfStockCount} en rupture` : ""}`}
                </p>
              </div>
              {(lowStockCount > 0 || outOfStockCount > 0) && (
                <div className="dashboard-action-card__actions">
                  <button type="button" className="ghost" onClick={goToProducts}>
                    Voir stock →
                  </button>
                  <button type="button" className="ghost" onClick={handleExportPurchaseOrder}>
                    Exporter bon de commande CSV
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
                <button type="button" className="dashboard-kpi-cta" onClick={goToProducts}>
                  Voir stock →
                </button>
              </>
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
