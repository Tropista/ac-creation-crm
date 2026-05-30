import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const PRINT_CSS_FILES = [
  "src/styles/invoice-styles.css",
  "src/App.css",
  "src/styles/documents.css",
];

function readCss(relativePath) {
  return readFileSync(resolve(relativePath), "utf8");
}

describe("document preview print CSS", () => {
  it.each(PRINT_CSS_FILES)("%s hides CRM shell siblings when preview is open", (file) => {
    const css = readCss(file);
    expect(css).toMatch(
      /body:has\(\.document-preview-overlay\)\s*>\s*\*:not\(\.document-preview-overlay\)/
    );
  });

  it.each(PRINT_CSS_FILES)("%s avoids forced full-page min-height on invoice", (file) => {
    const css = readCss(file);
    expect(css).not.toMatch(/min-height:\s*calc\(297mm\s*-\s*16mm\)/);
    expect(css).toMatch(/#document-preview\.ac-invoice-v2[\s\S]*?min-height:\s*0\s*!important/);
  });

  it("invoice-styles.css uses zero @page margin for preview print", () => {
    const css = readCss("src/styles/invoice-styles.css");
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toMatch(/@page\s*\{[^}]*margin:\s*0/);
  });

  it.each(PRINT_CSS_FILES)("%s hides interactive quote signature panel", (file) => {
    const css = readCss(file);
    expect(css).toMatch(/\.quote-signature-panel[\s\S]*?display:\s*none\s*!important/);
  });
});
