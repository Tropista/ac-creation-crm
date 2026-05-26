import { useEffect, useRef, useState } from "react";
import { money } from "../../utils/money";
import { QUOTE_STATUSES, PROCESS_TYPES, QUOTE_PRIORITY_OPTIONS } from "../../utils/production";
import {
  canUploadQuoteAttachments,
  uploadQuoteAttachmentFileWithLocalFallback,
} from "../../services/quoteAttachmentStorage";
import {
  getAttachmentSyncLabel,
  getAttachmentSyncStatus,
  hydrateQuoteAttachments,
  isPreviewableAttachment,
} from "../../utils/quoteAttachments";
import { uid } from "../../utils/documents";
import { showToast } from "../../utils/toast";
import { isSupabaseConfigured } from "../../supabase";
import ProductPicker from "./ProductPicker";

export default function DocumentForm({
  isQuote,
  editingId,
  form,
  setForm,
  totals,
  taxRate,
  products,
  clients,
  users = [],
  onSubmit,
  onReset,
  onUpdateLine,
  onSelectProduct,
  onAddLine,
  onRemoveLine,
  lineTotal,
  depositPresets = [],
  attachments = [],
  onAttachmentsChange,
}) {
  const fileInputRef = useRef(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentSyncReady, setAttachmentSyncReady] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function probeSync() {
      if (!isQuote || !onAttachmentsChange) return;
      const canCloud = isSupabaseConfigured ? await canUploadQuoteAttachments() : false;
      if (!cancelled) setAttachmentSyncReady(canCloud);
    }
    probeSync();
    return () => {
      cancelled = true;
    };
  }, [isQuote, onAttachmentsChange]);

  const hydratedAttachments = hydrateQuoteAttachments(attachments || []);
  const localOnlyCount = hydratedAttachments.filter(
    (entry) => getAttachmentSyncStatus(entry) === "local"
  ).length;
  const unavailableCount = hydratedAttachments.filter(
    (entry) => !entry.url && entry.storagePath
  ).length;

  async function handleAttachmentUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onAttachmentsChange) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast("Fichier trop volumineux (max 10 Mo).", "error");
      return;
    }

    setUploadingAttachment(true);
    try {
      const quoteId = editingId || "draft";
      const uploaded = await uploadQuoteAttachmentFileWithLocalFallback(file, { quoteId });
      const { url, storagePath, source } = uploaded;
      showToast(
        source === "storage"
          ? "Fichier enregistré sur Supabase Storage."
          : "Fichier enregistré localement (bucket Storage absent ou hors ligne).",
        source === "storage" ? "success" : "warning"
      );

      onAttachmentsChange([
        ...(attachments || []),
        {
          id: uid(),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          url,
          storagePath: storagePath || "",
          uploadedAt: new Date().toISOString(),
          syncStatus: source === "storage" ? "cloud" : "local",
        },
      ]);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Impossible d'ajouter le fichier.", "error");
    } finally {
      setUploadingAttachment(false);
    }
  }

  function removeAttachment(attachmentId) {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(
      (attachments || []).filter((entry) => String(entry.id) !== String(attachmentId))
    );
  }

  function openAttachment(attachment) {
    const resolved = hydrateQuoteAttachments([attachment])[0];
    if (!resolved?.url) {
      showToast(
        "Fichier indisponible sur cet appareil. Connectez-vous au CRM avec Supabase ou réimportez le fichier.",
        "warning"
      );
      return;
    }
    window.open(resolved.url, "_blank", "noopener,noreferrer");
  }

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

      <div className={`documents-form-header${isQuote ? " documents-form-header--quote" : ""}`}>
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
              QUOTE_STATUSES.map((status) => <option key={status}>{status}</option>
              )
            ) : (
              <>
                <option>Non payée</option>
                <option>Partiellement payée</option>
                <option>Payée</option>
                <option>En retard</option>
                <option>Annulée</option>
              </>
            )}
          </select>
        </label>

        {isQuote ? (
          <label className="documents-field">
            <span>Date de livraison prévue</span>
            <input
              type="date"
              value={form.promisedDeliveryDateInput || ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  promisedDeliveryDateInput: e.target.value,
                })
              }
            />
          </label>
        ) : (
          <label className="documents-field">
            <span>Date d&apos;émission</span>
            <input
              type="date"
              value={form.dateInput || ""}
              onChange={(e) => setForm({ ...form, dateInput: e.target.value })}
              data-testid="invoice-date-input"
            />
          </label>
        )}

        {isQuote && (
          <label className="documents-field">
            <span>Processus</span>
            <select
              value={form.processType || ""}
              onChange={(e) => setForm({ ...form, processType: e.target.value })}
            >
              <option value="">Auto (depuis lignes)</option>
              {PROCESS_TYPES.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isQuote && (
        <div className="documents-form-header documents-form-header--quote">
          <label className="documents-field">
            <span>Assigné à</span>
            <select
              value={form.assignedTo || ""}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              <option value="">Non assigné</option>
              {(users || [])
                .filter((user) => String(user?.status || "Actif") !== "Désactivé")
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
            </select>
          </label>

          <label className="documents-field">
            <span>Priorité atelier</span>
            <select
              value={form.priority || "normal"}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              {QUOTE_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="documents-field documents-field--wide">
            <span>Notes atelier</span>
            <input
              placeholder="Instructions opérateur, contraintes, rappels…"
              value={form.atelierNotes || ""}
              onChange={(e) => setForm({ ...form, atelierNotes: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="documents-lines-wrap">
        <div className="document-lines">
          <div className="document-line document-line-head">
            <span>Produit</span>
            <span>Description</span>
            <span>Qté</span>
            <span>Prix HT</span>
            <span>Total HT</span>
            <span></span>
          </div>

          {(form.lines || []).map((line, index) => {
            const total = lineTotal(line).totalHT;
            return (
              <div className="document-line-group" key={index}>
                <div className="document-line">
                  <ProductPicker
                    value={line.productId || ""}
                    products={products}
                    onChange={(productId) => onSelectProduct(index, productId)}
                    data-testid={`document-line-product-${index}`}
                  />
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

                {isQuote && (
                  <div className="document-line-production">
                    <label className="documents-field documents-field--compact">
                      <span>Taille</span>
                      <input
                        placeholder="ex. M, L, XL"
                        value={line.taille || ""}
                        onChange={(e) => onUpdateLine(index, { taille: e.target.value })}
                      />
                    </label>
                    <label className="documents-field documents-field--compact">
                      <span>Couleur</span>
                      <input
                        placeholder="ex. Noir, Blanc"
                        value={line.couleur || ""}
                        onChange={(e) => onUpdateLine(index, { couleur: e.target.value })}
                      />
                    </label>
                    <label className="documents-field documents-field--compact">
                      <span>Emplacement marquage</span>
                      <input
                        placeholder="ex. Poitrine, Dos"
                        value={line.emplacementMarquage || ""}
                        onChange={(e) =>
                          onUpdateLine(index, { emplacementMarquage: e.target.value })
                        }
                      />
                    </label>
                    <label className="documents-field documents-field--compact">
                      <span>Technique</span>
                      <input
                        placeholder="ex. DTF, Sérigraphie"
                        value={line.technique || ""}
                        onChange={(e) => onUpdateLine(index, { technique: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isQuote && onAttachmentsChange && (
        <div className="quote-attachments-section">
          <div className="quote-attachments-head">
            <strong>Pièces jointes</strong>
            <span className="muted">BAT, visuel client, DST, PNG…</span>
          </div>

          <p className="quote-attachments-sync-hint muted">
            {attachmentSyncReady === false
              ? "Stockage cloud indisponible — les fichiers restent sur cet appareil jusqu'à connexion Supabase (bucket « ac-creation-attachments »)."
              : attachmentSyncReady
                ? "Synchronisation Supabase Storage active — fichiers partagés entre postes."
                : "Vérification de la synchronisation…"}
          </p>

          {unavailableCount > 0 ? (
            <p className="quote-attachments-warning">
              {unavailableCount} fichier(s) enregistré(s) dans le cloud mais absent(s) ici — vérifiez le bucket Storage ou réimportez.
            </p>
          ) : null}

          {localOnlyCount > 0 && attachmentSyncReady ? (
            <p className="quote-attachments-warning">
              {localOnlyCount} fichier(s) local(aux) — réimportez après connexion pour les synchroniser.
            </p>
          ) : null}

          {hydratedAttachments.length > 0 && (
            <ul className="quote-attachments-list">
              {hydratedAttachments.map((attachment) => {
                const syncStatus = getAttachmentSyncStatus(attachment);
                return (
                <li key={attachment.id} className="quote-attachment-item">
                  <div className="quote-attachment-info">
                    <strong>{attachment.name || "Fichier"}</strong>
                    <span className="muted">
                      {attachment.mimeType || "—"}
                    </span>
                    <span className={`quote-attachment-badge quote-attachment-badge--${syncStatus}`}>
                      {getAttachmentSyncLabel(syncStatus)}
                    </span>
                  </div>
                  <div className="quote-attachment-actions">
                    <button
                      type="button"
                      className="compact"
                      disabled={!attachment.url}
                      onClick={() => openAttachment(attachment)}
                    >
                      {isPreviewableAttachment(attachment) ? "Aperçu" : "Télécharger"}
                    </button>
                    <button
                      type="button"
                      className="danger compact"
                      onClick={() => removeAttachment(attachment.id)}
                      aria-label={`Supprimer ${attachment.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
              })}
            </ul>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.dst,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={handleAttachmentUpload}
          />
          <button
            type="button"
            className="quote-attachments-add"
            disabled={uploadingAttachment}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingAttachment ? "Import en cours…" : "Ajouter un fichier"}
          </button>
        </div>
      )}

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
          <div className="documents-deposit-field">
            <label className="documents-field documents-field--inline">
              <span>Acompte %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.depositPercent || 0}
                onChange={(e) => setForm({ ...form, depositPercent: e.target.value })}
              />
            </label>
            {depositPresets.length > 0 && (
              <div className="documents-deposit-presets">
                {depositPresets.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className="compact documents-deposit-preset"
                    onClick={() => setForm({ ...form, depositPercent: percent })}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="documents-totals-panel total-box">
          <div className="documents-totals-row">
            <span>Sous-total HT</span>
            <strong>{money(totals.subtotal)}</strong>
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
          {totals.depositPercent > 0 ? (
            <>
              <div className="documents-totals-row">
                <span>Total TTC</span>
                <strong>{money(totals.totalTTC)}</strong>
              </div>
              <div className="documents-totals-row documents-totals-row--deposit">
                <span>Acompte ({totals.depositPercent}%)</span>
                <strong>{money(totals.depositAmount)}</strong>
              </div>
              <div className="documents-totals-row">
                <span>Solde</span>
                <strong>{money(totals.balanceAfterDeposit)}</strong>
              </div>
              <div className="documents-totals-row documents-totals-row--final">
                <span>À payer (acompte)</span>
                <strong>{money(totals.depositAmount)}</strong>
              </div>
            </>
          ) : (
            <div className="documents-totals-row documents-totals-row--final">
              <span>Total TTC</span>
              <strong>{money(totals.totalTTC)}</strong>
            </div>
          )}
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
