/**
 * Live API test: scrape tee-shirts and classify imageUrl per product.
 */
import { classifyLmdtImageUrl, decodeLmdtMediaPath, isLmdtModelImagePath } from "../backend/lmdtParser.js";

const API = "http://127.0.0.1:3001";

async function main() {
  const health = await fetch(`${API}/api/catalog/health`).then((r) => r.json());
  console.log("=== HEALTH ===");
  console.log(JSON.stringify(health, null, 2));

  const body = {
    url: "https://www.lamaisonduteeshirt.com/c-24-tee-shirts",
    maxPages: 1,
    maxProducts: 16,
    importAll: false,
  };

  console.log("\n=== SCRAPE (page 1, 16 products) ===");
  const scrapeRes = await fetch(`${API}/api/catalog/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await scrapeRes.json();
  if (!scrapeRes.ok) {
    console.error("Scrape failed:", result);
    process.exit(1);
  }

  console.log(`Parser v${result.meta?.parserVersion}, ${result.products?.length} products`);

  const modelProducts = [];
  const unknownProducts = [];
  const packshotProducts = [];

  for (const p of result.products || []) {
    const kind = p.imageKind || classifyLmdtImageUrl(p.imageUrl);
    const decoded = decodeLmdtMediaPath(p.imageUrl);
    const entry = {
      sku: p.sku,
      name: p.name,
      kind,
      imageUrl: p.imageUrl,
      decoded,
      isModel: isLmdtModelImagePath(p.imageUrl),
    };

    if (kind === "model" || entry.isModel) modelProducts.push(entry);
    else if (kind === "packshot") packshotProducts.push(entry);
    else unknownProducts.push(entry);
  }

  console.log(`\n=== CLASSIFICATION ===`);
  console.log(`Packshot: ${packshotProducts.length}`);
  console.log(`Model:    ${modelProducts.length}`);
  console.log(`Unknown:  ${unknownProducts.length}`);

  if (modelProducts.length) {
    console.log("\n!!! MODEL URLs (FAIL) !!!");
    for (const m of modelProducts) {
      console.log(`  ${m.sku} | ${m.name}`);
      console.log(`    URL: ${m.imageUrl}`);
      console.log(`    Decoded: ${m.decoded}`);
    }
  }

  if (unknownProducts.length) {
    console.log("\n??? UNKNOWN URLs ???");
    for (const u of unknownProducts) {
      console.log(`  ${u.sku} | ${u.decoded || u.imageUrl}`);
    }
  }

  console.log("\n=== ALL PRODUCTS ===");
  for (const p of result.products || []) {
    const kind = p.imageKind || classifyLmdtImageUrl(p.imageUrl);
    const decoded = decodeLmdtMediaPath(p.imageUrl);
    console.log(`${kind.padEnd(8)} ${p.sku?.padEnd(10)} ${decoded.slice(-60)}`);
  }

  process.exit(modelProducts.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
