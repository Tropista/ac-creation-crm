import { useRef, useState } from "react";
import { acceptQuoteWithSignature, isQuoteSigned, getSignatureDisplayLabel } from "../utils/quoteSignature";
import { showToast } from "../utils/toast";

export default function QuoteSignaturePanel({ quote, onAccept, readOnly = false, compact = false }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("typed");
  const [typedName, setTypedName] = useState("");
  const [clientEmail, setClientEmail] = useState(quote?.clientEmail || "");
  const [drawing, setDrawing] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  if (!quote) return null;

  if (isQuoteSigned(quote)) {
    return (
      <div className={`quote-signature-panel quote-signature-panel--signed${compact ? " quote-signature-panel--compact" : ""}`}>
        <strong>✓ Devis accepté</strong>
        <p>{getSignatureDisplayLabel(quote)}</p>
        {quote.acceptedAt ? (
          <p className="muted">
            {new Date(quote.acceptedAt).toLocaleString("fr-FR")}
            {quote.signature?.clientEmail ? ` · ${quote.signature.clientEmail}` : ""}
          </p>
        ) : null}
        {quote.signature?.dataUrl ? (
          <img src={quote.signature.dataUrl} alt="Signature client" className="quote-signature-image" />
        ) : null}
      </div>
    );
  }

  if (readOnly) return null;

  const panelClassName = [
    "quote-signature-panel",
    compact ? "quote-signature-panel--compact" : "",
    compact && !expanded ? "quote-signature-panel--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const canvasWidth = compact ? 260 : 360;
  const canvasHeight = compact ? 72 : 120;

  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches?.[0]?.clientX ?? event.clientX;
    const clientY = event.touches?.[0]?.clientY ?? event.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDraw(event) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setDrawing(true);
  }

  function draw(event) {
    if (!drawing) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDraw() {
    setDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function submitSignature() {
    if (mode === "typed" && !typedName.trim()) {
      showToast("Indiquez le nom du signataire.", "error");
      return;
    }

    let dataUrl = "";
    if (mode === "drawn") {
      const canvas = canvasRef.current;
      const blank = document.createElement("canvas");
      blank.width = canvas.width;
      blank.height = canvas.height;
      if (canvas.toDataURL() === blank.toDataURL()) {
        showToast("Dessinez votre signature.", "error");
        return;
      }
      dataUrl = canvas.toDataURL("image/png");
    }

    const signed = acceptQuoteWithSignature(quote, {
      mode,
      dataUrl,
      typedName: typedName.trim(),
      clientEmail: clientEmail.trim(),
    });

    onAccept?.(signed);
    showToast("Devis accepté et signé.", "success");
  }

  return (
    <div className={panelClassName}>
      {compact ? (
        <button
          type="button"
          className="quote-signature-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Masquer l'acceptation" : "Acceptation & signature client"}
        </button>
      ) : (
        <h4>Acceptation & signature</h4>
      )}

      {(!compact || expanded) && (
        <>
          <div className="quote-signature-tabs">
            <button
              type="button"
              className={mode === "typed" ? "active" : ""}
              onClick={() => setMode("typed")}
            >
              Nom tapé
            </button>
            <button
              type="button"
              className={mode === "drawn" ? "active" : ""}
              onClick={() => setMode("drawn")}
            >
              Dessiner
            </button>
          </div>

          <label className="quote-signature-field">
            Email client
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </label>

          {mode === "typed" ? (
            <label className="quote-signature-field">
              Nom du signataire
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Prénom Nom"
              />
            </label>
          ) : (
            <div className="quote-signature-canvas-wrap">
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                className="quote-signature-canvas"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
              <button type="button" onClick={clearCanvas}>
                Effacer
              </button>
            </div>
          )}

          <button type="button" className="quote-signature-submit" onClick={submitSignature}>
            Signer & accepter le devis
          </button>
        </>
      )}
    </div>
  );
}
