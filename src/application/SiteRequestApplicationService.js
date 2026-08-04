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
  const resources = Array.isArray(ecommerce.resources)
    ? ecommerce.resources
    : [];
  const assets = Array.isArray(ecommerce.assets) ? ecommerce.assets : [];
  const fonts = Array.isArray(ecommerce.fonts) ? ecommerce.fonts : [];
  const preview =
    resources.find((resource) =>
      /preview/i.test(
        String(resource?.role || resource?.kind || resource?.name || ""),
      ),
    ) || ecommerce.preview;
  const printFiles = resources.filter(
    (resource) =>
      resource?.role === "production" ||
      /impression|production/i.test(
        String(resource?.name || resource?.kind || ""),
      ),
  );
  const allOriginalsVerified = [...assets, ...fonts].every(
    (resource) => resource?.binaryVerified === true,
  );
  const serializedSnapshots = JSON.stringify(
    (quote?.lines || []).map((line) => line.snapshot).filter(Boolean),
  );
  const usesText = /"type"\s*:\s*"text"/i.test(serializedSnapshots);
  const fontsAvailable =
    !usesText ||
    fonts.some(
      (font) =>
        font?.binaryVerified === true ||
        (font?.vectorized === true && font?.format === "svg"),
    );
  const checks = [
    ["payment", ecommerce.paymentStatus === "paid", "Paiement non confirme"],
    ["customer", Boolean(quote?.clientId), "Client absent"],
    ["items", (quote?.lines || []).length > 0, "Aucun article"],
    ["snapshot", Boolean(ecommerce.snapshot), "Snapshot absent"],
    [
      "project",
      Boolean(
        ecommerce.project ||
        ecommerce.composition ||
        ecommerce.snapshot?.project ||
        quote?.lines?.[0]?.snapshot,
      ),
      "Projet.acproject impossible à reconstruire",
    ],
    [
      "binary-assets",
      ecommerce.resourceValidation?.complete === true,
      ecommerce.resourceValidation?.errors?.join(", ") ||
        "Ressources binaires non verifiees",
    ],
    [
      "preview",
      Boolean(preview?.binaryVerified),
      "Preview_HD.png absent ou non vérifié",
    ],
    [
      "print-file",
      printFiles.length === 1 && printFiles[0]?.binaryVerified === true,
      "PNG d’impression absent, ambigu ou non vérifié",
    ],
    [
      "originals",
      allOriginalsVerified,
      "Images, SVG ou polices originales non vérifiés",
    ],
    ["fonts", fontsAvailable, "Police utilisée absente ou non vectorisée"],
    [
      "production",
      (ecommerce.production || []).length > 0 ||
        (quote?.lines || []).some((line) => line.snapshot?.productionProfile),
      "Donnees de production absentes",
    ],
    [
      "package",
      ecommerce.packageValidation?.complete === true,
      ecommerce.packageValidation?.errors?.join(", ") ||
        "Package ZIP non généré ou non contrôlé",
    ],
  ];
  const missing = checks
    .filter(([, complete]) => !complete)
    .map(([key, , message]) => ({ key, message, critical: true }));
  const state = missing.length ? "incomplete" : "complete";
  return { state, missing, canSendToWorkshop: missing.length === 0 };
}

export class SiteRequestApplicationService {
  recordPackageValidation(state, quoteId, audit) {
    const quote = (state.quotes || []).find(
      (entry) => String(entry.id) === String(quoteId),
    );
    if (!isEcommerceSiteRequest(quote))
      throw new Error("SITE_REQUEST_NOT_FOUND");
    return workshopApplicationService.patchQuote(state, quote.id, {
      ecommerce: {
        ...quote.ecommerce,
        packageValidation: {
          complete: audit?.complete === true,
          errors: audit?.errors || [],
          files: Number(audit?.files || 0),
          validatedAt: new Date().toISOString(),
        },
      },
    });
  }

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
