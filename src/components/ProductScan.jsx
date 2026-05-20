import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { BarcodeSvg, QrCodeImage } from "./BarcodeLabels";
export default function ProductScan({ data, setData, logActivity }) {
  const products = data.products || [];
  const [scanValue, setScanValue] = useState("");
  const [mode, setMode] = useState("out");
  const [quantity, setQuantity] = useState(1);
  const [foundProduct, setFoundProduct] = useState(null);
  const [message, setMessage] = useState("Scanne un code-barres, un QR code ou saisis un SKU.");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const scannerRef = useRef(null);
  const containerId = "crm-html5-qrcode-scanner";

  function findProduct(rawValue) {
    const query = String(rawValue || "").trim().toLowerCase();
    if (!query) return null;
    return products.find((product) =>
      [product.sku, product.id, product.name]
        .filter(Boolean)
        .some((value) => String(value).trim().toLowerCase() === query)
    ) || products.find((product) =>
      [product.sku, product.name, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) || null;
  }

  function applyStock(product, actionMode = mode, amount = quantity) {
    if (!product) return;
    const qty = Math.max(1, Number(amount) || 1);
    const currentStock = Number(product.stock || 0);
    const nextStock = actionMode === "in" ? currentStock + qty : Math.max(0, currentStock - qty);

    setData({
      ...data,
      products: products.map((item) =>
        item.id === product.id
          ? { ...item, stock: nextStock, updatedAt: today() }
          : item
      ),
    });

    setFoundProduct({ ...product, stock: nextStock });
    setMessage(`${actionMode === "in" ? "Entrée" : "Sortie"} stock : ${qty} pièce(s) — ${product.name} (${nextStock} en stock).`);
    logActivity?.(actionMode === "in" ? "Entrée stock" : "Sortie stock", product.name, `${qty} pièce(s), stock final ${nextStock}`);
  }

  function handleScan(rawValue, autoApply = false) {
    const product = findProduct(rawValue);
    setScanValue(String(rawValue || ""));
    if (!product) {
      setFoundProduct(null);
      setMessage("Produit introuvable. Vérifie le SKU, le code-barres ou le QR code.");
      return;
    }

    setFoundProduct(product);
    setMessage(`Produit trouvé : ${product.name} — ${product.sku || "Sans SKU"}`);
    if (autoApply) applyStock(product);
  }

  function handleSubmit(event) {
    event.preventDefault();
    handleScan(scanValue, false);
  }

  useEffect(() => {
    if (!cameraEnabled) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    const scanner = new Html5QrcodeScanner(
      containerId,
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      false
    );

    scanner.render(
      (decodedText) => {
        handleScan(decodedText, true);
      },
      () => {}
    );

    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled]);

  return (
    <section className="scan-page">
      <div className="page-header">
        <div>
          <h2>Scan produit</h2>
          <p>Scanne un SKU, un code-barres ou un QR code pour retrouver un produit et ajuster le stock.</p>
        </div>
        <button className="primary" type="button" onClick={() => setCameraEnabled((value) => !value)}>
          {cameraEnabled ? "Arrêter caméra" : "Activer caméra"}
        </button>
      </div>

      <div className="scan-grid">
        <div className="card scan-card">
          <h3>Scanner / rechercher</h3>
          <form onSubmit={handleSubmit} className="scan-form">
            <input
              autoFocus
              value={scanValue}
              onChange={(event) => setScanValue(event.target.value)}
              placeholder="Scanner ici ou saisir le SKU..."
            />
            <button className="primary" type="submit">Rechercher</button>
          </form>

          <div className="scan-options">
            <label>
              Action stock
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="out">Sortie stock</option>
                <option value="in">Entrée stock</option>
              </select>
            </label>
            <label>
              Quantité
              <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
          </div>

          <p className="scan-message">{message}</p>

          {foundProduct && (
            <div className="scan-result-card">
              <div>
                <h3>{foundProduct.name}</h3>
                <p>{foundProduct.sku || "Sans SKU"} {foundProduct.category ? `• ${foundProduct.category}` : ""}</p>
                <strong>Stock actuel : {Number(foundProduct.stock || 0)}</strong>
              </div>
              <div className="scan-product-codes">
                <QrCodeImage value={foundProduct.sku || foundProduct.id} />
                <BarcodeSvg value={foundProduct.sku || foundProduct.id} height={46} />
              </div>
              <div className="scan-actions">
                <button type="button" className="primary" onClick={() => applyStock(foundProduct, "in")}>+ Entrée stock</button>
                <button type="button" className="danger" onClick={() => applyStock(foundProduct, "out")}>- Sortie stock</button>
              </div>
            </div>
          )}
        </div>

        <div className="card camera-card">
          <h3>Caméra / QR code</h3>
          {!cameraEnabled && <p className="muted">Clique sur “Activer caméra” pour scanner avec la webcam ou le téléphone.</p>}
          <div id={containerId} className={cameraEnabled ? "camera-scanner active" : "camera-scanner"}></div>
        </div>
      </div>
    </section>
  );
}
