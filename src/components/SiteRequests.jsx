import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  SITE_REQUEST_STATUS,
  evaluateSiteRequestCompleteness,
  isEcommerceSiteRequest,
  siteRequestApplicationService,
} from "../application/SiteRequestApplicationService.js";
import { canManageWorkshop } from "../utils/permissions.js";
import { showToast } from "../utils/toast.js";
import {
  buildProductionManifest,
  buildProductionPackage,
  downloadBytes,
  downloadProductionPdf,
  downloadProductionResource,
  inspectProductionArtifacts,
} from "../utils/productionPackage.js";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CreditCard,
  Download,
  ExternalLink,
  History,
  Package,
  Send,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const FILTERS = [
  ["active", "A traiter"],
  ["new", "Nouvelles"],
  ["unopened", "Non ouvertes"],
  [SITE_REQUEST_STATUS.AWAITING_REVIEW, "A verifier"],
  [SITE_REQUEST_STATUS.INCOMPLETE, "Incompletes"],
  [SITE_REQUEST_STATUS.APPROVED, "Validees"],
  [SITE_REQUEST_STATUS.REJECTED, "Refusees"],
  ["all", "Toutes"],
];

const ACTIVE_STATUSES = new Set([
  SITE_REQUEST_STATUS.NEW,
  SITE_REQUEST_STATUS.OPENED,
  SITE_REQUEST_STATUS.AWAITING_REVIEW,
  SITE_REQUEST_STATUS.INCOMPLETE,
  SITE_REQUEST_STATUS.APPROVED,
]);

const STATUS_LABELS = {
  [SITE_REQUEST_STATUS.NEW]: "Nouvelle",
  [SITE_REQUEST_STATUS.OPENED]: "Ouverte",
  [SITE_REQUEST_STATUS.AWAITING_REVIEW]: "A controler",
  [SITE_REQUEST_STATUS.INCOMPLETE]: "Incomplete",
  [SITE_REQUEST_STATUS.APPROVED]: "Validee",
  [SITE_REQUEST_STATUS.SENT_TO_WORKSHOP]: "Envoyee a l'atelier",
  [SITE_REQUEST_STATUS.REJECTED]: "Refusee",
  [SITE_REQUEST_STATUS.CANCELLED]: "Annulee",
};

const HISTORY_LABELS = {
  received: "Commande recue",
  payment_confirmed: "Paiement confirme",
  opened: "Ouverture",
  review_started: "Controle commence",
  information_requested: "Informations demandees",
  marked_incomplete: "Commande marquee incomplete",
  approved: "Validation",
  sent_to_workshop: "Envoi a l'atelier",
  rejected: "Commande refusee",
  cancelled: "Commande annulee",
};

function statusLabel(status) {
  return STATUS_LABELS[status] || "Nouvelle";
}

function historyLabel(entry) {
  return (
    HISTORY_LABELS[entry.action] ||
    STATUS_LABELS[entry.nextStatus] ||
    "Mise a jour"
  );
}

