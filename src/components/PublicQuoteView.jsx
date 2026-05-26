import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import DocumentPreview from "./DocumentPreview";
import { money } from "../utils/money";
import { statusClass } from "../utils/documents";
import {
  acceptPublicQuote,
  fetchPublicQuoteContext,
} from "../services/publicQuoteService";
import { getQuoteIdFromLocation, getShareTokenFromLocation } from "../utils/quoteShare";
import { showToast } from "../utils/toast";
import { APP_LOGO_URL } from "../utils/assets";

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
  const [accepted, setAccepted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchPublicQuoteContext(quoteId, shareToken);
        if (cancelled) return;
        setContext(result);
        setAccepted(String(result.quote?.status || "") === "Accepté");
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

  const canAccept = useMemo(() => {
    if (!context?.quote) return false;
    const status = String(context.quote.status || "");
    return !["Accepté", "Refusé", "Annulé"].includes(status);
  }, [context]);

  async function handleAccept() {
    if (!quoteId || accepting) return;
    if (!confirm("Confirmez-vous l'acceptation de ce devis ?")) return;

    setAccepting(true);
    try {
      const result = await acceptPublicQuote(quoteId, shareToken, context?.settings);
      setContext(result);
      setAccepted(true);
      showToast("Merci — votre acceptation a été enregistrée.", "success");
    } catch (acceptError) {
      showToast(acceptError.message || "Acceptation impossible.", "error");
    } finally {
      setAccepting(false);
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
          <button type="button" className="primary" onClick={() => setShowPreview(true)}>
            Voir le devis / PDF
          </button>
          {canAccept && !accepted ? (
            <button
              type="button"
              className="public-quote-accept"
              disabled={accepting}
              onClick={handleAccept}
            >
              {accepting ? "Enregistrement…" : "J'accepte ce devis"}
            </button>
          ) : null}
          {accepted ? (
            <p className="public-quote-accepted">Devis accepté — merci pour votre confiance.</p>
          ) : null}
        </div>
      </section>

      {showPreview && previewData ? (
        <DocumentPreview
          doc={quote}
          type="quote"
          data={previewData}
          onClose={() => setShowPreview(false)}
        />
      ) : null}
    </div>
  );
}
