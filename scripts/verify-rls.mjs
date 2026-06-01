#!/usr/bin/env node
/**
 * Vérifie que chaque table Supabase définie dans les migrations SQL :
 *   1. A ENABLE ROW LEVEL SECURITY
 *   2. A au moins une CREATE POLICY
 * Échoue avec exit 1 si des tables sont non protégées.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SQL_DIRS = [
  join(ROOT, "supabase", "migrations"),
  join(ROOT, "docs"),
];

// Tables publiques gérées par Supabase (pas notre code) — exclure
const SUPABASE_INTERNAL = new Set([
  "schema_migrations", "objects", "buckets", "migrations",
  "audit_log_entries", "identities", "instances", "refresh_tokens",
  "sessions", "users", "mfa_amr_claims", "mfa_challenges",
  "mfa_factors", "saml_providers", "saml_relay_states", "sso_domains",
  "sso_providers", "flow_state", "one_time_tokens",
]);

function readAllSql() {
  let combined = "";
  for (const dir of SQL_DIRS) {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      combined += "\n" + readFileSync(join(dir, file), "utf8");
    }
  }
  return combined;
}

function extractTables(sql) {
  const tables = new Set();
  // CREATE TABLE public.foo or CREATE TABLE foo
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (!SUPABASE_INTERNAL.has(name)) tables.add(name);
  }
  return tables;
}

function extractRlsTables(sql) {
  const tables = new Set();
  const re = /ALTER\s+TABLE\s+(?:public\.)?(\w+|\%I)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (name !== "%i") tables.add(name);
  }
  // Also detect dynamic loop: the loop covers all tables listed
  const loopRe = /ARRAY\[([^\]]+)\]\s*\n?\s*LOOP[\s\S]*?ENABLE ROW LEVEL SECURITY/gi;
  const arrayRe = /'(\w+)'/g;
  let loop;
  while ((loop = loopRe.exec(sql)) !== null) {
    let arr;
    while ((arr = arrayRe.exec(loop[1])) !== null) {
      tables.add(arr[1].toLowerCase());
    }
  }
  return tables;
}

function extractPolicyTables(sql) {
  const tables = new Set();

  // Politiques statiques : CREATE POLICY "name" ON public.table
  const staticRe = /CREATE\s+POLICY\s+\S+\s+ON\s+(?:public\.)?(\w+)/gi;
  let m;
  while ((m = staticRe.exec(sql)) !== null) {
    tables.add(m[1].toLowerCase());
  }

  // Politiques dynamiques dans DO $$ ... FOREACH tbl IN ARRAY [...] ... CREATE POLICY ... %I
  // On trouve les blocs DO qui contiennent à la fois ARRAY et CREATE POLICY
  const doBlockRe = /DO\s+\$\$[\s\S]*?\$\$/gi;
  let block;
  while ((block = doBlockRe.exec(sql)) !== null) {
    const content = block[0];
    if (!content.includes("CREATE POLICY") && !content.includes("EXECUTE format")) continue;
    // Extraire les tables du ARRAY[...]
    const arrayRe = /ARRAY\s*\[([^\]]+)\]/gi;
    let arr;
    while ((arr = arrayRe.exec(content)) !== null) {
      const nameRe = /'(\w+)'/g;
      let name;
      while ((name = nameRe.exec(arr[1])) !== null) {
        tables.add(name[1].toLowerCase());
      }
    }
  }

  return tables;
}

const sql = readAllSql();
const allTables = extractTables(sql);
const rlsTables = extractRlsTables(sql);
const policyTables = extractPolicyTables(sql);

const missingRls = [];
const missingPolicy = [];

for (const table of allTables) {
  if (!rlsTables.has(table)) missingRls.push(table);
  if (!policyTables.has(table)) missingPolicy.push(table);
}

console.log(`Tables trouvées      : ${allTables.size}`);
console.log(`Tables avec RLS      : ${rlsTables.size}`);
console.log(`Tables avec policies : ${policyTables.size}`);

let hasError = false;

if (missingRls.length > 0) {
  console.error(`\n❌ Tables SANS ENABLE ROW LEVEL SECURITY :\n  ${missingRls.join(", ")}`);
  hasError = true;
}

if (missingPolicy.length > 0) {
  console.error(`\n❌ Tables SANS politique RLS :\n  ${missingPolicy.join(", ")}`);
  hasError = true;
}

if (!hasError) {
  console.log("\n✅ Toutes les tables ont RLS activé et au moins une politique.");
}

process.exit(hasError ? 1 : 0);
