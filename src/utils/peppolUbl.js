/**
 * Export UBL 2.1 minimal (stub Peppol / e-facturation LU — audit #20).
 * Non conforme réseau Peppol ; squelette pour évolution future.
 */

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUblDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parts = String(value).split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function buildInvoiceUblStub(invoice, { client, settings } = {}) {
  const supplierName = settings?.companyName || "AC Creation";
  const supplierVat = settings?.vatNumber || "";
  const customerName = client?.name || "Client";
  const lines = invoice.lines || [];
  const currency = "EUR";

  const lineXml = lines
    .map(
      (line, index) => `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${Number(line.quantity || 1)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${Number(line.totalHT || line.priceHT || 0).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escapeXml(line.description || line.name || "Article")}</cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${Number(line.unitPrice || line.price || 0).toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Stub UBL 2.1 — e-facturation LU / Peppol : non certifié, usage interne uniquement -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.number)}</cbc:ID>
  <cbc:IssueDate>${formatUblDate(invoice.date)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(supplierName)}</cbc:Name></cac:PartyName>
      ${supplierVat ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(supplierVat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(customerName)}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${Number(invoice.totalHT || 0).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${Number(invoice.totalTTC || 0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${Number(invoice.totalTTC || 0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineXml}
</Invoice>`;
}

export function downloadInvoiceUblStub(invoice, context, filename) {
  const xml = buildInvoiceUblStub(invoice, context);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    filename ||
    `facture-${String(invoice.number || "export").replace(/\s+/g, "-")}-ubl-stub.xml`;
  anchor.click();
  URL.revokeObjectURL(url);
}
