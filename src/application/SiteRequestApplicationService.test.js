import { describe, expect, it } from "vitest";
import {
  SITE_REQUEST_STATUS,
  countUnreadSiteRequests,
  evaluateSiteRequestCompleteness,
  siteRequestApplicationService,
} from "./SiteRequestApplicationService.js";
import { isAtelierPipelineQuote } from "../utils/production.js";

function request(overrides = {}) {
  return {
    id: "order-1",
    number: "AC-1",
    status: "Accepté",
    clientId: "customer-1",
    lines: [
      {
        id: "line-1",
        quantity: 1,
        snapshot: { productionProfile: { technique: "sublimation" } },
      },
    ],
    ecommerce: {
      source: "ecommerce",
      externalOrderId: "order-1",
      paymentStatus: "paid",
      reviewStatus: SITE_REQUEST_STATUS.NEW,
      snapshot: { version: 1 },
      resourceValidation: { complete: true, errors: [] },
      history: [],
      ...overrides,
    },
  };
}

describe("SiteRequestApplicationService", () => {
  it("keeps a new ecommerce order outside the workshop", () => {
    const quote = request();
    expect(countUnreadSiteRequests([quote])).toBe(1);
    expect(isAtelierPipelineQuote(quote)).toBe(false);
    expect(evaluateSiteRequestCompleteness(quote).canSendToWorkshop).toBe(true);
  });

  it("persists opened status and audit metadata", () => {
    const state = siteRequestApplicationService.transition(
      { quotes: [request()] },
      "order-1",
      SITE_REQUEST_STATUS.OPENED,
      { actor: { email: "admin@example.com" }, at: "2026-08-04T12:00:00Z" },
    );
    expect(state.quotes[0].ecommerce).toMatchObject({
      reviewStatus: SITE_REQUEST_STATUS.OPENED,
      openedAt: "2026-08-04T12:00:00Z",
      openedBy: "admin@example.com",
    });
    expect(countUnreadSiteRequests(state.quotes)).toBe(0);
  });

  it("blocks incomplete requests", () => {
    const incomplete = request({ snapshot: null });
    expect(() =>
      siteRequestApplicationService.sendToWorkshop(
        { quotes: [incomplete] },
        "order-1",
      ),
    ).toThrow("SITE_REQUEST_INCOMPLETE");
  });

  it("sends once to workshop and remains idempotent", () => {
    const first = siteRequestApplicationService.sendToWorkshop(
      { quotes: [request()] },
      "order-1",
      { actor: "admin" },
    );
    expect(first.quotes[0].ecommerce.reviewStatus).toBe("sent_to_workshop");
    expect(isAtelierPipelineQuote(first.quotes[0])).toBe(true);
    const second = siteRequestApplicationService.sendToWorkshop(
      first,
      "order-1",
    );
    expect(second.siteRequestDuplicate).toBe(true);
    expect(second.quotes[0].ecommerce.history).toHaveLength(1);
  });
});
