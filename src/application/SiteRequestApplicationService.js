import { workshopApplicationService } from "./WorkshopApplicationService.js";

export const SITE_REQUEST_STATUS = Object.freeze({
  NEW: "new",
  OPENED: "opened",
  AWAITING_REVIEW: "awaiting_review",
  INCOMPLETE: "incomplete",
  APPROVED: "approved",
  SENT_TO_WORKSHOP: "sent_to_workshop",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

const TERMINAL_STATUSES = new Set([
  SITE_REQUEST_STATUS.SENT_TO_WORKSHOP,
  SITE_REQUEST_STATUS.REJECTED,
  SITE_REQUEST_STATUS.CANCELLED,
]);

function actorName(actor) {
  return actor?.email || actor?.name || String(actor || "system");
}

function appendHistory(ecommerce, action, previousStatus, nextStatus, context) {
  return [
    ...(ecommerce.history || []),
    {
      id: `${context.correlationId || ecommerce.externalOrderId}:${action}:${Date.now()}`,
      at: context.at || new Date().toISOString(),
      actor: actorName(context.actor),
      action,
      comment: context.comment || "",
      previousStatus,
      nextStatus,
      correlationId: context.correlationId || ecommerce.externalOrderId,
      externalOrderId: ecommerce.externalOrderId,
    },
  ];
}

export function isEcommerceSiteRequest(quote) {
  return quote?.ecommerce?.source === "ecommerce";
}

export function isActiveSiteRequest(quote) {
  return (
    isEcommerceSiteRequest(quote) &&
    !TERMINAL_STATUSES.has(quote.ecommerce.reviewStatus)
  );
}

export function countUnreadSiteRequests(quotes = []) {
  return quotes.filter(
    (quote) => isActiveSiteRequest(quote) && !quote.ecommerce.openedAt,
  ).length;
}

export function evaluateSiteRequestCompleteness(quote) {
  const ecommerce = quote?.ecommerce || {};
  const checks = [
    ["payment", ecommerce.paymentStatus === "paid", "Paiement non confirme"],
    ["customer", Boolean(quote?.clientId), "Client absent"],
    ["items", (quote?.lines || []).length > 0, "Aucun article"],
    ["snapshot", Boolean(ecommerce.snapshot), "Snapshot absent"],
    [
      "binary-assets",
      ecommerce.resourceValidation?.complete === true,
      ecommerce.resourceValidation?.errors?.join(", ") ||
        "Ressources binaires non verifiees",
    ],
    [
      "production",
      (ecommerce.production || []).length > 0 ||
        (quote?.lines || []).some((line) => line.snapshot?.productionProfile),
      "Donnees de production absentes",
    ],
  ];
  const missing = checks
    .filter(([, complete]) => !complete)
    .map(([key, , message]) => ({ key, message, critical: true }));
  const previewRequired = (quote?.lines || []).some(
    (line) => line.snapshot?.previewRequired === true,
  );
  if (previewRequired && !ecommerce.preview) {
    missing.push({
      key: "preview",
      message: "Apercu requis absent",
      critical: true,
    });
  }
  const state = missing.length ? "incomplete" : "complete";
  return { state, missing, canSendToWorkshop: missing.length === 0 };
}

export class SiteRequestApplicationService {
  transition(state, quoteId, nextStatus, context = {}) {
    const quote = (state.quotes || []).find(
      (entry) => String(entry.id) === String(quoteId),
    );
    if (!isEcommerceSiteRequest(quote))
      throw new Error("SITE_REQUEST_NOT_FOUND");
    const previousStatus =
      quote.ecommerce.reviewStatus || SITE_REQUEST_STATUS.NEW;
    if (previousStatus === nextStatus) return state;
    const at = context.at || new Date().toISOString();
    const auditFields = {
      ...(nextStatus === SITE_REQUEST_STATUS.OPENED && !quote.ecommerce.openedAt
        ? { openedAt: at, openedBy: actorName(context.actor) }
        : {}),
      ...(nextStatus === SITE_REQUEST_STATUS.APPROVED
        ? { approvedAt: at, approvedBy: actorName(context.actor) }
        : {}),
    };
    return workshopApplicationService.patchQuote(state, quote.id, {
      ecommerce: {
        ...quote.ecommerce,
        ...auditFields,
        reviewStatus: nextStatus,
        history: appendHistory(
          quote.ecommerce,
          context.action || nextStatus,
          previousStatus,
          nextStatus,
          { ...context, at },
        ),
      },
    });
  }

  sendToWorkshop(state, quoteId, context = {}) {
    const quote = (state.quotes || []).find(
      (entry) => String(entry.id) === String(quoteId),
    );
    if (!isEcommerceSiteRequest(quote))
      throw new Error("SITE_REQUEST_NOT_FOUND");
    if (quote.ecommerce.reviewStatus === SITE_REQUEST_STATUS.SENT_TO_WORKSHOP) {
      return { ...state, siteRequestDuplicate: true };
    }
    const completeness = evaluateSiteRequestCompleteness(quote);
    if (!completeness.canSendToWorkshop && !context.adminOverride) {
      throw new Error("SITE_REQUEST_INCOMPLETE");
    }
    const at = context.at || new Date().toISOString();
    const actor = actorName(context.actor);
    const previousStatus =
      quote.ecommerce.reviewStatus || SITE_REQUEST_STATUS.NEW;
    return workshopApplicationService.patchQuote(state, quote.id, {
      status: "Accepté",
      ecommerce: {
        ...quote.ecommerce,
        reviewStatus: SITE_REQUEST_STATUS.SENT_TO_WORKSHOP,
        sentToWorkshopAt: at,
        sentToWorkshopBy: actor,
        completeness,
        history: appendHistory(
          quote.ecommerce,
          "sent_to_workshop",
          previousStatus,
          SITE_REQUEST_STATUS.SENT_TO_WORKSHOP,
          { ...context, at },
        ),
      },
    });
  }
}

export const siteRequestApplicationService =
  new SiteRequestApplicationService();
