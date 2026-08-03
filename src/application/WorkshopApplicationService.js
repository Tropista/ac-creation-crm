import {
  createDeliveryNoteFromQuote,
  getDeliveryNoteForQuote,
} from "../utils/documents.js";
import { ATELIER_PIPELINE_STATUSES } from "../utils/production.js";
import { syncQuoteProductionStock } from "../utils/stock.js";

export class WorkshopApplicationService {
  patchQuote(state, quoteId, changes) {
    return {
      ...state,
      quotes: (state.quotes || []).map((quote) =>
        String(quote.id) === String(quoteId) ? { ...quote, ...changes } : quote,
      ),
    };
  }

  updateProductionSheet(state, quoteId, nextQuote) {
    return this.patchQuote(state, quoteId, nextQuote);
  }

  changeStatus(state, quote, status, { user = "" } = {}) {
    if (!ATELIER_PIPELINE_STATUSES.includes(status)) {
      throw new Error("ATELIER_STATUS_INVALID");
    }
    if (quote.status === status) return state;
    const updatedQuote = { ...quote, status };
    const stock = syncQuoteProductionStock(
      state.products || [],
      quote,
      updatedQuote,
      { user },
    );
    return {
      ...state,
      products: stock.products,
      quotes: (state.quotes || []).map((entry) =>
        String(entry.id) === String(quote.id)
          ? {
              ...updatedQuote,
              productionStockAdjusted: stock.productionStockAdjusted,
            }
          : entry,
      ),
    };
  }

  remove(state, quote, { user = "" } = {}) {
    const products = quote.productionStockAdjusted
      ? syncQuoteProductionStock(
          state.products || [],
          quote,
          { ...quote, status: "Accepté" },
          { user },
        ).products
      : state.products || [];
    return {
      ...state,
      products,
      quotes: (state.quotes || []).filter(
        (entry) => String(entry.id) !== String(quote.id),
      ),
    };
  }

  createDeliveryNote(state, quote, options = {}) {
    return createDeliveryNoteFromQuote(state, quote, options);
  }

  findDeliveryNote(state, quote) {
    return getDeliveryNoteForQuote(state, quote);
  }
}

export const workshopApplicationService = new WorkshopApplicationService();
