import { uploadQuoteAttachmentFileWithLocalFallback } from "../services/quoteAttachmentStorage";

export const CONFIGURATOR_ATTACHMENT_TIMEOUT_MS = 60_000;

export function withTimeout(promise, ms, message = "Délai dépassé.") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function newAttachmentId() {

  if (typeof crypto !== "undefined" && crypto.randomUUID) {

    return crypto.randomUUID();

  }

  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

}



async function blobToQuoteAttachment(blob, name, mimeType, quoteId = "draft") {
  const file = new File([blob], name, { type: mimeType });
  const uploaded = await withTimeout(
    uploadQuoteAttachmentFileWithLocalFallback(file, { quoteId }),
    CONFIGURATOR_ATTACHMENT_TIMEOUT_MS,
    `Import « ${name} » : délai dépassé (60 s).`
  );

  const syncStatus =

    uploaded.source === "storage"

      ? "cloud"

      : uploaded.source === "local-idb"

        ? "local-idb"

        : "local";



  return {

    id: newAttachmentId(),

    name,

    mimeType,

    url: uploaded.url,

    storagePath: uploaded.storagePath || "",

    localBlobId: uploaded.localBlobId || "",

    uploadedAt: new Date().toISOString(),

    syncStatus,

  };

}



/**

 * Ajoute ZIP impression + PDF atelier au brouillon devis (même logique que l'upload manuel).

 * Retourne aussi `attachmentErrors` pour signaler les échecs (ZIP volumineux, etc.).

 */

export async function attachConfiguratorExportsToDraft(

  draft,

  { zipBlob = null, pdfBlob = null, quoteId = "draft" } = {}

) {

  const attachments = [...(draft.attachments || [])];

  const attachmentErrors = [];

  const dateStamp = new Date().toISOString().slice(0, 10);



  if (!zipBlob) {

    attachmentErrors.push({

      kind: "zip",

      message: "Export ZIP impression indisponible (aucun visuel à exporter).",

    });

  } else {
    const zipSize = Number(zipBlob.size || 0);
    console.info(
      `[Devis] Export ZIP impression : ${zipSize} octet(s) (${(zipSize / 1024).toFixed(1)} Ko)`
    );

    try {
      attachments.push(
        await blobToQuoteAttachment(
          zipBlob,
          `export-tshirt-${dateStamp}.zip`,
          "application/zip",
          quoteId
        )
      );
    } catch (error) {
      const message = error?.message || "ZIP impression non joint au devis.";
      attachmentErrors.push({
        kind: "zip",
        message,
      });
      console.warn(
        `[Devis] ZIP impression non joint (${zipSize} octets) :`,
        error
      );
    }
  }



  if (!pdfBlob) {

    attachmentErrors.push({

      kind: "pdf",

      message: "PDF atelier indisponible (aucun élément visible).",

    });

  } else {

    try {

      attachments.push(

        await blobToQuoteAttachment(

          pdfBlob,

          `fiche-atelier-tshirt-${dateStamp}.pdf`,

          "application/pdf",

          quoteId

        )

      );

    } catch (error) {

      attachmentErrors.push({

        kind: "pdf",

        message: error?.message || "PDF atelier non joint au devis.",

      });

      console.warn("PDF atelier non joint au devis :", error);

    }

  }



  const hasZip = attachments.some((entry) => /\.zip$/i.test(entry.name || ""));

  const hasPdf = attachments.some((entry) => /\.pdf$/i.test(entry.name || ""));



  let notes = String(draft.notes || "").trim();

  if (hasZip && hasPdf) {

    notes =

      notes ||

      "ZIP impression et PDF atelier joints depuis le configurateur t-shirt.";

  } else if (hasZip || hasPdf) {

    const joined = hasZip ? "ZIP impression" : "PDF atelier";

    const missing = !hasZip ? "ZIP impression" : "PDF atelier";

    notes =

      notes ||

      `${joined} joint depuis le configurateur t-shirt. ${missing} manquant — réexportez depuis le configurateur si besoin.`;

  }



  return {

    ...draft,

    attachments,

    notes,

    attachmentErrors,

  };

}



export function formatConfiguratorAttachmentErrors(errors = []) {

  return (errors || [])

    .map((entry) => entry?.message)

    .filter(Boolean)

    .join(" ");

}


