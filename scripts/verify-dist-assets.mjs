import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const distDir = process.argv[2] ?? "dist";
const indexPath = join(distDir, "index.html");

if (!existsSync(indexPath)) {
  console.error(`::error::Missing ${indexPath}. Run the production build first.`);
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
const assetRefs = [
  ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
].map((match) => match[1].replace(/^\//, ""));

if (assetRefs.length === 0) {
  console.error("::error::index.html does not reference any /assets/ files.");
  process.exit(1);
}

const missing = assetRefs.filter((assetPath) => !existsSync(join(distDir, assetPath)));

if (missing.length > 0) {
  console.error("::error::index.html references assets missing from dist/:");
  for (const assetPath of missing) {
    console.error(`  - ${assetPath}`);
  }
  process.exit(1);
}

const assetsDir = join(distDir, "assets");
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir).length : 0;

console.log(
  `Verified ${assetRefs.length} referenced asset(s) in ${distDir}/ (${assetFiles} file(s) in assets/).`,
);