function formatAddress(address) {
  if (!address) return "Non renseignee";
  return [
    address.addressLine1,
    address.addressLine2,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function resourceSize(resource) {
  const bytes = Number(resource?.size || resource?.byteLength || 0);
  if (!bytes) return "—";
  return bytes < 1_000_000
    ? `${Math.round(bytes / 1000)} Ko`
    : `${(bytes / 1_000_000).toFixed(1)} Mo`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("fr-FR") : "-";
}

function money(value, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
    Number(value || 0),
  );
}

function assetCounts(request) {
  const snapshots = (request.lines || [])
    .map((line) => line.snapshot)
    .filter(Boolean);
  const serialized = JSON.stringify(snapshots);
  return {
    images: (serialized.match(/image/gi) || []).length,
    texts: (serialized.match(/text/gi) || []).length,
    fonts: (request.ecommerce?.fonts || []).length,
    files:
      (request.ecommerce?.assets || []).length +
      (request.ecommerce?.resources || []).length,
  };
}

export default function SiteRequests({
  data,
  setData,
  currentRole,
  currentUser,
  logActivity,
}) {
  const [filter, setFilter] = useState("active");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detailTab, setDetailTab] = useState("overview");
  const [previewZoom, setPreviewZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const requests = useMemo(
    () => (data.quotes || []).filter(isEcommerceSiteRequest),
    [data.quotes],
  );
  const clients = useMemo(
    () =>
      new Map(
        (data.clients || []).map((client) => [String(client.id), client]),
      ),
    [data.clients],
  );
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return requests.filter((request) => {
      const status = request.ecommerce.reviewStatus || SITE_REQUEST_STATUS.NEW;
      if (filter === "active" && !ACTIVE_STATUSES.has(status)) return false;
      if (filter === "unopened" && request.ecommerce.openedAt) return false;
      if (!["active", "unopened", "all"].includes(filter) && status !== filter)
        return false;
      if (!normalizedQuery) return true;
      const client = clients.get(String(request.clientId));
      return [
        request.number,
        request.ecommerce.siteOrderNumber,
        client?.name,
        client?.email,
        ...(request.lines || []).map((line) => line.description),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(normalizedQuery);
    });
  }, [clients, filter, query, requests]);
  const selected = requests.find(
    (request) => String(request.id) === selectedId,
  );

  function transition(request, nextStatus, action, comment = "") {
    setData((current) =>
      siteRequestApplicationService.transition(
        current,
        request.id,
        nextStatus,
        {
          action,
          comment,
          actor: currentUser,
          correlationId: request.ecommerce.externalOrderId,
        },
      ),
    );
    logActivity?.(`Demande du site: ${action}`, request.number);
  }

  function openRequest(request) {
    setSelectedId(String(request.id));
    setDetailTab("overview");
    setPreviewZoom(1);
    if (!request.ecommerce.openedAt) {
      transition(request, SITE_REQUEST_STATUS.OPENED, "opened");
    }
  }

  function sendToWorkshop(request) {
    const completeness = evaluateSiteRequestCompleteness(request);
    if (!completeness.canSendToWorkshop) {
      showToast(
        `Envoi bloque: ${completeness.missing.map((item) => item.message).join(", ")}.`,
        "error",
      );
      return;
    }
    if (!canManageWorkshop(currentRole)) {
      showToast("Permission Atelier requise.", "error");
      return;
    }
    if (!window.confirm(`Envoyer la commande ${request.number} a l'atelier ?`))
      return;
    setData((current) =>
      siteRequestApplicationService.sendToWorkshop(current, request.id, {
        actor: currentUser,
        correlationId: request.ecommerce.externalOrderId,
      }),
    );
    logActivity?.("Demande envoyee a l'atelier", request.number);
    setSelectedId("");
    showToast("Commande envoyee a l'atelier.", "success");
  }

  async function downloadPackage(request) {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await buildProductionPackage({
        quote: request,
        client: clients.get(String(request.clientId)),
      });
      downloadBytes(result.bytes, result.filename, "application/zip");
      showToast(
        result.complete
          ? "Package de production telecharge."
          : "Package telecharge avec des artefacts manquants signales dans le manifest.",
        result.complete ? "success" : "warning",
      );
    } catch (error) {
      showToast(error.message || "Generation du package impossible.", "error");
    } finally {
      setExporting(false);
    }
  }

  function openConfigurator(request) {
    const url = inspectProductionArtifacts(request).resumeUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadResource(resource, filename, type) {
    try {
      await downloadProductionResource(resource, filename, type);
    } catch (error) {
      showToast(
        error.message === "PRODUCTION_RESOURCE_URL_MISSING"
          ? "Le site n'a pas fourni d'URL temporaire pour ce fichier."
          : "Telechargement du fichier impossible.",
        "error",
      );
    }
  }

  function downloadJson(value, filename) {
    downloadBytes(
      new TextEncoder().encode(JSON.stringify(value, null, 2)),
      filename,
      "application/json",
    );
  }

  return (
    <section className="site-requests" data-testid="site-requests-page">
      <header className="page-header">
        <div>
          <h2>Demandes du site</h2>
          <p>
            Controle obligatoire des commandes e-commerce avant leur entree en
            atelier.
          </p>
        </div>
        <span className="site-requests__total">
          {visible.length} demande(s)
        </span>
      </header>

      <div className="site-requests__toolbar card">
        <label>
          <span className="sr-only">Rechercher une demande</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Commande, client, email ou produit"
          />
        </label>
        <div
          className="site-requests__filters"
          aria-label="Filtrer les demandes"
        >
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : "ghost"}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card leads-empty">Aucune demande pour ce filtre.</div>
      ) : (
        <div className="site-requests__list">
          {visible.map((request) => {
            const client = clients.get(String(request.clientId));
            const counts = assetCounts(request);
            const completeness = evaluateSiteRequestCompleteness(request);
            return (
              <button
                type="button"
                className="card site-request-card"
                key={request.id}
                onClick={() => openRequest(request)}
                data-testid={`site-request-${request.id}`}
              >
                <span>
                  <strong>
                    {request.ecommerce.siteOrderNumber || request.number}
                  </strong>
                  <small>{formatDate(request.ecommerce.receivedAt)}</small>
                </span>
                <span>
                  {client?.name || "Client inconnu"}
                  <small>{client?.email}</small>
                </span>
                <span>
                  {(request.lines || []).reduce(
                    (sum, line) => sum + Number(line.quantity || 0),
                    0,
                  )}{" "}
                  article(s)<small>{request.lines?.[0]?.description}</small>
                </span>
                <span>{money(request.totalTTC, request.currency)}</span>
                <span
                  className={`site-request-status site-request-status--${completeness.state}`}
                >
                  {statusLabel(request.ecommerce.reviewStatus)} ·{" "}
                  {completeness.canSendToWorkshop ? "Complet" : "Incomplet"}
                  <small>
                    {counts.images} image(s) · {counts.texts} texte(s) ·{" "}
                    {counts.fonts} police(s) · {counts.files} fichier(s)
                  </small>
                </span>
                {!request.ecommerce.openedAt ? (
                  <span className="site-request-unread">Non ouverte</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selected
        ? createPortal(
            <div className="site-request-detail-backdrop">
              <div
                className="site-request-detail"
                role="dialog"
                aria-modal="true"
                aria-labelledby="site-request-title"
              >
                <header className="site-request-detail__header">
                  <div>
                    <span className="site-request-detail__eyebrow">
                      Commande du site
                    </span>
                    <h3 id="site-request-title">{selected.number}</h3>
                    <div className="site-request-detail__meta">
                      <span
                        className={`site-request-review-badge site-request-review-badge--${selected.ecommerce.reviewStatus}`}
                      >
                        {statusLabel(selected.ecommerce.reviewStatus)}
                      </span>
                      <span
                        className={`site-request-payment-badge site-request-payment-badge--${selected.ecommerce.paymentStatus}`}
                      >
                        {selected.ecommerce.paymentStatus === "paid"
                          ? "Paiement confirme"
                          : "Paiement a verifier"}
                      </span>
                      <span>{formatDate(selected.ecommerce.receivedAt)}</span>
                      <span>Provenance : Site</span>
                    </div>
                  </div>
                  <div className="site-request-detail__amount">
                    <small>Montant TTC</small>
                    <strong>
                      {money(selected.totalTTC, selected.currency)}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="site-request-detail__close"
                    onClick={() => setSelectedId("")}
                    aria-label="Fermer la fiche"
                  >
                    <X size={20} />
                  </button>
                </header>

                <nav
                  className="site-request-detail__tabs"
                  aria-label="Sections de la fiche"
                >
                  <button
                    type="button"
                    className={detailTab === "overview" ? "active" : ""}
                    onClick={() => setDetailTab("overview")}
                  >
                    Vue d'ensemble
                  </button>
                  <button
                    type="button"
                    className={detailTab === "personalization" ? "active" : ""}
                    onClick={() => setDetailTab("personalization")}
                  >
                    Personnalisation
                  </button>
                  <button
                    type="button"
                    className={detailTab === "production" ? "active" : ""}
                    onClick={() => setDetailTab("production")}
                  >
                    Production
                  </button>
                  <button
                    type="button"
                    className={detailTab === "history" ? "active" : ""}
                    onClick={() => setDetailTab("history")}
                  >
                    <History size={16} /> Historique (
                    {selected.ecommerce.history?.length || 0})
                  </button>
                </nav>

                <div className="site-request-detail__scroll">
                  {detailTab === "history" ? (
                    <section className="erp-card site-request-timeline">
                      <h4>
                        <History size={18} /> Suivi de traitement
                      </h4>
                      <ol>
                        {(selected.ecommerce.history || []).map((entry) => (
                          <li key={entry.id}>
                            <span />
                            <div>
                              <strong>{historyLabel(entry)}</strong>
                              <small>
                                {formatDate(entry.at)} · {entry.actor}
                              </small>
                              {entry.comment ? <p>{entry.comment}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : detailTab === "personalization" ? (
                    <section className="erp-card">
                      <h4>Elements de personnalisation recus</h4>
                      <div className="site-request-resources">
                        {[
                          ...inspectProductionArtifacts(selected).images.map(
                            (resource, index) => ["Image", resource, index],
                          ),
                          ...inspectProductionArtifacts(selected).svgs.map(
                            (resource, index) => ["SVG", resource, index],
                          ),
                          ...inspectProductionArtifacts(selected).fonts.map(
                            (resource, index) => ["Police", resource, index],
                          ),
                        ].map(([kind, resource, index]) => (
                          <article key={`${kind}-${index}`}>
                            <div>
                              <strong>
                                {resource?.name ||
                                  resource?.filename ||
                                  resource?.storage_path ||
                                  `${kind} ${index + 1}`}
                              </strong>
                              <small>
                                {kind} ·{" "}
                                {resource?.mimeType ||
                                  resource?.type ||
                                  "Format non renseigne"}{" "}
                                · {resourceSize(resource)}
                              </small>
                            </div>
                            <span>
                              {resource?.width && resource?.height
                                ? `${resource.width} × ${resource.height}px`
                                : "Original"}
                            </span>
                          </article>
                        ))}
                        {assetCounts(selected).texts > 0 ? (
                          <article>
                            <div>
                              <strong>Calques de texte</strong>
                              <small>
                                Contenu conserve dans Configurateur.json
                              </small>
                            </div>
                            <span>{assetCounts(selected).texts}</span>
                          </article>
                        ) : null}
                      </div>
                    </section>
                  ) : detailTab === "production" ? (
                    <section className="erp-card">
                      <h4>Fichiers de production</h4>
                      <div className="site-request-resources">
                        {(selected.ecommerce.resources || []).map(
                          (resource, index) => (
                            <article key={resource.id || index}>
                              <div>
                                <strong>
                                  {resource.name || "Fichier production"}
                                </strong>
                                <small>
                                  {resource.mimeType ||
                                    resource.format ||
                                    "Format inconnu"}{" "}
                                  · {resourceSize(resource)}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                  downloadResource(
                                    resource,
                                    resource.name || "ressource-production",
                                    resource.mimeType,
                                  )
                                }
                              >
                                <Download size={15} /> Telecharger
                              </button>
                            </article>
                          ),
                        )}
                        <article>
                          <div>
                            <strong>Manifest de production</strong>
                            <small>
                              Dimensions, ressources et controles d'integrite
                              inclus dans le ZIP
                            </small>
                          </div>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              downloadJson(
                                buildProductionManifest(selected),
                                "Manifest.json",
                              )
                            }
                          >
                            <Download size={15} /> Telecharger
                          </button>
                        </article>
                      </div>
                    </section>
                  ) : (
                    <div className="site-request-detail__layout">
                      <div className="site-request-detail__column">
                        <section className="erp-card">
                          <h4>
                            <User size={18} /> Client
                          </h4>
                          <dl className="erp-definition-list">
                            <div>
                              <dt>Nom</dt>
                              <dd>
                                {clients.get(String(selected.clientId))?.name ||
                                  "Non renseigne"}
                              </dd>
                            </div>
                            <div>
                              <dt>Email</dt>
                              <dd>
                                {clients.get(String(selected.clientId))
                                  ?.email || "Non renseigne"}
                              </dd>
                            </div>
                            <div>
                              <dt>Telephone</dt>
                              <dd>
                                {clients.get(String(selected.clientId))
                                  ?.phone || "Non renseigne"}
                              </dd>
                            </div>
                            <div>
                              <dt>Livraison</dt>
                              <dd>{formatAddress(selected.shippingAddress)}</dd>
                            </div>
                            <div>
                              <dt>Facturation</dt>
                              <dd>{formatAddress(selected.billingAddress)}</dd>
                            </div>
                            <div>
                              <dt>Commentaire</dt>
                              <dd>{selected.comment || "Aucun commentaire"}</dd>
                            </div>
                          </dl>
                        </section>
                        <section className="erp-card">
                          <h4>
                            <Package size={18} /> Commande
                          </h4>
                          <div className="site-request-products">
                            {selected.lines?.map((line) => (
                              <article key={line.id}>
                                <div>
                                  <strong>{line.description}</strong>
                                  <small>
                                    {line.technique ||
                                      "Technique non renseignee"}
                                  </small>
                                </div>
                                <span>
                                  {line.quantity} ×{" "}
                                  {money(line.unitPrice, selected.currency)}
                                </span>
                                <strong>
                                  {money(line.total, selected.currency)}
                                </strong>
                              </article>
                            ))}
                          </div>
                          <dl className="site-request-totals">
                            <div>
                              <dt>Livraison</dt>
                              <dd>
                                {money(selected.shipping, selected.currency)}
                              </dd>
                            </div>
                            <div>
                              <dt>TVA</dt>
                              <dd>
                                {money(selected.totalTVA, selected.currency)}
                              </dd>
                            </div>
                            <div>
                              <dt>Total TTC</dt>
                              <dd>
                                {money(selected.totalTTC, selected.currency)}
                              </dd>
                            </div>
                          </dl>
                        </section>
                        <section className="erp-card erp-card--preview">
                          <div className="erp-card__title">
                            <h4>Apercu de personnalisation</h4>
                            <div>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() =>
                                  setPreviewZoom((value) =>
                                    Math.max(0.75, value - 0.25),
                                  )
                                }
                                aria-label="Reduire l'apercu"
                              >
                                <ZoomOut size={17} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() =>
                                  setPreviewZoom((value) =>
                                    Math.min(2, value + 0.25),
                                  )
                                }
                                aria-label="Agrandir l'apercu"
                              >
                                <ZoomIn size={17} />
                              </button>
                            </div>
                          </div>
                          <div className="site-request-preview">
                            {typeof selected.ecommerce.preview === "string" &&
                            selected.ecommerce.preview ? (
                              <img
                                src={selected.ecommerce.preview}
                                alt={`Apercu de ${selected.number}`}
                                style={{ transform: `scale(${previewZoom})` }}
                              />
                            ) : (
                              <div>
                                <Package size={40} />
                                <strong>Apercu non disponible</strong>
                                <small>
                                  Le snapshot reste accessible dans les fichiers
                                  de production.
                                </small>
                              </div>
                            )}
                          </div>
                        </section>
                      </div>

                      <div className="site-request-detail__column">
                        <section className="erp-card erp-card--compact">
                          <h4>
                            <CreditCard size={18} /> Paiement
                          </h4>
                          <dl className="erp-definition-list erp-definition-list--inline">
                            <div>
                              <dt>Etat</dt>
                              <dd>
                                {selected.ecommerce.paymentStatus === "paid"
                                  ? "Confirme"
                                  : "A verifier"}
                              </dd>
                            </div>
                            <div>
                              <dt>Mode</dt>
                              <dd>
                                {selected.ecommerce.paymentProvider ||
                                  "E-commerce"}
                              </dd>
                            </div>
                            <div>
                              <dt>Montant</dt>
                              <dd>
                                {money(selected.totalTTC, selected.currency)}
                              </dd>
                            </div>
                          </dl>
                        </section>
                        <section className="erp-card erp-card--compact">
                          <h4>
                            <Cloud size={18} /> Synchronisation
                          </h4>
                          <div className="site-request-sync">
                            <CheckCircle2 size={20} />
                            <div>
                              <strong>Commande recue</strong>
                              <small>
                                ID externe :{" "}
                                {selected.ecommerce.externalOrderId}
                              </small>
                            </div>
                          </div>
                        </section>
                        <section className="erp-card">
                          <h4>Personnalisation</h4>
                          <div className="site-request-resources">
                            {[
                              [
                                "Images",
                                assetCounts(selected).images,
                                selected.ecommerce.assets?.[0],
                              ],
                              ["Textes", assetCounts(selected).texts, null],
                              [
                                "Polices",
                                assetCounts(selected).fonts,
                                selected.ecommerce.fonts?.[0],
                              ],
                              [
                                "SVG",
                                (selected.ecommerce.assets || []).filter(
                                  (asset) =>
                                    String(
                                      asset.type || asset.storage_path || "",
                                    ).includes("svg"),
                                ).length,
                                null,
                              ],
                              [
                                "Snapshot",
                                selected.ecommerce.snapshot ? 1 : 0,
                                selected.ecommerce.snapshot,
                              ],
                              [
                                "Preview",
                                selected.ecommerce.preview ? 1 : 0,
                                selected.ecommerce.preview,
                              ],
                              [
                                "PNG impression",
                                (selected.ecommerce.resources || []).filter(
                                  (file) =>
                                    String(
                                      file.type || file.storage_path || "",
                                    ).includes("png"),
                                ).length,
                                null,
                              ],
                              [
                                "Package production",
                                (selected.ecommerce.production || []).length,
                                selected.ecommerce.resources?.[0],
                              ],
                            ].map(([label, count, resource]) => (
                              <article key={label}>
                                <div>
                                  <strong>{label}</strong>
                                  <small>
                                    {Number(count) > 0
                                      ? "Disponible"
                                      : "Absent"}{" "}
                                    · {resourceSize(resource)}
                                  </small>
                                </div>
                                <span>{count}</span>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  disabled
                                  aria-label={`Ouvrir ${label}`}
                                >
                                  <ExternalLink size={15} />
                                </button>
                              </article>
                            ))}
                          </div>
                        </section>
                        <section
                          className={`erp-card site-request-completeness site-request-completeness--${evaluateSiteRequestCompleteness(selected).state}`}
                        >
                          <div className="erp-card__title">
                            <h4>
                              {evaluateSiteRequestCompleteness(selected)
                                .canSendToWorkshop ? (
                                <CheckCircle2 size={19} />
                              ) : (
                                <AlertTriangle size={19} />
                              )}{" "}
                              Controle de completude
                            </h4>
                            <strong>
                              {evaluateSiteRequestCompleteness(selected)
                                .canSendToWorkshop
                                ? "Complet"
                                : "Incomplet"}
                            </strong>
                          </div>
                          <ul>
                            {[
                              [
                                "Paiement confirme",
                                selected.ecommerce.paymentStatus === "paid",
                              ],
                              [
                                "Snapshot present",
                                Boolean(selected.ecommerce.snapshot),
                              ],
                              [
                                "Ressources binaires verifiees",
                                selected.ecommerce.resourceValidation
                                  ?.complete === true,
                              ],
                              [
                                "Package de production",
                                (selected.ecommerce.production || []).length >
                                  0 ||
                                  selected.lines?.some(
                                    (line) => line.snapshot?.productionProfile,
                                  ),
                              ],
                              [
                                "Synchronisation CRM",
                                Boolean(selected.ecommerce.externalOrderId),
                              ],
                            ].map(([label, complete]) => (
                              <li
                                key={label}
                                className={complete ? "complete" : "missing"}
                              >
                                {complete ? (
                                  <CheckCircle2 size={16} />
                                ) : (
                                  <AlertTriangle size={16} />
                                )}
                                {label}
                              </li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </div>
                  )}
                </div>

                <footer className="site-request-actionbar">
                  <div className="site-request-actionbar__primary">
                    <button
                      type="button"
                      className="ghost"
                      disabled={!inspectProductionArtifacts(selected).resumeUrl}
                      onClick={() => openConfigurator(selected)}
                    >
                      <ExternalLink size={17} /> Ouvrir le projet
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={exporting}
                      onClick={() => downloadPackage(selected)}
                    >
                      <Download size={17} />
                      {exporting ? "Generation..." : "Telecharger le package"}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={exporting}
                      onClick={() =>
                        downloadProductionPdf(
                          selected,
                          clients.get(String(selected.clientId)),
                        ).catch(() =>
                          showToast("Generation du PDF impossible.", "error"),
                        )
                      }
                    >
                      <Download size={17} /> Bon PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => sendToWorkshop(selected)}
                    >
                      <Send size={17} /> Envoyer a l'atelier
                    </button>
                  </div>
                  <div className="site-request-actionbar__secondary">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        transition(
                          selected,
                          SITE_REQUEST_STATUS.AWAITING_REVIEW,
                          "review_started",
                        )
                      }
                    >
                      Verifier
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        transition(
                          selected,
                          SITE_REQUEST_STATUS.INCOMPLETE,
                          "information_requested",
                          "Informations complementaires demandees",
                        )
                      }
                    >
                      Demander des informations
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        transition(
                          selected,
                          SITE_REQUEST_STATUS.INCOMPLETE,
                          "marked_incomplete",
                        )
                      }
                    >
                      Marquer incomplete
                    </button>
                    <button
                      type="button"
                      className="ghost danger-text"
                      onClick={() =>
                        transition(
                          selected,
                          SITE_REQUEST_STATUS.REJECTED,
                          "rejected",
                        )
                      }
                    >
                      Refuser
                    </button>
                    <button
                      type="button"
                      className="ghost danger-text"
                      onClick={() =>
                        transition(
                          selected,
                          SITE_REQUEST_STATUS.CANCELLED,
                          "cancelled",
                        )
                      }
                    >
                      Annuler
                    </button>
                  </div>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
