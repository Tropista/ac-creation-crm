import { useRef, useState } from "react";
import { uploadClientFile, deleteClientFile, canUploadClientFiles } from "../services/clientFileStorage";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.zip,.cdr,.dxf";

function FileIcon({ mimeType }) {
  if (IMAGE_TYPES.includes(mimeType)) return <span>Image</span>;
  if (mimeType === "application/pdf") return <span>PDF</span>;
  if (mimeType?.includes("zip")) return <span>ZIP</span>;
  return <span>Fichier</span>;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function ClientFileLibrary({ clientId, files = [], onFilesChange }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList) {
    if (!fileList?.length) return;
    setLoading(true);

    const canCloud = await canUploadClientFiles();
    const newEntries = [];

    for (const file of Array.from(fileList)) {
      try {
        let url = "";
        let storagePath = "";

        if (canCloud) {
          try {
            const result = await uploadClientFile(file, { clientId });
            url = result.url;
            storagePath = result.storagePath;
          } catch (uploadErr) {
            if (String(uploadErr.message).startsWith("MIME_NOT_SUPPORTED:")) {
              url = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              storagePath = "";
            } else {
              throw uploadErr;
            }
          }
        } else {
          url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        newEntries.push({
          id: crypto.randomUUID(),
          clientId,
          name: file.name,
          url,
          storagePath,
          mimeType: file.type || "",
          size: file.size || 0,
          uploadedAt: new Date().toISOString(),
          source: canCloud ? "storage" : "local",
          publicPortal: false,
        });
        showToast(`${file.name} ajouté.`, "success");
      } catch (err) {
        showToast(`Erreur : ${err.message}`, "error");
      }
    }

    if (newEntries.length) {
      onFilesChange([...files, ...newEntries]);
    } else if (Array.from(fileList).length > 0) {
      showToast("Aucun fichier n'a pu être ajouté.", "error");
    }
    setLoading(false);
  }

  async function handleDelete(entry) {
    if (
      !(await confirmAction({
        title: "Supprimer le fichier",
        message: `Supprimer "${entry.name}" ?`,
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) return;
    if (entry.storagePath) {
      try {
        await deleteClientFile(entry.storagePath);
      } catch {
        // Best effort: the CRM state is still updated even if the remote delete fails.
      }
    }
    onFilesChange(files.filter((file) => file.id !== entry.id));
    showToast("Fichier supprimé.", "success");
  }

  function handlePortalVisibility(entry) {
    onFilesChange(
      files.map((file) =>
        file.id === entry.id
          ? { ...file, publicPortal: !file.publicPortal }
          : file
      )
    );
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#ec4899" : "var(--border, #d1d5db)"}`,
          borderRadius: 8,
          padding: "20px 16px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 16,
          background: dragOver ? "var(--table-hover)" : "var(--surface-2)",
          transition: "all .15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          style={{ display: "none" }}
          onChange={(event) => handleFiles(event.target.files)}
        />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Fichiers client</div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted, #6b7280)" }}>
          {loading ? "Upload en cours..." : "Glisse des fichiers ici ou clique pour parcourir"}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted, #9ca3af)" }}>
          SVG, PNG, PDF, AI, EPS, ZIP, CDR, DXF
        </p>
      </div>

      {files.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted, #6b7280)", textAlign: "center", padding: "16px 0" }}>
          Aucun fichier pour ce client.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {files.map((file) => (
            <div key={file.id} style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                height: 90,
                background: "var(--surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                {IMAGE_TYPES.includes(file.mimeType) ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 800 }}><FileIcon mimeType={file.mimeType} /></span>
                )}
              </div>

              <div style={{ padding: "8px 10px", flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>
                  {file.name}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted, #9ca3af)" }}>
                  {formatSize(file.size)} - {formatDate(file.uploadedAt)}
                </p>
              </div>

              <div style={{ display: "grid", borderTop: "1px solid var(--border)", padding: "6px", gap: 6 }}>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--text-muted, #64748b)",
                  cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={Boolean(file.publicPortal)}
                    onChange={() => handlePortalVisibility(file)}
                  />
                  Visible portail client
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  <a
                    href={file.url}
                    download={file.name}
                    target="_blank"
                    rel="noreferrer"
                    style={{ flex: 1, fontSize: 11, textAlign: "center", padding: "4px 0", color: "#ec4899", textDecoration: "none", fontWeight: 600 }}
                  >
                    Télécharger
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(file)}
                    style={{ fontSize: 11, padding: "4px 8px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
