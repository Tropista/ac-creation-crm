import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import DocumentPreview from "./DocumentPreview";
import { money } from "../utils/money";
import { statusClass } from "../utils/documents";
import { getClientPortalProgress, getInvoicePaymentLabel } from "../utils/clientPortal";
import {
  acceptPublicQuote,
  declinePublicQuote,
  fetchPublicQuoteContext,
} from "../services/publicQuoteService";
import { getQuoteIdFromLocation, getShareTokenFromLocation } from "../utils/quoteShare";
import { showToast } from "../utils/toast";
import { APP_LOGO_URL } from "../utils/assets";
import { confirmAction } from "../utils/confirmAction";

function buildPreviewData(settings, client, quote) {
  const snapshot = quote?.clientSnapshot;
  const resolvedClient =
    client ||
    (snapshot
      ? {
          id: snapshot.id || quote.clientId,
          ...snapshot,
        }
      : null);

  return {
    settings: settings || {},
    clients: resolvedClient ? [resolvedClient] : [],
    products: [],
  };
}

export default function PublicQuoteView() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const quoteId = searchParams.get("id") || getQuoteIdFromLocation(location);
  const shareToken = searchParams.get("token") || getShareTokenFromLocation(location);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewType, setPreviewType] = useState("quote");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchPublicQuoteContext(quoteId, shareToken);
        if (cancelled) return;
        setContext(result);
        const status = String(result.quote?.status || "");
        setAccepted(status === "Accepté");
        setDeclined(status === "Refusé");
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError.message || "Devis introuvable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [quoteId, shareToken]);

  const previewData = useMemo(
    () =>
      context
        ? buildPreviewData(context.settings, context.client, context.quote)
        : null,
    [context]
  );

  const canRespond = useMemo(() => {
    if (!context?.quote) return false;
    const status = String(context.quote.status || "");
    return !["Accepté", "Refusé", "Annulé"].includes(status);
  }, [context]);

  const portal = useMemo(
    () => context?.portal || { quotes: [], invoices: [], deliveryNotes: [] },
    [context?.portal]
  );
  const progressSteps = useMemo(
    () => getClientPortalProgress(context?.quote, portal),
    [context?.quote, portal]
  );

  function openPreview(doc, type) {
    setPreviewDocument(doc);
    setPreviewType(type);
  }

  async function handleAccept() {
    if (!quoteId || accepting) return;
    const trimmedSignature = signatureName.trim();
    if (!trimmedSignature) {
      showToast("Indiquez le nom du signataire avant d'accepter.", "error");
      return;
    }
    if (
      !(await confirmAction({
        title: "Accepter le devis",
        message: `Confirmez-vous l'acceptation et la signature par ${trimmedSignature} ?`,
        confirmLabel: "Signer et accepter",
      }))
    ) return;

    setAccepting(true);
    try {
      const result = await acceptPublicQuote(quoteId, shareToken, context?.settings, {
        typedName: trimmedSignature,
        clientEmail: context?.client?.email || context?.quote?.clientSnapshot?.email || "",
      });
      setContext(result);
      setAccepted(true);
      showToast("Merci — votre acceptation a été enregistrée.", "success");
    } catch (acceptError) {
      showToast(acceptError.message || "Acceptation impossible.", "error");
    } finally {
      setAccepting(false);
    }
  }

  async function handleDecline() {
    if (!quoteId || declining) return;
    if (
      !(await confirmAction({
        title: "Refuser le devis",
        message: "Confirmez-vous le refus de ce devis ?",
        confirmLabel: "Refuser",
        danger: true,
      }))
    ) return;

    setDeclining(true);
    try {
      const result = await declinePublicQuote(
        quoteId,
        shareToken,
        context?.settings,
        declineReason
      );
      setContext(result);
      setDeclined(true);
      showToast("Votre refus a été enregistré.", "info");
    } catch (declineError) {
      showToast(declineError.message || "Refus impossible.", "error");
    } finally {
      setDeclining(false);
    }
  }

  if (loading) {
    return (
      <div className="public-quote-page">
        <div className="public-quote-card">
          <img src={APP_LOGO_URL} alt="AC Creation" className="public-quote-logo" />
          <p>Chargement du devis…</p>
        </div>
      </div>
    );
  }

  if (error || !context?.quote) {
    return (
      <div className="public-quote-page">
        <div className="public-quote-card public-quote-card--error">
          <img src={APP_LOGO_URL} alt="AC Creation" className="public-quote-logo" />
          <h1>Devis indisponible</h1>
          <p>{error || "Ce lien n'est plus valide."}</p>
        </div>
      </div>
    );
  }

  const { quote, client, settings } = context;
  const clientLabel = client?.name || quote.clientSnapshot?.name || "Client";
  const companyName = settings?.companyName || "AC Creation";

  return (
    <div className="public-quote-page">
      <header className="public-quote-header">
        <img src={APP_LOGO_URL} alt={companyName} className="public-quote-logo" />
        <div>
          <h1>Devis {quote.number}</h1>
          <p>{companyName}</p>
        </div>
      </header>

      <section className="public-quote-card">
        <div className="public-quote-meta">
          <div>
            <span className="muted">Client</span>
            <strong>{clientLabel}</strong>
          </div>
          <div>
            <span className="muted">Date</span>
            <strong>{quote.date || "—"}</strong>
          </div>
          <div>
            <span className="muted">Montant TTC</span>
            <strong>{money(quote.totalTTC)}</strong>
          </div>
          <div>
            <span className="muted">Statut</span>
            <span className={statusClass(quote.status)}>{quote.status}</span>
          </div>
        </div>

        {quote.promisedDeliveryDate ? (
          <p className="public-quote-delivery">
            Livraison prévue : <strong>{quote.promisedDeliveryDate}</strong>
          </p>
        ) : null}

        <div className="public-quote-actions">
          <button type="button" className="primary" onClick={() => openPreview(quote, "quote")}>
            Voir / télécharger le devis
          </button>
          {canRespond && !accepted && !declined ? (
            <>
              <label className="public-quote-signature">
                <span>Nom du signataire</span>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(event) => setSignatureName(event.target.value)}
                  placeholder={clientLabel}
                  autoComplete="name"
                />
              </label>
              <button
                type="button"
                className="public-quote-accept"
                disabled={accepting || declining}
                onClick={handleAccept}
              >
                {accepting ? "Enregistrement…" : "Signer et accepter ce devis"}
              </button>
              <div className="public-quote-decline">
                <label htmlFor="public-quote-decline-reason">
                  Motif de refus (optionnel)
                </label>
                <textarea
                  id="public-quote-decline-reason"
                  rows={3}
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="Précisez la raison si vous le souhaitez…"
                />
                <button
                  type="button"
                  className="public-quote-decline-btn"
                  disabled={accepting || declining}
                  onClick={handleDecline}
                >
                  {declining ? "Enregistrement…" : "Je refuse ce devis"}
                </button>
              </div>
            </>
          ) : null}
          {accepted ? (
            <p className="public-quote-accepted">Devis accepté — merci pour votre confiance.</p>
          ) : null}
          {declined ? (
            <p className="public-quote-declined">Devis refusé — votre réponse a été transmise.</p>
          ) : null}
        </div>
      </section>

      <section className="public-portal-grid">
        <div className="public-quote-card public-portal-section">
          <h2>Suivi d'avancement</h2>
          <ol className="public-portal-timeline">
            {progressSteps.map((step) => (
              <li
                key={step.id}
                className={[
                  step.complete ? "is-complete" : "",
                  step.muted ? "is-muted" : "",
                ].filter(Boolean).join(" ")}
              >
                <span aria-hidden="true" />
                <strong>{step.label}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="public-quote-card public-portal-section">
          <h2>Documents client</h2>
          <div className="public-portal-documents">
            <DocumentGroup
              title="Devis"
              emptyLabel="Aucun autre devis disponible."
              items={portal.quotes}
              type="quote"
              onPreview={openPreview}
            />
            <DocumentGroup
              title="Factures"
              emptyLabel="Aucune facture disponible."
              items={portal.invoices}
              type="invoice"
              onPreview={openPreview}
              subtitle={getInvoicePaymentLabel}
            />
            <DocumentGroup
              title="Bons de livraison"
              emptyLabel="Aucun bon de livraison disponible."
              items={portal.deliveryNotes}
              type="delivery"
              onPreview={openPreview}
            />
          </div>
        </div>
      </section>

      {previewDocument && previewData ? (
        <DocumentPreview
          doc={previewDocument}
          type={previewType}
          data={previewData}
          onClose={() => setPreviewDocument(null)}
          publicMode
        />
      ) : null}
    </div>
  );
}

function DocumentGroup({ title, emptyLabel, items = [], type, onPreview, subtitle }) {
  return (
    <div className="public-portal-document-group">
      <h3>{title}</h3>
      {items.length ? (
        <div className="public-portal-document-list">
          {items.map((item) => (
            <article key={`${type}-${item.id || item.number}`} className="public-portal-document">
              <div>
                <strong>{item.number || "Document"}</strong>
                <span>{item.date || "Date non renseignée"}</span>
                {subtitle ? <small>{subtitle(item)}</small> : null}
              </div>
              <span className={statusClass(item.status)}>{item.status || "Disponible"}</span>
              <button type="button" onClick={() => onPreview(item, type)}>
                Voir / PDF
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
    </div>
  );
}
