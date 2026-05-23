import { useNavigate } from "react-router-dom";
import {
  clientName,
  statusClass,
  convertQuoteToInvoiceData,
  isQuoteConvertible,
  today,
} from "../utils/documents";
import {
  INVOICES_FILTER_KEY,
  isInvoiceOverdue,
  parseDocumentDate,
  sortOverdueInvoices,
} from "../utils/invoices";
import { openInvoiceReminderMailto } from "../utils/invoiceReminders";
import { getProductionQueue } from "../utils/production";
import { money } from "../utils/money";
import { pageToPath } from "../utils/routes";
import { getPermissions } from "../utils/permissions";
import { isExpenseInMonth } from "../utils/expenseSuppliers";
import { exportInvoicesCsv } from "../utils/exportCsv";
import { showToast } from "../utils/toast";
import {
  countLowStockProducts,
  getLowStockProducts,
  getMinStock,
  getStock,
  isOutOfStock,
} from "../utils/stock";

export default function Dashboard({
  data,
  setData,
  logActivity,
  currentRole = "Admin",
}) {
  const navigate = useNavigate();
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

  const invoiceLines = invoices.flatMap((invoice) =>
    (invoice.lines || []).map((line) => ({
      ...line,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      date: invoice.date,
      status: invoice.status,
    }))
  );

  const productStats = products
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
    .slice(0, 5);

  const clientStats = clients
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
    .slice(0, 5);

  const categoryStats = categories
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

  const maxProductRevenue = Math.max(...productStats.map((p) => p.revenue), 1);
  const maxClientRevenue = Math.max(...clientStats.map((c) => c.total), 1);
  const maxCategoryRevenue = Math.max(
    ...categoryStats.map((c) => c.revenue),
    1
  );

  function goToOverdueInvoices() {
    localStorage.setItem(INVOICES_FILTER_KEY, "overdue");
    navigate(pageToPath("invoices"));
  }

  function goToProducts() {
    navigate(pageToPath("products"));
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
        ? { ...doc, lastReminderDate: today() }
        : doc
    );
    setData({ ...data, invoices: nextInvoices });
    logActivity?.("Relance facture", invoice.number, client?.name || "");
    showToast(`Relance préparée pour ${invoice.number}.`, "success");
  }

  return (
    <section>
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
                <button type="button" className="ghost" onClick={goToProducts}>
                  Voir produits →
                </button>
              )}
            </div>
            {lowStockProducts.length === 0 ? (
              <p className="muted">Tous les stocks sont au-dessus du seuil d'alerte.</p>
            ) : (
              <div className="table compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>SKU</th>
                      <th>Stock</th>
                      <th>Seuil</th>
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
