import { advanceProductionStatus } from "../utils/production.js";
import { workshopApplicationService } from "./WorkshopApplicationService.js";

export class ProductionApplicationService {
  advance(state, quote, context = {}) {
    const nextStatus = advanceProductionStatus(quote.status);
    if (!nextStatus) return { ...state, advanced: false, quote };
    const nextState = workshopApplicationService.changeStatus(
      state,
      quote,
      nextStatus,
      context,
    );
    return {
      ...nextState,
      advanced: true,
      quote: nextState.quotes.find(
        (entry) => String(entry.id) === String(quote.id),
      ),
    };
  }
}

export const productionApplicationService = new ProductionApplicationService();
