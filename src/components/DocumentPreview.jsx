import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { money } from "../utils/money";

export default function DocumentPreview({ doc, type, data, onClose }) {
  const isQuote = type === "quote";
  const client = (data.clients || []).find((c) => c.id === doc.clientId);
  const amountDue = doc.status === "Payée" ? 0 : doc.totalTTC || 0;

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

  const documentTitle = isQuote ? "DEVIS" : "FACTURE";
  const documentFileName = `${isQuote ? "devis" : "facture"}-${String(
    doc.number || "document"
  ).replace(/[^\w.-]+/g, "_")}.pdf`;

  async function downloadPdf() {
    const source = document.querySelector(".ac-invoice-v2");
    if (!source) return alert("Zone PDF introuvable.");

    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";
    wrapper.style.width = "190mm";
    wrapper.style.background = "#ffffff";

    const clone = source.cloneNode(true);
    clone.style.width = "190mm";
    clone.style.minHeight = "auto";
    clone.style.margin = "0";
    clone.style.padding = "7mm";
    clone.style.boxShadow = "none";
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
      alert("Impossible de générer le PDF.");
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
    const subject = `${documentTitle} ${doc.number} - ${data.settings.companyName}`;
    const body = `Bonjour ${client?.name || ""},

Veuillez trouver ci-dessous les informations de votre ${documentName}.

${documentTitle} : ${doc.number}
Date : ${doc.date}
Montant total TTC : ${money(doc.totalTTC)}
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
  }

  return (
    <div className="modal ac-invoice-modal-wrap">
      <style>{`
        .ac-invoice-modal-wrap{
          background:rgba(15,23,42,.70);
          overflow:auto;
        }

        .ac-invoice-modal{
          max-width:1000px !important;
          background:#f8fafc !important;
        }

        .ac-invoice-actions{
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-bottom:18px;
        }

        .ac-invoice-v2{
          width:210mm;
          min-height:297mm;
          margin:0 auto;
          padding:7mm;
          background:#fff;
          color:#111827;
          box-sizing:border-box;
          font-family:Inter,Arial,sans-serif;
          font-size:9px;
          line-height:1.35;
          box-shadow:0 20px 70px rgba(15,23,42,.22);
        }

        .ac-invoice-logo{
          display:flex;
          justify-content:center;
          margin-bottom:4mm;
        }

        .ac-invoice-logo img{
          width:22mm;
          max-height:18mm;
          object-fit:contain;
        }

        .ac-invoice-head{
          display:grid;
          grid-template-columns:1.15fr .85fr;
          gap:5mm;
          align-items:stretch;
          margin-bottom:4mm;
        }

        .ac-company-box,
        .ac-title-box,
        .ac-info-card,
        .ac-payment-card,
        .ac-totals-card,
        .ac-mentions,
        .ac-thanks{
          border:1px solid #f5d0e5;
          border-radius:9px;
          overflow:hidden;
        }

        .ac-company-box{
          padding:5mm;
          background:linear-gradient(135deg,#fff1f7,#fdf2ff);
        }

        .ac-company-box h1{
          margin:0 0 4mm;
          font-size:18px;
          line-height:1;
          color:#111827;
        }

        .ac-company-box p{
          margin:1.5mm 0;
          color:#334155;
        }

        .ac-title-box{
          padding:5mm;
          color:#fff;
          background:linear-gradient(135deg,#f472b6,#ec4899,#c026d3);
          box-shadow:0 12px 28px rgba(236,72,153,.22);
        }

        .ac-title-box h2{
          margin:0 0 8mm;
          color:#fff;
          text-align:right;
          font-size:26px;
          letter-spacing:.04em;
        }

        .ac-title-line{
          display:flex;
          justify-content:space-between;
          gap:8px;
          padding:3mm 0;
          border-top:1px solid rgba(255,255,255,.25);
        }

        .ac-title-line span{
          opacity:.85;
          font-size:8.8px;
          text-transform:uppercase;
        }

        .ac-title-line strong{
          color:#fff;
          font-size:13px;
        }

        .ac-info-grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:4mm;
          margin-bottom:4mm;
        }

        .ac-info-card{
          display:grid;
          grid-template-columns:34px 1fr;
          gap:12px;
          padding:4mm;
          background:#f8fafc;
          min-height:24mm;
        }

        .ac-icon{
          width:30px;
          height:30px;
          display:grid;
          place-items:center;
          border-radius:999px;
          color:#fff;
          background:linear-gradient(135deg,#f472b6,#ec4899);
          font-weight:900;
        }

        .ac-info-card h3{
          margin:0 0 3mm;
          font-size:9.5px;
          letter-spacing:.08em;
          color:#111827;
        }

        .ac-info-card strong{
          display:block;
          margin-bottom:2mm;
        }

        .ac-info-card p{
          margin:1.2mm 0;
          color:#475569;
        }

        .ac-table{
          width:100%;
          border-collapse:separate;
          border-spacing:0;
          overflow:hidden;
          border-radius:10px;
          border:1px solid #f5d0e5;
          margin-bottom:4mm;
        }

        .ac-table th{
          padding:2.5mm 2mm;
          background:linear-gradient(135deg,#f9a8d4,#f472b6,#ec4899);
          color:#111827;
          text-align:left;
          font-size:8.8px;
          text-transform:uppercase;
        }

        .ac-table td{
          padding:2.5mm 2mm;
          border-bottom:1px solid #fce7f3;
          background:#fff;
        }

        .ac-table tbody tr:nth-child(even) td{
          background:#fdf4ff;
        }

        .ac-table th:nth-child(n+2),
        .ac-table td:nth-child(n+2){
          text-align:right;
        }

        .ac-bottom{
          display:grid;
          grid-template-columns:1fr .78fr;
          gap:7mm;
          margin-bottom:4mm;
          align-items:start;
        }

        .ac-payment-card{
          padding:4mm;
          background:#f8fafc;
        }

        .ac-payment-card h3{
          margin:0 0 4mm;
          font-size:9px;
        }

        .ac-payment-card p{
          margin:2mm 0;
        }

        .ac-payment-card pre{
          white-space:pre-wrap;
          font-family:inherit;
          font-size:9.5px;
          background:white;
          border:1px solid #e5e7eb;
          border-radius:9px;
          padding:4mm;
          margin:4mm 0 0;
        }

        .ac-totals-card{
          background:white;
        }

        .ac-total-line{
          display:flex;
          justify-content:space-between;
          gap:10px;
          padding:2.4mm 3.5mm;
          border-bottom:1px solid #f1f5f9;
        }

        .ac-total-line span{
          color:#475569;
        }

        .ac-total-line strong{
          color:#111827;
        }

        .ac-total-final{
          color:#fff;
          background:linear-gradient(135deg,#f472b6,#ec4899,#db2777);
          border-bottom:0;
          font-size:13px;
        }

        .ac-total-final span,
        .ac-total-final strong{
          color:#fff !important;
        }

        .ac-mentions{
          padding:3.5mm 4mm;
          margin-bottom:6mm;
          background:#fff7ed;
          border-color:#fed7aa;
        }

        .ac-mentions strong{
          color:#7c2d12;
        }

        .ac-mentions p{
          margin:2mm 0 0;
          color:#7c2d12;
          font-size:9px;
        }

        .ac-thanks{
          display:grid;
          grid-template-columns:34px 1fr auto;
          gap:12px;
          align-items:center;
          padding:3.5mm 4mm;
          background:linear-gradient(135deg,#fff1f7,#fdf2ff);
          margin-bottom:6mm;
        }

        .ac-thanks strong{
          display:block;
        }

        .ac-thanks p{
          margin:1mm 0 0;
          color:#64748b;
        }

        .ac-signature{
          font-size:22px;
          font-weight:900;
          color:#111827;
          font-family:"Segoe Script","Brush Script MT",cursive;
        }

        .ac-company-box,
        .ac-title-box,
        .ac-info-card,
        .ac-table,
        .ac-bottom,
        .ac-mentions,
        .ac-thanks,
        .ac-footer{
          break-inside:avoid;
          page-break-inside:avoid;
        }

        .ac-footer{
          border-top:1px solid #e5e7eb;
          padding-top:4mm;
          text-align:center;
          font-size:8.8px;
          color:#64748b;
        }

        .ac-footer strong{
          display:block;
          color:#111827;
          margin-bottom:1mm;
        }

        @media print{
          @page{
            size:A4;
            margin:0;
          }

          html,body{
            background:white !important;
            -webkit-print-color-adjust:exact;
            print-color-adjust:exact;
          }

          body *{
            visibility:hidden;
          }

          .ac-invoice-modal-wrap,
          .ac-invoice-modal,
          .ac-invoice-v2,
          .ac-invoice-v2 *{
            visibility:visible !important;
          }

          .no-print,
          .ac-invoice-actions{
            display:none !important;
          }

          .ac-invoice-modal-wrap{
            position:static !important;
            inset:auto !important;
            padding:0 !important;
            background:white !important;
            overflow:visible !important;
          }

          .ac-invoice-modal{
            margin:0 !important;
            padding:0 !important;
            max-width:none !important;
            width:210mm !important;
            border:0 !important;
            box-shadow:none !important;
            border-radius:0 !important;
            background:white !important;
          }

          .ac-invoice-v2{
            width:190mm !important;
            min-height:auto !important;
            margin:0 auto !important;
            padding:7mm !important;
            box-shadow:none !important;
            transform:none !important;
          }
        }
      `}</style>

      <div className="modal-content invoice-modal ac-invoice-modal">
        <div className="no-print modal-actions ac-invoice-actions">
          <button onClick={onClose}>Fermer</button>
          <button onClick={sendEmail}>Envoyer par email</button>
          <button onClick={() => window.print()}>Imprimer</button>
          <button className="primary" onClick={downloadPdf}>
            Télécharger PDF
          </button>
        </div>

        <div className="ac-invoice-v2">
          <div className="ac-invoice-logo">
            <img
              src={
                data.settings.logoUrl && data.settings.logoUrl.trim() !== ""
                  ? data.settings.logoUrl
                  : "./logo.png"
              }
              alt="Logo entreprise"
              onError={(event) => {
                event.currentTarget.src = "./logo.png";
              }}
            />
          </div>

          <div className="ac-invoice-head">
            <div className="ac-company-box">
              <h1>{data.settings.companyName || "AC Creation"}</h1>
              <p>{data.settings.companyAddress}</p>
              <p>{data.settings.companyPhone}</p>
              <p>{data.settings.companyEmail}</p>
              <p>
                <strong>N° TVA :</strong> {data.settings.vatNumber || "-"}
              </p>
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
            </div>
          </div>

          <div className="ac-info-grid">
            <div className="ac-info-card">
              <div className="ac-icon">👤</div>
              <div>
                <h3>FACTURÉ À</h3>
                <strong>{client?.name || "Client supprimé"}</strong>
                {client?.company && <p>{client.company}</p>}
                {client?.address && <p>{client.address}</p>}
                {client?.email && <p>{client.email}</p>}
                {client?.phone && <p>{client.phone}</p>}
              </div>
            </div>

            <div className="ac-info-card">
              <div className="ac-icon">📄</div>
              <div>
                <h3>RÉFÉRENCE</h3>
                <strong>{doc.convertedFrom || doc.number}</strong>
                <p>
                  <strong>Statut :</strong> {doc.status}
                </p>
                {!isQuote && doc.dueDate && (
                  <p>
                    <strong>Échéance :</strong> {doc.dueDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          <table className="ac-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Prix unitaire HT</th>
                <th>Quantité</th>
                <th>Remise</th>
                <th>Montant total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.description}</td>
                  <td>{money(line.price)}</td>
                  <td>
                    {Number(line.quantity || 0).toLocaleString("fr-FR", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td>{line.discount || 0}%</td>
                  <td>{money(line.totalHT || line.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ac-bottom">
            <div className="ac-payment-card">
              <h3>💳 CONDITIONS DE PAIEMENT</h3>
              <p>
                <strong>Échéance de paiement :</strong>{" "}
                {data.settings.paymentTerms}
              </p>
              <pre>{data.settings.bankInfo}</pre>
            </div>

            <div className="ac-totals-card">
              <div className="ac-total-line">
                <span>Sous-total HT</span>
                <strong>{money(doc.subtotal || doc.totalHT)}</strong>
              </div>
              <div className="ac-total-line">
                <span>Remise lignes</span>
                <strong>{money(doc.lineDiscountAmount || 0)}</strong>
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
              <div className="ac-total-line">
                <span>Total TTC</span>
                <strong>{money(doc.totalTTC)}</strong>
              </div>
              <div className="ac-total-line ac-total-final">
                <span>À PAYER</span>
                <strong>{money(amountDue)}</strong>
              </div>
            </div>
          </div>

          <div className="ac-mentions">
            <strong>Mentions</strong>
            <p>
              Document généré électroniquement. Aucun escompte accordé sauf
              indication contraire. En cas de retard de paiement, des pénalités
              peuvent être appliquées selon les conditions convenues.
            </p>
          </div>

          <div className="ac-thanks">
            <div className="ac-icon">i</div>
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
  );
}
