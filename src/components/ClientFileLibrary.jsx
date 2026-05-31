import { useRef, useState } from "react";
import { uploadClientFile, deleteClientFile, canUploadClientFiles } from "../services/clientFileStorage";
import { showToast } from "../utils/toast";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.svg,.pdf,.ai,.eps,.zip,.cdr,.dxf";

function FileIcon({ mimeType }) {
  if (IMAGE_TYPES.includes(mimeType)) return <span>🖼</span>;
  if (mimeType === "application/pdf") return <span>📄</span>;
  if (mimeType?.includes("zip")) return <span>📦</span>;
  return <span>📁</span>;
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
  const inputRef  = useRef(null);
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
          const result = await uploadClientFile(file, { clientId });
          url = result.url;
          storagePath = result.storagePath;
        } else {
          // Fallback: store as data URL locally
          url = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        newEntries.push({
          id:         crypto.randomUUID(),
          clientId,
          name:       file.name,
          url,
          storagePath,
          mimeType:   file.type || "",
          size:       file.size || 0,
          uploadedAt: new Date().toISOString(),
          source:     canCloud ? "storage" : "local",
        });
        showToast(`${file.name} ajouté.`, "success");
      } catch (err) {
        showToast(`Erreur : ${err.message}`, "error");
      }
    }

    if (newEntries.length) onFilesChange([...files, ...newEntries]);
    setLoading(false);
  }

  async function handleDelete(entry) {
    if (!confirm(`Supprimer « ${entry.name} » ?`)) return;
    if (entry.storagePath) {
      try { await deleteClientFile(entry.storagePath); }
      catch { /* best-effort */ }
    }
    onFilesChange(files.filter((f) => f.id !== entry.id));
    showToast("Fichier supprimé.", "success");
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "#ec4899" : "var(--border, #d1d5db)"}`,
          borderRadius: 8,
          padding: "20px 16px",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 16,
          background: dragOver ? "#fff1f8" : "var(--surface, #f9fafb)",
          transition: "all .15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 24, marginBottom: 6 }}>📂</div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted, #6b7280)" }}>
          {loading ? "Upload en cours…" : "Glisse des fichiers ici ou clique pour parcourir"}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted, #9ca3af)" }}>
          SVG, PNG, PDF, AI, EPS, ZIP, CDR, DXF
        </p>
      </div>

      {/* File grid */}
      {files.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted, #6b7280)", textAlign: "center", padding: "16px 0" }}>
          Aucun fichier pour ce client.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {files.map((f) => (
            <div key={f.id} style={{
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--card-bg, #fff)",
              display: "flex",
              flexDirection: "column",
            }}>
              {/* Thumbnail or icon */}
              <div style={{
                height: 90,
                background: "var(--surface, #f8fafc)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                {IMAGE_TYPES.includes(f.mimeType) ? (
                  <img
                    src={f.url}
                    alt={f.name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  <span style={{ fontSize: 36 }}><FileIcon mimeType={f.mimeType} /></span>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: "8px 10px", flex: 1 }}>
                <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>
                  {f.name}
                </p>
                <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted, #9ca3af)" }}>
                  {formatSize(f.size)} · {formatDate(f.uploadedAt)}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", borderTop: "1px solid var(--border, #f1f5f9)", padding: "4px 6px", gap: 4 }}>
                <a
                  href={f.url}
                  download={f.name}
                  target="_blank"
                  rel="noreferrer"
                  style={{ flex: 1, fontSize: 11, textAlign: "center", padding: "4px 0", color: "#ec4899", textDecoration: "none", fontWeight: 600 }}
                >
                  ↓ Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(f)}
                  style={{ fontSize: 11, padding: "4px 8px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
