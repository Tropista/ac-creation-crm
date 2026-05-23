import { money } from "../../utils/money";
import { QUOTE_STATUSES } from "../../utils/production";

export default function DocumentForm({
  isQuote,
  editingId,
  form,
  setForm,
  totals,
  taxRate,
  products,
  clients,
  onSubmit,
  onReset,
  onUpdateLine,
  onSelectProduct,
  onAddLine,
  onRemoveLine,
  lineTotal,
}) {
  return (
    <form
      className="card documents-form-card"
      onSubmit={onSubmit}
      data-testid={isQuote ? "quote-form" : "invoice-form"}
    >
      <div className="documents-form-head">
        <span className="filters-icon">{isQuote ? "📋" : "🧾"}</span>
        <div>
          <strong>
            {editingId
              ? `Modifier le ${isQuote ? "devis" : "facture"}`
              : `Nouveau ${isQuote ? "devis" : "facture"}`}
          </strong>
          <span>Ajoutez un client, des lignes produits ou prestations, puis validez.</span>
        </div>
      </div>

      <div className="documents-form-header">
        <label className="documents-field">
          <span>Client</span>
          <select
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          >
            <option value="">Choisir un client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="documents-field">
          <span>Statut</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {isQuote ? (
              QUOTE_STATUSES.map((status) => <option key={status}>{status}</option>)
            ) : (
              <>
                <option>Non payée</option>
                <option>Payée</option>
                <option>En retard</option>
                <option>Annulée</option>
              </>
            )}
          </select>
        </label>
      </div>

      <div className="documents-lines-wrap">
        <div className="document-lines">
          <div className="document-line document-line-head">
            <span>Produit</span>
            <span>Description</span>
            <span>Qté</span>
            <span>Prix HT</span>
            <span>Remise %</span>
            <span>Total HT</span>
            <span></span>
          </div>

          {(form.lines || []).map((line, index) => {
            const total = lineTotal(line).totalHT;
            return (
              <div className="document-line" key={index}>
                <select
                  value={line.productId || ""}
                  onChange={(e) => onSelectProduct(index, e.target.value)}
                >
                  <option value="">Produit libre</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.category ? `${p.category} — ` : ""}
                      {p.name} - {money(p.price)}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Produit / prestation"
                  value={line.description}
                  onChange={(e) => onUpdateLine(index, { description: e.target.value })}
                />
                <input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(e) => onUpdateLine(index, { quantity: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={line.price}
                  onChange={(e) => onUpdateLine(index, { price: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={line.discount}
                  onChange={(e) => onUpdateLine(index, { discount: e.target.value })}
                />
                <strong className="documents-line-total">{money(total)}</strong>
                <button
                  type="button"
                  className="danger documents-line-remove"
                  onClick={() => onRemoveLine(index)}
                  title="Supprimer la ligne"
                  aria-label="Supprimer la ligne"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="documents-form-footer">
        <div className="documents-form-footer-left">
          <button type="button" className="documents-add-line" onClick={onAddLine}>
            + Ajouter une ligne
          </button>
          <label className="documents-field documents-field--inline global-discount-field">
            <span>Remise globale %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.globalDiscount || 0}
              onChange={(e) => setForm({ ...form, globalDiscount: e.target.value })}
            />
          </label>
        </div>

        <div className="documents-totals-panel total-box">
          <div className="documents-totals-row">
            <span>Sous-total HT</span>
            <strong>{money(totals.subtotal)}</strong>
          </div>
          <div className="documents-totals-row">
            <span>Remise lignes</span>
            <strong>{money(totals.lineDiscountAmount)}</strong>
          </div>
          <div className="documents-totals-row">
            <span>Remise globale</span>
            <strong>{money(totals.globalDiscountAmount)}</strong>
          </div>
          <div className="documents-totals-row">
            <span>Total HT</span>
            <strong>{money(totals.totalHT)}</strong>
          </div>
          <div className="documents-totals-row">
            <span>TVA ({taxRate || 0} %)</span>
            <strong>{money(totals.taxAmount)}</strong>
          </div>
          <div className="documents-totals-row documents-totals-row--final">
            <span>Total TTC</span>
            <strong>{money(totals.totalTTC)}</strong>
          </div>
        </div>

        <div className="documents-form-actions">
          <button
            className="primary"
            type="submit"
            data-testid={isQuote ? "quote-submit" : "invoice-submit"}
          >
            {editingId
              ? "Enregistrer les modifications"
              : `Créer ${isQuote ? "le devis" : "la facture"}`}
          </button>
          {editingId && (
            <button type="button" onClick={onReset}>
              Annuler
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
