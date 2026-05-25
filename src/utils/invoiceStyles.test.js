import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVOICE_STYLE,
  getInvoiceStyleClass,
  INVOICE_STYLE_CLASS,
  normalizeInvoiceStyle,
} from "./invoiceStyles.js";

describe("invoiceStyles", () => {
  it("retourne toujours le style A", () => {
    expect(normalizeInvoiceStyle()).toBe(DEFAULT_INVOICE_STYLE);
    expect(normalizeInvoiceStyle("b")).toBe("a");
    expect(normalizeInvoiceStyle("invalid")).toBe("a");
  });

  it("génère la classe CSS du style A", () => {
    expect(getInvoiceStyleClass()).toBe(INVOICE_STYLE_CLASS);
    expect(getInvoiceStyleClass("c")).toBe("ac-invoice-style-a");
  });
});
