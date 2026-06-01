import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { APP_LOGO_URL } from "../utils/assets";
import { buildDocumentPdf, getDocumentFileName } from "../utils/documentPdf";
import { sendDocumentByEmail } from "../services/emailService";
import { buildEmailFromTemplate, buildDocVars } from "../utils/emailTemplates";
import {
  getDocumentAmountDue,
  getDocumentFooterTotals,
} from "../utils/documents";
import { getInvoicePaidAmount, getInvoiceRemaining } from "../utils/invoices";
import { getInvoiceStyleClass } from "../utils/invoiceStyles";
import { formatLineProductionLabel, lineHasProductionDetails } from "../utils/quoteLines";
import { money } from "../utils/money";
import {
  copyQuoteShareLink,
  openQuoteWhatsAppShare,
  prepareQuoteForShare,
} from "../utils/quoteShare";
import { showToast } from "../utils/toast";
import { cleanupNavigationBlockers, CRM_ROUTE_CHANGE_EVENT } from "../utils/uiCleanup";
import { isQuoteSigned, getSignatureDisplayLabel } from "../utils/quoteSignature";
import { formatPaymentDate } from "../utils/payments";
import QuoteSignaturePanel from "./QuoteSignaturePanel";

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7ZM12 12.8 5.5 9.2 12 5.6l6.5 3.6L12 12.8Zm7-1.9-7 3.9-7-3.9V15L12 19l7-4V10.9Z" />
    </svg>
  );
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 2 5 5h-5V4ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
    </svg>
  );
}

