import { useEffect, useMemo, useRef, useState } from "react";
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
  hydrateQuoteAttachmentsAsync,
  isPreviewableAttachment,
} from "../../utils/quoteAttachments";
import { uid } from "../../utils/documents";
import { showToast } from "../../utils/toast";
import { isSupabaseConfigured } from "../../supabase";
import {
  applyAutomaticProductionCosts,
  estimateMissingLineCostFromTargetMargin,
  applyProductionMarginTemplate,
  computeLineInternalCosts,
  PRODUCTION_MARGIN_TEMPLATES,
} from "../../utils/quoteMarginAssistant";
import ProductPicker from "./ProductPicker";

export function ClientCombobox({ clients, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find((c) => c.id === value) || null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      )
    : clients;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function select(id) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="client-combobox">
      <div
        className={`client-combobox__trigger${open ? " client-combobox__trigger--open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
        }}
        tabIndex={0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "" : "client-combobox__placeholder"}>
          {selected ? selected.name : "Choisir un client"}
        </span>
        <span className="client-combobox__chevron" aria-hidden="true">▾</span>
      </div>
      {open && (
        <div className="client-combobox__dropdown">
          <div className="client-combobox__search-wrap">
            <input
              ref={inputRef}
              type="text"
              className="client-combobox__search"
              placeholder="Rechercher un client…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="client-combobox__list" role="listbox">
            <li
              role="option"
              aria-selected={!value}
              className={`client-combobox__option client-combobox__option--none${!value ? " client-combobox__option--active" : ""}`}
              onClick={() => select("")}
            >
              — Aucun client —
            </li>
            {filtered.length === 0 ? (
              <li className="client-combobox__empty">Aucun résultat pour « {query} »</li>
            ) : (
              filtered.map((c) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={c.id === value}
                  className={`client-combobox__option${c.id === value ? " client-combobox__option--active" : ""}`}
                  onClick={() => select(c.id)}
                >
                  <span className="client-combobox__option-name">{c.name}</span>
                  {c.email && <span className="client-combobox__option-email">{c.email}</span>}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

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
  nextAutoNumber = "",
}) {
  const fileInputRef = useRef(null);
  const resolvedAttachmentsRef = useRef([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentSyncReady, setAttachmentSyncReady] = useState(null);
  const [resolvedAttachments, setResolvedAttachments] = useState([]);

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

  useEffect(() => {
    let cancelled = false;
    async function resolveAttachments() {
      if (!isQuote || !onAttachmentsChange) {
        if (!cancelled) setResolvedAttachments([]);
        return;
      }
      setResolvedAttachments(hydrateQuoteAttachments(attachments || []));
      try {
        const hydrated = await hydrateQuoteAttachmentsAsync(attachments || []);
        if (!cancelled) setResolvedAttachments(hydrated);
      } catch (error) {
        console.error(error);
        if (!cancelled) setResolvedAttachments(hydrateQuoteAttachments(attachments || []));
      }
    }
    resolveAttachments();
    return () => {
      cancelled = true;
    };
  }, [attachments, isQuote, onAttachmentsChange]);

  useEffect(
    () => () => {
      setUploadingAttachment(false);
      resolvedAttachmentsRef.current.forEach((attachment) => {
        const url = String(attachment?.url || "");
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
    },
    []
  );

  const hydratedAttachments = resolvedAttachments;
  resolvedAttachmentsRef.current = hydratedAttachments;
  const localOnlyCount = hydratedAttachments.filter(
    (entry) => getAttachmentSyncStatus(entry) === "local"
  ).length;
  const unavailableCount = hydratedAttachments.filter(
    (entry) => !entry.url && entry.storagePath
  ).length;
  const marginSummary = useMemo(() => {
    const rows = (form.lines || []).map((line) => computeLineInternalCosts(line, products));
    const totalCost = rows.reduce((sum, row) => sum + Number(row.totalCost || 0), 0);
    const revenueHT = rows.reduce((sum, row) => sum + Number(row.revenueHT || 0), 0);
    const marginHT = rows.reduce((sum, row) => sum + Number(row.marginHT || 0), 0);
    const lowMarginCount = rows.filter((row) => row.isLowMargin).length;
    const missingCostCount = rows.filter((row) => !row.hasCost && row.revenueHT > 0).length;
    const autoCostCount = rows.filter((row) => row.automaticCosts?.hasAutoCost).length;
    const estimableCostCount = rows.filter((row) => !row.hasCost && row.revenueHT > 0).length;
    const suggestedPriceCount = rows.filter((row) => row.suggestedUnitPrice > 0 && row.isLowMargin).length;
    return {
      rows,
      totalCost,
      revenueHT,
      marginHT,
      marginRate: revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0,
      lowMarginCount,
      missingCostCount,
      autoCostCount,
      estimableCostCount,
      suggestedPriceCount,
    };
  }, [form.lines, products]);

  function applyAllAutomaticCosts() {
    setForm({
      ...form,
      lines: (form.lines || []).map((line) =>
        computeLineInternalCosts(line, products).automaticCosts.hasAutoCost
          ? applyAutomaticProductionCosts(line)
          : line
      ),
    });
  }

  function applySuggestedPrices() {
    setForm({
      ...form,
      lines: (form.lines || []).map((line) => {
        const margin = computeLineInternalCosts(line, products);
        return margin.suggestedUnitPrice > 0 && margin.isLowMargin
          ? { ...line, price: margin.suggestedUnitPrice }
          : line;
      }),
    });
  }

  function estimateMissingCosts() {
    setForm({
      ...form,
      lines: (form.lines || []).map((line) =>
        estimateMissingLineCostFromTargetMargin(line, products)
      ),
    });
  }

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
      const { url, storagePath, source, localBlobId } = uploaded;
      showToast(
        source === "storage"
          ? "Fichier enregistré sur Supabase Storage."
          : source === "local-idb"
            ? "Fichier volumineux enregistré localement (IndexedDB)."
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
          localBlobId: localBlobId || "",
          uploadedAt: new Date().toISOString(),
          syncStatus:
            source === "storage" ? "cloud" : source === "local-idb" ? "local-idb" : "local",
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

  async function openAttachment(attachment) {
    const [resolved] = await hydrateQuoteAttachmentsAsync([attachment]);
    if (!resolved?.url) {
      showToast(
        resolved?.localBlobId
          ? "Fichier local introuvable (IndexedDB). Réexportez depuis le configurateur ou réimportez le fichier."
          : "Fichier indisponible sur cet appareil. Connectez-vous au CRM avec Supabase ou réimportez le fichier.",
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
        <div className="documents-field">
          <span>Client</span>
          <ClientCombobox
            clients={clients}
            value={form.clientId}
            onChange={(id) => setForm({ ...form, clientId: id })}
          />
        </div>

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

        {!editingId && (
          <label className="documents-field">
            <span>N° {isQuote ? "devis" : "facture"}</span>
            <input
              type="text"
              placeholder={nextAutoNumber || "Automatique"}
              value={form.numberOverride || ""}
              onChange={(e) => setForm({ ...form, numberOverride: e.target.value })}
              title="Laisser vide pour numérotation automatique"
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
        <div className={`document-margin-summary${marginSummary.lowMarginCount > 0 || marginSummary.missingCostCount > 0 ? " document-margin-summary--warning" : ""}`}>
          <div>
            <strong>Assistant rentabilite</strong>
            <span>
              Cout {money(marginSummary.totalCost)} - Marge {money(marginSummary.marginHT)} ({marginSummary.marginRate} %)
            </span>
          </div>
          <div className="document-margin-summary__signals">
            {marginSummary.missingCostCount > 0 ? <span>{marginSummary.missingCostCount} cout(s) inconnu(s)</span> : null}
            {marginSummary.lowMarginCount > 0 ? <span>{marginSummary.lowMarginCount} marge(s) faible(s)</span> : null}
            {marginSummary.missingCostCount === 0 && marginSummary.lowMarginCount === 0 ? <span>Rentabilite suivie</span> : null}
          </div>
          <div className="document-margin-summary__actions">
            <button
              type="button"
              className="compact"
              disabled={marginSummary.autoCostCount === 0}
              onClick={applyAllAutomaticCosts}
            >
              Calculer tous les couts
            </button>
            <button
              type="button"
              className="compact"
              disabled={marginSummary.estimableCostCount === 0}
              onClick={estimateMissingCosts}
            >
              Estimer couts inconnus
            </button>
            <button
              type="button"
              className="compact"
              disabled={marginSummary.suggestedPriceCount === 0}
              onClick={applySuggestedPrices}
            >
              Appliquer prix conseilles
            </button>
          </div>
        </div>
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
            const margin = computeLineInternalCosts(line, products);
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
                <div className="document-line-margin-assistant">
                    <div className="document-line-margin-assistant__head">
                      <strong>Assistant marge interne</strong>
                      <span>
                        Coût {money(margin.totalCost)} · Marge {money(margin.marginHT)} ({margin.marginRate} %)
                      </span>
                    </div>
                    <div className="document-line-margin-assistant__grid">
                      <label className="documents-field documents-field--compact">
                        <span>Modèle</span>
                        <select
                          value={line.productionTemplateId || ""}
                          onChange={(e) =>
                            onUpdateLine(index, applyProductionMarginTemplate(line, e.target.value))
                          }
                        >
                          <option value="">Aucun</option>
                          {PRODUCTION_MARGIN_TEMPLATES.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Support HT</span>
                        <input type="number" min="0" step="0.01" value={line.purchasePrice || ""} onChange={(e) => onUpdateLine(index, { purchasePrice: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Matières HT</span>
                        <input type="number" min="0" step="0.01" value={line.materialCost || ""} onChange={(e) => onUpdateLine(index, { materialCost: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Largeur cm</span>
                        <input type="number" min="0" step="0.1" value={line.printWidthCm || ""} onChange={(e) => onUpdateLine(index, { printWidthCm: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Hauteur cm</span>
                        <input type="number" min="0" step="0.1" value={line.printHeightCm || ""} onChange={(e) => onUpdateLine(index, { printHeightCm: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Prix matière / m²</span>
                        <input type="number" min="0" step="0.01" value={line.materialPricePerM2 || ""} onChange={(e) => onUpdateLine(index, { materialPricePerM2: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Temps opérateur</span>
                        <input type="number" min="0" step="1" value={line.laborMinutes || ""} onChange={(e) => onUpdateLine(index, { laborMinutes: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Taux horaire</span>
                        <input type="number" min="0" step="0.01" value={line.laborHourlyRate || ""} onChange={(e) => onUpdateLine(index, { laborHourlyRate: e.target.value })} placeholder="18" />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Temps machine</span>
                        <input type="number" min="0" step="1" value={line.machineMinutes || ""} onChange={(e) => onUpdateLine(index, { machineMinutes: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Taux machine</span>
                        <input type="number" min="0" step="0.01" value={line.machineHourlyRate || ""} onChange={(e) => onUpdateLine(index, { machineHourlyRate: e.target.value })} placeholder="25" />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Machine HT</span>
                        <input type="number" min="0" step="0.01" value={line.machineCost || ""} onChange={(e) => onUpdateLine(index, { machineCost: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Sous-traitance</span>
                        <input type="number" min="0" step="0.01" value={line.subcontractingCost || ""} onChange={(e) => onUpdateLine(index, { subcontractingCost: e.target.value })} />
                      </label>
                      <label className="documents-field documents-field--compact">
                        <span>Marge cible %</span>
                        <input type="number" min="0" max="95" step="1" value={line.targetMarginRate || ""} onChange={(e) => onUpdateLine(index, { targetMarginRate: e.target.value })} placeholder="60" />
                      </label>
                      <button
                        type="button"
                        className="compact document-line-margin-assistant__price"
                        disabled={!margin.automaticCosts.hasAutoCost}
                        onClick={() => onUpdateLine(index, applyAutomaticProductionCosts(line))}
                      >
                        Calculer coûts {money(margin.automaticCosts.totalCost)}
                      </button>
                      <button
                        type="button"
                        className="compact document-line-margin-assistant__price"
                        disabled={margin.hasCost || margin.revenueHT <= 0}
                        onClick={() => onUpdateLine(index, estimateMissingLineCostFromTargetMargin(line, products))}
                      >
                        Estimer coût {money(margin.maxCostForTargetMargin)}
                      </button>
                      <button
                        type="button"
                        className="compact document-line-margin-assistant__price"
                        disabled={!margin.suggestedUnitPrice}
                        onClick={() => onUpdateLine(index, { price: margin.suggestedUnitPrice })}
                      >
                        Prix conseillé {money(margin.suggestedUnitPrice)}
                      </button>
                    </div>
                    {margin.automaticCosts.hasAutoCost && (
                      <p className="document-line-margin-assistant__auto">
                        Auto : {margin.automaticCosts.surfaceM2} m² · matière {money(margin.automaticCosts.materialCost)} · machine {money(margin.automaticCosts.machineCost)} · opérateur {money(margin.automaticCosts.operatorCost)}
                      </p>
                    )}
                    {!margin.hasCost && margin.revenueHT > 0 && (
                      <p className="document-line-margin-assistant__auto">
                        Cout cible max pour {margin.targetMarginRate} % de marge : {money(margin.maxCostForTargetMargin)}
                      </p>
                    )}
                    {margin.isLowMargin && (
                      <p className="document-line-margin-assistant__warning">
                        Marge sous l'objectif : augmente le prix ou ajuste les coûts.
                      </p>
                    )}
                  </div>
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
                      disabled={!attachment.url && !attachment.localBlobId}
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
