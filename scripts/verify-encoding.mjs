#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const SCAN_PATHS = [
  ".github",
  "backend",
  "docs",
  "public",
  "scripts",
  "src",
  "README.md",
  "package.json",
  "vite.config.js",
  "vercel.json",
  "electron.cjs",
  "electron-bank.cjs",
  "electron-preload.cjs",
  "electron-updater.cjs",
];

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".txt",
  ".yml",
]);

const IGNORED_DIRS = new Set([
  ".git",
  "archive",
  "dist",
  "node_modules",
  "release",
  "release-ci",
  "release-ci2",
  "test-results",
  "tmp-release-check",
]);

const MOJIBAKE_PATTERNS = [
  /\u00c3[\u0080-\u00bf]/,
  /\u00c2[\u0080-\u00bf]/,
  /\u00e2[\u0080-\u00bf][\u0080-\u00bf]/,
  /\u00f0[\u0080-\u00bf][\u0080-\u00bf][\u0080-\u00bf]/,
];

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function walk(entryPath, files = []) {
  if (!existsSync(entryPath)) return files;

  const stats = statSync(entryPath);
  if (stats.isDirectory()) {
    const name = entryPath.split(/[\\/]/).at(-1);
    if (IGNORED_DIRS.has(name)) return files;

    for (const child of readdirSync(entryPath)) {
      walk(join(entryPath, child), files);
    }
    return files;
  }

  if (stats.isFile() && isTextFile(entryPath)) {
    files.push(entryPath);
  }
  return files;
}

function findMojibake(text) {
  for (const pattern of MOJIBAKE_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match;
  }
  return null;
}

const files = SCAN_PATHS.flatMap((entry) => walk(join(ROOT, entry)));
const failures = [];

for (const filePath of files) {
  const text = readFileSync(filePath, "utf8");
  const match = findMojibake(text);
  if (!match) continue;

  const before = text.slice(0, match.index);
  const line = before.split(/\r?\n/).length;
  const column = before.length - before.lastIndexOf("\n");
  const snippet = text
    .slice(Math.max(0, match.index - 30), match.index + match[0].length + 30)
    .replace(/\r?\n/g, " ");

  failures.push({
    file: relative(ROOT, filePath).replace(/\\/g, "/"),
    line,
    column,
    snippet,
  });
}

if (failures.length > 0) {
  console.error("::error::Possible mojibake/encoding corruption detected:");
  for (const failure of failures) {
    console.error(
      `  - ${failure.file}:${failure.line}:${failure.column} -> ${failure.snippet}`
    );
  }
  process.exit(1);
}

console.log(`Encoding check passed for ${files.length} text file(s).`);
