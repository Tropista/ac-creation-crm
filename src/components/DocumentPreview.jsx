import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { money } from "../utils/money";
export default function DocumentPreview({ doc, type, data, onClose }) {
  const isQuote = type === "quote";
  const client = data.clients.find((c) => c.id === doc.clientId);
  const amountDue = doc.status === "Payée" ? 0 : (doc.totalTTC || 0);
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

  async function downloadPdf() {
    const source = document.querySelector(".invoice-pdf-area");
    if (!source) return alert("Zone PDF introuvable.");

    const fileName = `${isQuote ? "devis" : "facture"}-${String(
      doc.number || "document"
    ).replace(/[^\w.-]+/g, "_")}.pdf`;

    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";
    wrapper.style.width = "210mm";
    wrapper.style.background = "#ffffff";
    wrapper.style.zIndex = "-1";

    const clone = source.cloneNode(true);
    clone.style.margin = "0";
    clone.style.boxShadow = "none";
    clone.style.transform = "none";
    clone.style.width = "210mm";
    clone.style.minHeight = "auto";
    clone.style.background = "#ffffff";

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      const images = Array.from(clone.querySelectorAll("img"));

      await Promise.all(
        images.map(
          (img) =>
            new Promise((resolve) => {
              img.crossOrigin = "anonymous";

              if (img.complete) {
                resolve();
                return;
              }

              img.onload = resolve;
              img.onerror = () => {
                img.style.display = "none";
                resolve();
              };
            })
        )
      );

      let canvas;

      try {
        canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          imageTimeout: 5000,
          windowWidth: clone.scrollWidth,
          windowHeight: clone.scrollHeight,
        });
      } catch (firstError) {
        console.warn("PDF avec images impossible, nouvelle tentative sans images.", firstError);

        clone.querySelectorAll("img").forEach((img) => {
          img.style.display = "none";
        });

        canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: false,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: clone.scrollWidth,
          windowHeight: clone.scrollHeight,
        });
      }

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      const lineCount = Array.isArray(lines) ? lines.length : 0;
      const naturalHeight = (canvas.height * maxWidth) / canvas.width;

      // Pour les factures/devis courts, on force tout sur 1 page A4.
      // Pour les documents longs, on garde une vraie pagination.
      if (lineCount <= 8) {
        let imgWidth = maxWidth;
        let imgHeight = naturalHeight;

        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = (canvas.width * imgHeight) / canvas.height;
        }

        const x = (pageWidth - imgWidth) / 2;
        const y = margin;

        pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
        pdf.save(fileName);
        return;
      }

      let imgWidth = maxWidth;
      let imgHeight = naturalHeight;
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

      pdf.save(fileName);
    } catch (error) {
      console.error("Erreur génération PDF :", error);
      alert("Impossible de générer le PDF. Vérifie que html2canvas et jspdf sont installés.");
    } finally {
      document.body.removeChild(wrapper);
    }
  }


  function sendEmail() {
    if (!client?.email) {
      alert("Ce client n'a pas d'adresse email enregistrée.");
      return;
    }

    const documentName = isQuote ? "devis" : "facture";
    const subject = `${isQuote ? "Devis" : "Facture"} ${doc.number} - ${data.settings.companyName}`;
    const body = `Bonjour ${client?.name || ""},

Veuillez trouver ci-dessous les informations de votre ${documentName}.

${isQuote ? "Devis" : "Facture"} : ${doc.number}
Date : ${doc.date}
Montant total TTC : ${money(doc.totalTTC)}
Statut : ${doc.status}

${data.settings.paymentTerms || ""}

${data.settings.bankInfo || ""}

Cordialement,
${data.settings.companyName}
${data.settings.companyPhone || ""}
${data.settings.companyEmail || ""}`;

    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="modal">
      <div className="modal-content invoice-modal">
        <div className="no-print modal-actions">
          <button onClick={onClose}>Fermer</button>
          <button onClick={sendEmail}>Envoyer par email</button>
          <button onClick={() => window.print()}>
            Imprimer
          </button>
          <button className="primary" onClick={downloadPdf}>
            Télécharger PDF
          </button>
        </div>

        <div className="print-area invoice-template invoice-pink-template invoice-pdf-area">
          <div
            className="invoice-modern-header"
            style={{
              width: "92%",
              margin: "0 auto 26px auto",
              display: "grid",
              gridTemplateColumns: "115px 1fr 255px",
              gap: "22px",
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            <div className="invoice-logo-box">
             <img
  className="invoice-main-logo"
  src={data.settings.logoUrl && data.settings.logoUrl.trim() !== "" ? data.settings.logoUrl : "./logo.png"}
  alt="Logo entreprise"
  onError={(e) => {
    e.currentTarget.src = "./logo.png";
  }}
/>
            </div>

            <div className="invoice-company-info">
              <h1>{data.settings.companyName}</h1>
              <p>{data.settings.companyAddress}</p>
              <p>{data.settings.companyPhone}</p>
              <p>{data.settings.companyEmail}</p>
              <p>
                <strong>N° TVA :</strong> {data.settings.vatNumber || "-"}
              </p>
            </div>

            <div
              className="invoice-document-head"
              style={{
                width: 255,
                maxWidth: 255,
                overflow: "hidden",
              }}
            >
              <h2>{isQuote ? "DEVIS" : "FACTURE"}</h2>
              <div className="invoice-number-box">
                <span>N° {isQuote ? "DEVIS" : "FACTURE"}</span>
                <strong>{String(doc.number || "").replace(/^(FAC-|DEV-|N°)/, "")}</strong>
              </div>
              <div className="invoice-date-box">
                <span>Date d'émission :</span>
                <strong>{doc.date}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-info-grid">
            <div className="invoice-info-card">
              <div className="invoice-round-icon">👤</div>
              <div>
                <h3>FACTURÉ À</h3>
                <strong>{client?.name || "Client supprimé"}</strong>
                {client?.company && <p>{client.company}</p>}
                {client?.address && <p>{client.address}</p>}
                {client?.email && <p>{client.email}</p>}
                {client?.phone && <p>{client.phone}</p>}
              </div>
            </div>

            <div className="invoice-info-card">
              <div className="invoice-round-icon">📄</div>
              <div>
                <h3>RÉFÉRENCE</h3>
                <strong>{doc.convertedFrom || doc.number}</strong>
                <p><strong>Statut :</strong> {doc.status}</p>
                {!isQuote && doc.dueDate && <p><strong>Échéance :</strong> {doc.dueDate}</p>}
              </div>
            </div>
          </div>

          <table className="invoice-modern-table">
            <thead>
              <tr>
                <th>DÉSIGNATION</th>
                <th>PRIX UNITAIRE HT</th>
                <th>QUANTITÉ</th>
                <th>REMISE</th>
                <th>MONTANT TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.description}</td>
                  <td>{money(line.price)}</td>
                  <td>{Number(line.quantity || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td>{line.discount || 0}%</td>
                  <td>{money(line.totalHT || line.subtotal)}</td>
                </tr>
              ))}

              {lines.length < 2 && (
                <tr className="invoice-empty-line">
                  <td>&nbsp;</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="invoice-bottom-modern">
            <div className="invoice-payment-modern">
              <div className="invoice-section-heading">
                <span>💳</span>
                <strong>CONDITIONS DE PAIEMENT</strong>
              </div>
              <p>
                <strong>Échéance de paiement :</strong> {data.settings.paymentTerms}
              </p>
              <pre>{data.settings.bankInfo}</pre>
            </div>

            <div className="invoice-total-modern">
              <div>
                <span>Sous-total HT</span>
                <strong>{money(doc.subtotal || doc.totalHT)}</strong>
              </div>
              <div>
                <span>Remise lignes</span>
                <strong>{money(doc.lineDiscountAmount || 0)}</strong>
              </div>
              <div>
                <span>Remise globale {doc.globalDiscount ? `(${doc.globalDiscount}%)` : ""}</span>
                <strong>{money(doc.globalDiscountAmount || 0)}</strong>
              </div>
              <div>
                <span>Total HT</span>
                <strong>{money(doc.totalHT)}</strong>
              </div>
              <div>
                <span>TVA à {doc.taxRate}%</span>
                <strong>{money(doc.taxAmount)}</strong>
              </div>
              <div>
                <span>Total TTC</span>
                <strong>{money(doc.totalTTC)}</strong>
              </div>
              <div className="invoice-final-due">
                <span>À PAYER</span>
                <strong>{money(amountDue)}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-legal-note">
            <strong>Mentions</strong>
            <p>Document généré électroniquement. Aucun escompte accordé sauf indication contraire. En cas de retard de paiement, des pénalités peuvent être appliquées selon les conditions convenues.</p>
          </div>

          <div className="invoice-thank-you">
            <div className="invoice-round-icon">i</div>
            <div>
              <strong>Merci pour votre confiance.</strong>
              <p>Pour toute question, n'hésitez pas à nous contacter.</p>
            </div>
            <div className="invoice-signature">Merci !</div>
          </div>

          <div className="invoice-modern-footer">
            <strong>{data.settings.companyName} — Personnalisation</strong>
            <span>
              {data.settings.companyAddress} — {data.settings.companyPhone} — {data.settings.companyEmail}
            </span>
            <span>N° TVA : {data.settings.vatNumber || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
