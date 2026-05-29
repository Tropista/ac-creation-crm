const DB_NAME = "crm-quote-attachments";
const DB_VERSION = 1;
const STORE_NAME = "blobs";

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponible sur cet appareil."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Impossible d'ouvrir le stockage local des pièces jointes."));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erreur IndexedDB."));
  });
}

export async function storeLocalQuoteAttachmentBlob(file) {
  const id = crypto.randomUUID();
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const putRequest = tx.objectStore(STORE_NAME).put(
      {
        blob: file,
        name: file?.name || "fichier",
        mimeType: file?.type || "application/octet-stream",
        createdAt: Date.now(),
      },
      id
    );
    await requestToPromise(putRequest);
    return id;
  } finally {
    db.close();
  }
}

export async function readLocalQuoteAttachmentBlob(id) {
  const key = String(id || "").trim();
  if (!key) return null;

  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const record = await requestToPromise(tx.objectStore(STORE_NAME).get(key));
    return record?.blob || null;
  } finally {
    db.close();
  }
}
