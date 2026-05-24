import http from "http";

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3001,
        path,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const health = await request("GET", "/api/catalog/health");
console.log("HEALTH", health.status, health.data);

const scrape = await request("POST", "/api/catalog/scrape", {
  url: "https://www.lamaisonduteeshirt.com/c-24-tee-shirts",
  maxPages: 1,
  maxProducts: 20,
  importAll: false,
});
const json = JSON.parse(scrape.data);
console.log("SCRAPE parserVersion:", json.meta?.parserVersion);
for (const sku of ["SO-11380", "SO-11939", "GI-5000"]) {
  const product = (json.products || []).find((item) => item.sku === sku);
  if (!product) {
    console.log(sku, "NOT FOUND");
    continue;
  }
  console.log(sku, product.imageKind, product.imageUrl);
}
