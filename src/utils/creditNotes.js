import { jsPDF } from "jspdf";
import { uid, today, clientName } from "./documents";
import { formatPdfMoney } from "./documentPdf";

export const CREDIT_NOTE_STATUSES = ["brouillon", "émis", "remboursé"];

export function normalizeCreditNote(note = {}) {
  const totalHT = Number(note.totalHT ?? note.amountHT ?? 0);
  const taxRate = Number(note.taxRate ?? 17);
  const totalTVA = Number(
    note.totalTVA ?? Math.round(totalHT * (taxRate / 100) * 100) / 100
  );
  const totalTTC = Number(
    note.totalTTC ?? Math.round((totalHT + totalTVA) * 100) / 100
  );

  return {
    id: note.id || uid(),
    number: note.number || "",
    clientId: note.clientId || "",
    sourceInvoiceId: note.sourceInvoiceId || "",
    sourceInvoiceNumber: note.sourceInvoiceNumber || "",
    reason: note.reason || "",
    status: CREDIT_NOTE_STATUSES.includes(note.status) ? note.status : "brouillon",
    date: note.date || today(),
    totalHT,
    taxRate,
    totalTVA,
    totalTTC,
    isPartial: Boolean(note.isPartial),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  };
}

export function nextCreditNoteNumber(creditNotes = [], year = new Date().getFullYear()) {
  const prefix = `AV-${year}-`;
  const sequences = (creditNotes || [])
    .map((note) => String(note.number || ""))
    .filter((number) => number.startsWith(prefix))
    .map((number) => Number(number.slice(prefix.length)) || 0);
  const next = sequences.length ? Math.max(...sequences) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export function createCreditNoteFromInvoice(
  data,
  invoice,
  { partialTTC = null, reason = "", status = "brouillon" } = {}
) {
  if (!invoice?.id) throw new Error("Facture source introuvable.");

  const invoiceTTC = Number(invoice.totalTTC || 0);
  const targetTTC =
    partialTTC != null && partialTTC > 0
      ? Math.min(partialTTC, invoiceTTC)
      : invoiceTTC;

  if (targetTTC <= 0) throw new Error("Montant avoir invalide.");

  const ratio = invoiceTTC > 0 ? targetTTC / invoiceTTC : 1;
  const totalHT = Math.round(Number(invoice.totalHT || 0) * ratio * 100) / 100;
  const taxRate = Number(invoice.taxRate ?? data.settings?.taxRate ?? 17);
  const totalTVA = Math.round(totalHT * (taxRate / 100) * 100) / 100;
  const totalTTC = Math.round((totalHT + totalTVA) * 100) / 100;

  const note = normalizeCreditNote({
    id: uid(),
    number: nextCreditNoteNumber(data.creditNotes),
    clientId: invoice.clientId,
    sourceInvoiceId: invoice.id,
    sourceInvoiceNumber: invoice.number,
    reason: reason.trim() || "Avoir sur facture",
    status,
    date: today(),
    totalHT,
    taxRate,
    totalTVA,
    totalTTC,
    isPartial: targetTTC < invoiceTTC - 0.01,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return {
    ...data,
    creditNotes: [...(data.creditNotes || []), note],
    creditNote: note,
  };
}

export function computeCreditNoteCaImpact(creditNotes = [], { year } = {}) {
  const targetYear = year != null ? Number(year) : null;
  let impactHT = 0;

  for (const note of creditNotes || []) {
    if (note.status === "brouillon") continue;
    if (targetYear != null) {
      const parts = String(note.date || "").split("/");
      const noteYear =
        parts.length === 3 ? Number(parts[2]) : new Date(note.createdAt).getFullYear();
      if (noteYear !== targetYear) continue;
    }
    impactHT += Number(note.totalHT || 0);
  }

  return Math.round(impactHT * 100) / 100;
}

export function filterCreditNotesByClient(creditNotes = [], clientId) {
  if (!clientId) return [];
  return (creditNotes || [])
    .filter((note) => String(note.clientId) === String(clientId))
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
    );
}

export function getCreditNoteFileName(note) {
  return `avoir-${String(note?.number || "document").replace(/[^\w.-]+/g, "_")}.pdf`;
}

export function downloadCreditNotePdf({ note, data, settings = {} }) {
  const pdf = new jsPDF("p", "mm", "a4");
  const company = settings.companyName || data?.settings?.companyName || "AC Creation";
  const margin = 14;
  let y = margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("AVOIR", margin, y);
  y += 8;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(company, margin, y);
  y += 6;
  pdf.text(`N° ${note.number}`, margin, y);
  y += 5;
  pdf.text(`Date : ${note.date}`, margin, y);
  y += 5;
  pdf.text(`Client : ${clientName(data, note.clientId)}`, margin, y);
  y += 5;
  pdf.text(`Facture source : ${note.sourceInvoiceNumber || "—"}`, margin, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.text("Motif", margin, y);
  y += 5;
  pdf.setFont("helvetica", "normal");
  const reasonLines = pdf.splitTextToSize(note.reason || "—", 180);
  pdf.text(reasonLines, margin, y);
  y += reasonLines.length * 5 + 6;

  pdf.setFont("helvetica", "bold");
  pdf.text("Montants", margin, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.text(`HT : ${formatPdfMoney(note.totalHT)} €`, margin, y);
  y += 5;
  pdf.text(`TVA (${note.taxRate} %) : ${formatPdfMoney(note.totalTVA)} €`, margin, y);
  y += 5;
  pdf.text(`TTC : ${formatPdfMoney(note.totalTTC)} €`, margin, y);
  y += 8;
  pdf.text(`Statut : ${note.status}`, margin, y);

  pdf.save(getCreditNoteFileName(note));
}
