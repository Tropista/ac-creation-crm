import { useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { APP_LOGO_URL } from "../utils/assets";
import { buildDocumentPdf, getDocumentFileName } from "../utils/documentPdf";
import { computeDepositTotals } from "../utils/documents";
import { getInvoicePaidAmount, getInvoiceRemaining } from "../utils/invoices";
import { getInvoiceStyleClass } from "../utils/invoiceStyles";
import { formatLineProductionLabel, lineHasProductionDetails } from "../utils/quoteLines";
import { money } from "../utils/money";
import {
  copyQuoteShareLink,
  openQuoteWhatsAppShare,
} from "../utils/quoteShare";
import { showToast } from "../utils/toast";

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

export default function DocumentPreview({ doc, type, data, onClose, onDocumentSent }) {
  const pdfWrapperRef = useRef(null);
  const isQuote = type === "quote";
  const isDelivery = type === "delivery";
  const client = (data.clients || []).find((c) => c.id === doc.clientId);
  const paidAmount = getInvoicePaidAmount(doc);
  const remaining = getInvoiceRemaining(doc);
  const deposit = computeDepositTotals(doc.totalTTC, doc.depositPercent);
  const amountDue = isDelivery
    ? 0
    : doc.status === "Payée"
      ? 0
      : isQuote && deposit.depositPercent > 0
        ? deposit.depositAmount
        : remaining;

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

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(
    () => () => {
      const wrapper = pdfWrapperRef.current;
      if (wrapper?.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
        pdfWrapperRef.current = null;
      }
    },
    []
  );

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


  function sendEmail() {
    if (!client?.email) {
      showToast("Ce client n'a pas d'adresse email enregistrée.", "error");
      return;
    }

    const documentName = isDelivery ? "bon de livraison" : isQuote ? "devis" : "facture";
    const subject = `${documentTitle} ${doc.number} - ${data.settings.companyName}`;
    const body = `Bonjour ${client?.name || ""},

Veuillez trouver ci-dessous les informations de votre ${documentName}.

${documentTitle} : ${doc.number}
Date : ${doc.date}
Montant total TTC : ${isDelivery ? "—" : money(doc.totalTTC)}
Statut : ${doc.status}

${data.settings.paymentTerms || ""}

${data.settings.bankInfo || ""}

Cordialement,
${data.settings.companyName}
${data.settings.companyPhone || ""}
${data.settings.companyEmail || ""}`;

    window.location.href = `mailto:${encodeURIComponent(
      client.email
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    onDocumentSent?.(doc);
  }

  async function copyQuoteLink() {
    const result = await copyQuoteShareLink(doc);
    if (result.ok) {
      showToast("Lien devis copié dans le presse-papiers.", "success");
      return;
    }
    showToast("Copie impossible.", "warning");
  }

  function shareQuoteWhatsApp() {
    openQuoteWhatsAppShare(doc, data.settings || {}, client);
    showToast("WhatsApp ouvert avec le message pré-rempli.", "info");
  }

  return (
    <div
      className="modal ac-invoice-modal-wrap document-preview-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div className="modal-content invoice-modal ac-invoice-modal">
        <div className="no-print modal-actions ac-invoice-actions">
          <button type="button" onClick={onClose}>
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
          <button type="button" onClick={sendEmail}>
            Envoyer par email
          </button>
          <button type="button" onClick={() => window.print()}>
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
                    {!isQuote && doc.invoiceType !== "acompte" && deposit.depositPercent > 0 && (
                      <p>
                        <strong>Acompte :</strong> {deposit.depositPercent}% ({money(deposit.depositAmount)})
                      </p>
                    )}
                    {isQuote && deposit.depositPercent > 0 && (
                      <p>
                        <strong>Acompte :</strong> {deposit.depositPercent}% ({money(deposit.depositAmount)})
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
                <p>
                  <strong>Échéance de paiement :</strong>{" "}
                  {data.settings.paymentTerms}
                </p>
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
                {deposit.depositPercent > 0 ? (
                  <>
                    <div className="ac-total-line">
                      <span>Total TTC</span>
                      <strong>{money(doc.totalTTC)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Acompte ({deposit.depositPercent}%)</span>
                      <strong>{money(deposit.depositAmount)}</strong>
                    </div>
                    <div className="ac-total-line">
                      <span>Solde</span>
                      <strong>{money(deposit.balanceAfterDeposit)}</strong>
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
                <div className="ac-total-line ac-total-final">
                  <span>{isQuote && deposit.depositPercent > 0 ? "À PAYER (ACOMPTE)" : "À PAYER"}</span>
                  <strong>{money(amountDue)}</strong>
                </div>
              </div>
            </div>
          </div>
          )}

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
}
