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
  sortOverdueInvoices,
} from "../utils/invoices";
import { money } from "../utils/money";
import { pageToPath } from "../utils/routes";
import { getPermissions } from "../utils/permissions";
import { showToast } from "../utils/toast";

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

  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const clients = data.clients || [];
  const products = data.products || [];
  const categories = data.categories || [];

  const overdueInvoices = sortOverdueInvoices(
    invoices.filter(isInvoiceOverdue)
  );
  const overdueTotal = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.totalTTC || 0),
    0
  );

  const convertibleQuotes = quotes
    .filter((quote) => isQuoteConvertible(data, quote))
    .slice()
    .reverse()
    .slice(0, 8);

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

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Tableau de bord</h2>
          <p>Statistiques, factures en retard et conversion devis.</p>
        </div>
      </div>

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
