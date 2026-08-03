import {
  convertQuoteToInvoiceData,
  createBalanceInvoiceFromQuote,
  createDepositInvoiceFromQuote,
} from "../utils/documents";

export class InvoiceApplicationService {
  convertQuote(state, quote) {
    const existing = (state.invoices || []).find(
      (invoice) => String(invoice.convertedFrom) === String(quote.number),
    );
    if (existing) return { ...state, invoice: existing, created: false };
    const nextState = convertQuoteToInvoiceData(state, quote);
    return {
      ...nextState,
      invoice: nextState.invoices.at(-1),
      created: true,
    };
  }

  createDeposit(state, quote, percent) {
    return createDepositInvoiceFromQuote(state, quote, percent);
  }

  createBalance(state, quote) {
    return createBalanceInvoiceFromQuote(state, quote);
  }
}

export const invoiceApplicationService = new InvoiceApplicationService();
