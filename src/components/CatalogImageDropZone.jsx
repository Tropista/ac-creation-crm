import { useState } from "react";
import { resolveDropToImageUrl } from "../utils/catalogImageOverride";
import { showToast } from "../utils/toast";

export default function CatalogImageDropZone({
  imageUrl,
  placeholder,
  label = "Image produit",
  onImageChange,
  className = "",
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function applyImageUrl(nextUrl) {
    if (!nextUrl || busy) return;
    setBusy(true);
    try {
      await onImageChange(nextUrl);
    } catch (error) {
      showToast(error.message || "Impossible de mettre à jour l'image.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    try {
      const nextUrl = await resolveDropToImageUrl(event.dataTransfer);
      await applyImageUrl(nextUrl);
    } catch (error) {
      showToast(error.message || "Impossible de récupérer l'image.", "error");
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }

  return (
    <div className={`catalog-image-override ${className}`.trim()}>
      <strong className="catalog-image-override-label">{label}</strong>

      <div
        className={`catalog-image-dropzone ${dragOver ? "is-dragover" : ""} ${busy ? "is-busy" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {imageUrl ? (
          <img key={imageUrl} src={imageUrl} alt={label} />
        ) : (
          <span className="catalog-image-dropzone-placeholder">{placeholder}</span>
        )}
      </div>
    </div>
  );
}