export default function DocumentPreview({
  doc,
  type,
  data,
  onClose,
  onDocumentSent,
  onQuoteSharePrepared,
  onQuoteAccept,
  paymentSummary,
}) {
  const pdfWrapperRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null); // { subject, body }
  const isQuote = type === "quote";
  const isDelivery = type === "delivery";
  const client = (data.clients || []).find((c) => c.id === doc.clientId);
  const paidAmount = getInvoicePaidAmount(doc);
  const remaining = getInvoiceRemaining(doc);
  const footerTotals = getDocumentFooterTotals(doc, type);
  const amountDue = getDocumentAmountDue(doc, type, { remaining });

  const lines = doc.lines?.length
    ? doc.lines
    : [
        {
          description: doc.description,
          quantity: doc.quantity,
          price: doc.price,
          discount: doc.discount || 0,
          subtotal: doc.subtotal,
          totalHT: doc.totalHT,
        },
      ];

  function getLineSku(line) {
    if (line.sku) return line.sku;
    const product = (data.products || []).find(
      (p) => String(p.id) === String(line.productId)
    );
    return product?.sku || "—";
  }

  const documentTitle = isDelivery
    ? "BON DE LIVRAISON"
    : !isQuote && doc.invoiceType === "acompte"
      ? "FACTURE D'ACOMPTE"
      : isQuote
        ? "DEVIS"
        : "FACTURE";
  const documentFileName = getDocumentFileName(doc, type);
  const invoiceStyleClass = getInvoiceStyleClass();

  const handleClose = useCallback(() => {
    onClose?.();
    cleanupNavigationBlockers();
  }, [onClose]);

  useEffect(() => {
    function onRouteChange() {
      handleClose();
    }

    window.addEventListener(CRM_ROUTE_CHANGE_EVENT, onRouteChange);
    return () => window.removeEventListener(CRM_ROUTE_CHANGE_EVENT, onRouteChange);
  }, [handleClose]);

  useEffect(() => {
    document.body.classList.add("crm-modal-open");
    return () => {
      document.body.classList.remove("crm-modal-open");
      const wrapper = pdfWrapperRef.current;
      if (wrapper?.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
        pdfWrapperRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  async function downloadPdfNative() {
    try {
      const pdf = buildDocumentPdf({ doc, type, data });
      pdf.save(documentFileName);
      showToast("PDF généré avec succès.", "success");
    } catch (error) {
      console.error(error);
      showToast("Génération native échouée, bascule sur capture HTML…", "info");
      await downloadPdfFallback();
    }
  }

  async function downloadPdfFallback() {
    const source = document.getElementById("document-preview");
    if (!source) return showToast("Zone PDF introuvable.", "error");

    const wrapper = document.createElement("div");
    wrapper.className = "ac-doc-pdf-root";
    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";
    wrapper.style.background = "#ffffff";
    wrapper.style.zIndex = "-1";

    const clone = source.cloneNode(true);
    clone.removeAttribute("id");
    clone.style.boxShadow = "none";
    clone.style.height = "auto";

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    pdfWrapperRef.current = wrapper;

    try {
      const images = Array.from(clone.querySelectorAll("img"));
      await Promise.all(
        images.map(
          (img) =>
            new Promise((resolve) => {
              img.crossOrigin = "anonymous";
              if (img.complete) return resolve();
              img.onload = resolve;
              img.onerror = () => {
                img.style.display = "none";
                resolve();
              };
            })
        )
      );

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const imgData = canvas.toDataURL("image/png");

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 7;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      let imgWidth = maxWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= maxHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
        pdf.save(documentFileName);
        return;
      }

      // Si le document est court, on réduit légèrement pour tenir sur 1 page.
      if ((lines || []).length <= 6) {
        imgHeight = maxHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
        const x = (pageWidth - imgWidth) / 2;
        pdf.addImage(imgData, "PNG", x, margin, imgWidth, imgHeight);
        pdf.save(documentFileName);
        return;
      }

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= maxHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= maxHeight;
      }

      pdf.save(documentFileName);
    } catch (error) {
      console.error(error);
      showToast("Impossible de générer le PDF.", "error");
    } finally {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      if (pdfWrapperRef.current === wrapper) {
        pdfWrapperRef.current = null;
      }
    }
  }


  function openEmailPreview() {
    if (!client?.email) { showToast("Ce client n'a pas d'adresse email enregistrée.", "error"); return; }
    if (!data.settings?.smtpEmail || !data.settings?.smtpAppPassword) { showToast("Configure ton adresse Gmail dans Paramètres avant d'envoyer.", "error"); return; }
    const key = isQuote ? "quote" : "invoice";
    const vars = buildDocVars(doc, client, data.settings || {});
    const { subject, body } = buildEmailFromTemplate(key, vars, data.settings || {});
    setEmailPreview({ subject, body });
  }

  async function sendEmail() {
    if (!emailPreview) return;
    setSending(true);
    try {
      const result = await sendDocumentByEmail({ doc, type, data, client, overrideSubject: emailPreview.subject, overrideBody: emailPreview.body });
      onDocumentSent?.({ ...doc, emailSentAt: result.sentAt || new Date().toISOString() });
      showToast(`Email envoyé à ${client.email} avec le PDF en pièce jointe.`, "success");
      setEmailPreview(null);
    } catch (err) {
      showToast(err.message || "Erreur lors de l'envoi.", "error");
    } finally {
      setSending(false);
    }
  }

  async function copyQuoteLink() {
    const prepared = prepareQuoteForShare(doc, client);
    if (prepared.shareToken && prepared.shareToken !== doc.shareToken) {
      onQuoteSharePrepared?.(prepared);
    }
    const result = await copyQuoteShareLink(prepared, {
      client,
      settings: data.settings || {},
    });
    if (result.ok) {
      showToast("Lien devis copié dans le presse-papiers.", "success");
      return;
    }
    showToast("Copie impossible.", "warning");
  }

  function shareQuoteWhatsApp() {
    const prepared = prepareQuoteForShare(doc, client);
    if (prepared.shareToken && prepared.shareToken !== doc.shareToken) {
      onQuoteSharePrepared?.(prepared);
    }
    openQuoteWhatsAppShare(prepared, data.settings || {}, client);
    showToast("WhatsApp ouvert avec le message pré-rempli.", "info");
  }

  const modal = (
    <div
      className="modal ac-invoice-modal-wrap document-preview-overlay"
      data-testid="document-preview-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="modal-content invoice-modal ac-invoice-modal">
        <div className="no-print modal-actions ac-invoice-actions">
          <button type="button" onClick={handleClose}>
            Fermer
          </button>
          {isQuote && (
            <>
              <button type="button" onClick={copyQuoteLink}>
                Copier le lien
              </button>
              <button type="button" onClick={shareQuoteWhatsApp}>
                WhatsApp
              </button>
            </>
          )}
          <button type="button" onClick={openEmailPreview} disabled={sending}>
            Envoyer par email
          </button>
          <button type="button" onClick={async () => {
            try {
              const pdf = buildDocumentPdf({ doc, type, data });
              pdf.autoPrint();
              window.open(pdf.output("bloburl"), "_blank");
            } catch {
              window.print();
            }
          }}>
            Imprimer
          </button>
          <button type="button" className="primary" onClick={downloadPdfNative}>
            Télécharger PDF
          </button>
        </div>

        <div id="document-preview" className={`ac-invoice-v2 ${invoiceStyleClass}`}>
          <div className="ac-invoice-top">
          <div className="ac-invoice-head">
            <div className="ac-company-box">
              <div className="ac-company-inner">
                <div className="ac-company-logo">
                  <img
                    src={
                      data.settings.logoUrl && data.settings.logoUrl.trim() !== ""
                        ? data.settings.logoUrl
                        : APP_LOGO_URL
                    }
                    alt="Logo entreprise"
                    onError={(event) => {
                      event.currentTarget.src = APP_LOGO_URL;
                    }}
                  />
                </div>
                <div className="ac-company-text">
                  <h1>{data.settings.companyName || "AC Creation"}</h1>
                  <p>{data.settings.companyAddress}</p>
                  <p>{data.settings.companyPhone}</p>
                  <p>{data.settings.companyEmail}</p>
                  <p>
                    <strong>N° TVA :</strong> {data.settings.vatNumber || "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className="ac-title-box">
              <h2>{documentTitle}</h2>
              <div className="ac-title-line">
                <span>N° {documentTitle}</span>
                <strong>{doc.number}</strong>
              </div>
              <div className="ac-title-line">
                <span>Date d'émission</span>
                <strong>{doc.date}</strong>
              </div>
              {isQuote && doc.promisedDeliveryDate && (
                <div className="ac-title-line">
                  <span>Livraison prévue</span>
                  <strong>{doc.promisedDeliveryDate}</strong>
                </div>
              )}
              {isDelivery && doc.quoteNumber && (
                <div className="ac-title-line">
                  <span>Devis</span>
                  <strong>{doc.quoteNumber}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="ac-info-grid">
            <div className="ac-info-card">
              <div className="ac-icon">{isDelivery ? <IconPackage /> : <IconUser />}</div>
              <div>
                <h3>{isDelivery ? "LIVRÉ À" : "FACTURÉ À"}</h3>
                <strong>{client?.name || "Client supprimé"}</strong>
                {client?.company && <p>{client.company}</p>}
                {client?.address && <p>{client.address}</p>}
                {client?.email && <p>{client.email}</p>}
                {client?.phone && <p>{client.phone}</p>}
              </div>
            </div>

            <div className="ac-info-card">
              <div className="ac-icon"><IconDocument /></div>
              <div>
                <h3>{isDelivery ? "LIVRAISON" : "RÉFÉRENCE"}</h3>
                {isDelivery ? (
                  <>
                    {doc.deliveryAddress && (
                      <p>
                        <strong>Adresse :</strong> {doc.deliveryAddress}
                      </p>
                    )}
                    {doc.deliveryInfo && (
                      <p>
                        <strong>Infos :</strong> {doc.deliveryInfo}
                      </p>
                    )}
                    <p>
                      <strong>Statut :</strong> {doc.status}
                    </p>
                  </>
                ) : (
                  <>
                    <strong>{doc.convertedFrom || doc.number}</strong>
                    <p>
                      <strong>Statut :</strong> {doc.status}
                    </p>
                    {!isQuote && doc.invoiceType === "acompte" && doc.depositPercent && (
                      <p>
                        <strong>Acompte :</strong> {doc.depositPercent}%
                      </p>
                    )}
                    {isQuote && footerTotals.showQuoteDepositSplit && (
                      <p>
                        <strong>Acompte :</strong> {footerTotals.quoteDeposit.depositPercent}% (
                        {money(footerTotals.quoteDeposit.depositAmount)})
                      </p>
                    )}
                    {!isQuote && doc.invoiceType === "solde" && footerTotals.depositPaidAmount > 0 && (
                      <p>
                        <strong>Acomptes payés :</strong> {money(footerTotals.depositPaidAmount)}
                      </p>
                    )}
                    {!isQuote && doc.dueDate && (
                      <p>
                        <strong>Échéance :</strong> {doc.dueDate}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <table className="ac-table">
            <thead>
              <tr>
                <th>Réf.</th>
                <th>Désignation</th>
                {isDelivery ? (
                  <th>Quantité</th>
                ) : (
                  <>
                    <th>Prix unitaire HT</th>
                    <th>Quantité</th>
                    <th>Montant total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{getLineSku(line)}</td>
                  <td>
                    <div>{line.description}</div>
                    {isQuote && lineHasProductionDetails(line) && (
                      <div className="ac-line-production">
                        {formatLineProductionLabel(line)}
                      </div>
                    )}
                  </td>
                  {isDelivery ? (
                    <td>
                      {Number(line.quantity || 0).toLocaleString("fr-FR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  ) : (
                    <>
                      <td>{money(line.price)}</td>
                      <td>
                        {Number(line.quantity || 0).toLocaleString("fr-FR", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td>{money(line.totalHT || line.subtotal)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="ac-invoice-bottom">
          {isDelivery ? (
            <>
              <div className="ac-mentions" style={{ marginBottom: "4mm" }}>
                <strong>Réception</strong>
                <p>
                  Le client reconnaît avoir reçu les articles ci-dessus en bon état.
                  Date et signature du client : _______________________________
                </p>
                {doc.notes && <p>{doc.notes}</p>}
              </div>
            </>
          ) : (
          <div className="ac-after-table">
            <div className="ac-after-table-left">
              <div className="ac-payment-card">
                <h3>CONDITIONS DE PAIEMENT</h3>
                <pre>{data.settings.paymentTerms}</pre>
                <pre>{data.settings.bankInfo}</pre>
              </div>

              <div className="ac-mentions">
                <strong>Mentions</strong>
                <p>
                  Document généré électroniquement. Aucun escompte accordé sauf
                  indication contraire. En cas de retard de paiement, des pénalités
                  peuvent être appliquées selon les conditions convenues.
                </p>
              </div>
            </div>

            <div className="ac-totals-wrap">
              <div className="ac-totals-card">
                <div className="ac-total-line">
                  <span>Sous-total HT</span>
                  <strong>{money(doc.subtotal || doc.totalHT)}</strong>
                </div>
                <div className="ac-total-line">
                  <span>
                    Remise globale {doc.globalDiscount ? `(${doc.globalDiscount}%)` : ""}
                  </span>
                  <strong>{money(doc.globalDiscountAmount || 0)}</strong>
                </div>
                <div className="ac-total-line">
                  <span>Total HT</span>
                  <strong>{money(doc.totalHT)}</strong>
                </div>
                <div className="ac-total-line">
                  <span>TVA à {doc.taxRate}%</span>
                  <strong>{money(doc.taxAmount)}</strong>
                </div>
                {footerTotals.showQuoteDepositSplit ? (
                  <>
                    <div className="ac-total-line">
                      <span>Total TTC</span>
                      <strong>{money(doc.totalTTC)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Acompte ({footerTotals.quoteDeposit.depositPercent}%)</span>
                      <strong>{money(footerTotals.quoteDeposit.depositAmount)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Solde</span>
                      <strong>{money(footerTotals.quoteDeposit.balanceAfterDeposit)}</strong>
                    </div>
                  </>
                ) : footerTotals.showSoldeBreakdown ? (
                  <>
                    <div className="ac-total-line">
                      <span>Total TTC devis</span>
                      <strong>{money(footerTotals.quoteTotalTTCForSolde)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Acomptes payés</span>
                      <strong>− {money(footerTotals.depositPaidAmount)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Total TTC</span>
                      <strong>{money(doc.totalTTC)}</strong>
                    </div>
                  </>
                ) : (
                  <div className="ac-total-line">
                    <span>Total TTC</span>
                    <strong>{money(doc.totalTTC)}</strong>
                  </div>
                )}
                {paidAmount > 0.01 && amountDue > 0.01 && (
                  <div className="ac-total-line">
                    <span>Déjà payé</span>
                    <strong>{money(paidAmount)}</strong>
                  </div>
                )}
                {!isQuote && paymentSummary?.depositPaid > 0.01 && (
                  <div className="ac-total-line">
                    <span>Acompte payé</span>
                    <strong>{money(paymentSummary.depositPaid)}</strong>
                  </div>
                )}
                {!isQuote && paymentSummary?.remaining > 0.01 && (
                  <div className="ac-total-line">
                    <span>Reste à payer</span>
                    <strong>{money(paymentSummary.remaining)}</strong>
                  </div>
                )}
                <div className="ac-total-line ac-total-final">
                  <span>
                    {isQuote && footerTotals.showQuoteDepositSplit
                      ? "À PAYER (ACOMPTE)"
                      : "À PAYER"}
                  </span>
                  <strong>{money(amountDue)}</strong>
                </div>
              </div>
            </div>
          </div>
          )}

          {!isQuote && paymentSummary?.paymentHistory?.length > 0 && (
            <div className="invoice-payment-history">
              <strong>Historique des paiements</strong>
              <ul>
                {paymentSummary.paymentHistory.map((payment) => (
                  <li key={payment.id}>
                    {formatPaymentDate(payment.date)} — {money(payment.amount)} · {payment.method}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isQuote && isQuoteSigned(doc) && (
            <div className="quote-signature-preview quote-signature-preview--compact">
              <strong>Acceptation client</strong>
              <p>{getSignatureDisplayLabel(doc)}</p>
              {doc.signature?.dataUrl ? (
                <img src={doc.signature.dataUrl} alt="Signature" className="quote-signature-image" />
              ) : null}
            </div>
          )}

          {isQuote && onQuoteAccept ? (
            <div className="no-print">
              <QuoteSignaturePanel quote={doc} onAccept={onQuoteAccept} compact />
            </div>
          ) : null}

          <div className="ac-thanks">
            <div className="ac-icon"><IconInfo /></div>
            <div>
              <strong>Merci pour votre confiance.</strong>
              <p>Pour toute question, n'hésitez pas à nous contacter.</p>
            </div>
            <div className="ac-signature">Merci !</div>
          </div>

          <div className="ac-footer">
            <strong>{data.settings.companyName} — Personnalisation</strong>
            <span>
              {data.settings.companyAddress} — {data.settings.companyPhone} —{" "}
              {data.settings.companyEmail}
            </span>
            <span>N° TVA : {data.settings.vatNumber || "-"}</span>
          </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  const emailPreviewModal = emailPreview ? createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={() => !sending && setEmailPreview(null)}>
      <div style={{ background: "var(--surface)", borderRadius: 12, width: "min(640px,96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "var(--shadow)" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 15 }}>Aperçu de l'email</strong>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>À : {client?.email}</span>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Objet</span>
            <input value={emailPreview.subject} onChange={(e) => setEmailPreview({ ...emailPreview, subject: e.target.value })}
              style={{ fontSize: 13 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Corps</span>
            <textarea rows={12} value={emailPreview.body} onChange={(e) => setEmailPreview({ ...emailPreview, body: e.target.value })}
              style={{ fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
          </label>
          <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
            📎 Le PDF sera joint automatiquement à l'envoi.
          </p>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => setEmailPreview(null)} disabled={sending}>Annuler</button>
          <button type="button" className="primary" onClick={sendEmail} disabled={sending}>
            {sending ? "Envoi en cours…" : "✉ Envoyer"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {createPortal(modal, document.body)}
      {emailPreviewModal}
    </>
  );
}
