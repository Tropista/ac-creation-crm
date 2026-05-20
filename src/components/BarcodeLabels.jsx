import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
function BarcodeSvg({ value, height = 58 }) {
  const values = getCode128Values(value);
  const quiet = 10;
  let x = quiet;
  const bars = [];

  values.forEach((code, groupIndex) => {
    const pattern = CODE128_PATTERNS[code];
    let drawBar = true;

    pattern.split("").forEach((widthChar, partIndex) => {
      const width = Number(widthChar);
      if (drawBar) {
        bars.push({ x, width, key: `${groupIndex}-${partIndex}` });
      }
      x += width;
      drawBar = !drawBar;
    });
  });

  const width = x + quiet;

  return (
    <svg className="barcode-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Code-barres ${value || "sans SKU"}`}>
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {bars.map((bar) => (
        <rect key={bar.key} x={bar.x} y="4" width={bar.width} height={height - 14} fill="#111827" />
      ))}
    </svg>
  );
}

function BarcodeLabels({ data }) {
  const allProducts = data.products || [];
  const [search, setSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const showPrice = false;
  const [showQr, setShowQr] = useState(true);
  const [copies, setCopies] = useState(1);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allProducts;
    return allProducts.filter((product) =>
      [product.name, product.sku, product.category]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [allProducts, search]);

  const selectedProducts = selectedProductIds
    .map((id) => allProducts.find((product) => product.id === id))
    .filter(Boolean);

  const labelsToPrint = selectedProducts.flatMap((product) =>
    Array.from({ length: Math.max(1, Number(copies) || 1) }, () => product)
  );

  function toggleProduct(productId) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  }

  function selectVisibleProducts() {
    const visibleIds = filteredProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds]))
    );
  }

  return (
    <section className="labels-page">
      <div className="page-header no-print">
        <div>
          <h2>Étiquettes & codes-barres</h2>
          <p>Génère des étiquettes produits imprimables à partir des SKU.</p>
        </div>
        <button className="primary" onClick={() => window.print()} disabled={!labelsToPrint.length}>
          Imprimer les étiquettes
        </button>
      </div>

      <div className="card labels-controls no-print">
        <input
          placeholder="Rechercher un produit, SKU ou catégorie..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <input
          type="number"
          min="1"
          max="100"
          value={copies}
          onChange={(event) => setCopies(event.target.value)}
          title="Nombre d'étiquettes par produit"
        />
        <label className="labels-checkbox">
          <input type="checkbox" checked={showQr} onChange={(event) => setShowQr(event.target.checked)} />
          Afficher QR code
        </label>
        <button type="button" onClick={selectVisibleProducts}>Sélectionner / désélectionner les produits visibles</button>
        <button type="button" onClick={() => setSelectedProductIds([])}>Vider la sélection</button>
      </div>

      <div className="labels-layout no-print">
        <div className="card labels-product-list">
          <h3>Produits</h3>
          {filteredProducts.length === 0 && <p className="muted">Aucun produit trouvé.</p>}
          {filteredProducts.map((product) => (
            <label className="label-product-row" key={product.id}>
              <input
                type="checkbox"
                checked={selectedProductIds.includes(product.id)}
                onChange={() => toggleProduct(product.id)}
              />
              <span>
                <strong>{product.name || "Produit sans nom"}</strong>
                <small>{product.sku || "Sans SKU"} {product.category ? `• ${product.category}` : ""}</small>
              </span>
            </label>
          ))}
        </div>

        <div className="card labels-preview-card">
          <h3>Aperçu impression</h3>
          <p className="muted">{labelsToPrint.length} étiquette(s) prête(s) à imprimer.</p>
          <div className="labels-sheet labels-sheet-preview">
            {labelsToPrint.map((product, index) => (
              <ProductLabel key={`${product.id}-${index}`} product={product} showPrice={showPrice} showQr={showQr} />
            ))}
          </div>
        </div>
      </div>

      <div className="labels-print-area">
        <div className="labels-sheet">
          {labelsToPrint.map((product, index) => (
            <ProductLabel key={`${product.id}-print-${index}`} product={product} showPrice={showPrice} showQr={showQr} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductLabel({ product, showPrice, showQr = false }) {
  const codeValue = product.sku || product.name || product.id;
  return (
    <div className="product-label">
      <strong>{product.name || "Produit"}</strong>
      <div className="product-label-code-row">
        <BarcodeSvg value={codeValue} />
        {showQr && <QrCodeImage value={codeValue} className="product-label-qr" />}
      </div>
      <div className="product-label-footer">
        <span>{product.sku || "Sans SKU"}</span>
      </div>
    </div>
  );
}

function QrCodeImage({ value, className = "qr-code-img" }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc("");
      return;
    }

    QRCode.toDataURL(String(value), {
      margin: 1,
      width: 180,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) return <span className={className} />;
  return <img className={className} src={src} alt={`QR code ${value}`} />;
}
const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

function getCode128Values(value) {
  const text = String(value || "").trim() || "SANS-SKU";
  const safeText = text.replace(/[^\x20-\x7E]/g, "");
  const values = [104];

  for (const char of safeText) {
    values.push(char.charCodeAt(0) - 32);
  }

  let checksum = 104;
  for (let index = 1; index < values.length; index += 1) {
    checksum += values[index] * index;
  }

  values.push(checksum % 103, 106);
  return values;
}
export {
  BarcodeSvg,
  ProductLabel,
  QrCodeImage,
  getCode128Values
};

export default BarcodeLabels;