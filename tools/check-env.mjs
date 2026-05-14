#!/usr/bin/env node
/**
 * check-env.mjs
 *
 * Verifies that .env.dev / .env.staging / .env.prod each:
 *   - Exist on disk.
 *   - Declare every key declared in .env.example.
 *   - Contain non-empty values (excluding obvious placeholders like `your-...-here`).
 *
 * Skips .env.example itself (the template) and treats commented-out keys as absent.
 *
 * Exits 0 on success, 1 if any env file is missing keys or has empty/placeholder values.
 *
 * Run via: pnpm tools:check-env
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const EXAMPLE_PATH = resolve(ROOT, ".env.example");
const ENVS = ["dev", "staging", "prod"];

const PLACEHOLDER_PATTERNS = [
  /^your-.*-here$/i,
  /^<.*>$/,
  /^changeme$/i,
  /^todo$/i,
  /^xxx+$/i,
];

function parseEnvKeys(path) {
  const keys = new Map();
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    keys.set(key, value);
  }
  return keys;
}

function isPlaceholder(value) {
  if (!value) return true;
  const stripped = value.replace(/^["']|["']$/g, "");
  if (stripped === "") return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(stripped));
}

function main() {
  if (!existsSync(EXAMPLE_PATH)) {
    console.error("✗ .env.example not found at project root. Cannot derive required key set.");
    process.exit(1);
  }

  const exampleKeys = parseEnvKeys(EXAMPLE_PATH);
  const required = [...exampleKeys.keys()];

  // Keys that are intentionally dev-only (not present in staging/prod env files).
  // Staging and prod hardcode equivalent values into compose files instead.
  const DEV_ONLY_KEYS = new Set([
    "LIVEKIT_TURN_UDP_START",
    "COTURN_PORT",
    "SMTP_UI_PORT",
  ]);

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const env of ENVS) {
    const path = resolve(ROOT, `.env.${env}`);
    if (!existsSync(path)) {
      console.error(`✗ .env.${env} missing at project root`);
      totalErrors += 1;
      continue;
    }

    const actual = parseEnvKeys(path);
    const missing = [];
    const missingDevOnly = [];
    const empty = [];

    for (const key of required) {
      if (!actual.has(key)) {
        if (env !== "dev" && DEV_ONLY_KEYS.has(key)) {
          missingDevOnly.push(key);
        } else {
          missing.push(key);
        }
      } else if (isPlaceholder(actual.get(key))) {
        empty.push(key);
      }
    }

    if (missing.length === 0 && empty.length === 0 && missingDevOnly.length === 0) {
      console.log(`✓ .env.${env} declares all ${required.length} keys from .env.example`);
      continue;
    }
    if (missing.length === 0 && empty.length === 0) {
      console.log(`✓ .env.${env} OK (skipped ${missingDevOnly.length} dev-only key(s): ${missingDevOnly.join(", ")})`);
      continue;
    }

    if (missing.length > 0) {
      console.error(`✗ .env.${env}: missing required key(s) (${missing.length}):`);
      for (const k of missing) console.error(`    - ${k}`);
      totalErrors += 1;
    }
    if (empty.length > 0) {
      console.error(`✗ .env.${env}: empty or placeholder value(s) (${empty.length}) — fill from CREDENTIALS.md:`);
      for (const k of empty) console.error(`    - ${k}`);
      totalErrors += 1;
    }
    if (missingDevOnly.length > 0) {
      console.warn(`⚠ .env.${env}: missing dev-only key(s) (informational — not blocking): ${missingDevOnly.join(", ")}`);
      totalWarnings += 1;
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} environment-file issue(s) require attention.`);
    process.exit(1);
  }
  if (totalWarnings > 0) {
    console.log(`\n✓ All env files OK (${totalWarnings} informational warning(s) shown above).`);
  } else {
    console.log("\n✓ All environment files pass key parity + value checks.");
  }
  process.exit(0);
}

main();
