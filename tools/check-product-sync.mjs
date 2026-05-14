#!/usr/bin/env node
/**
 * check-product-sync.mjs
 *
 * Enforces Rule 9 (bidirectional governance: PRODUCT.md ↔ inputs.yml in sync) and
 * Rule 20 (no <private> tag content leaked into governance docs or source files).
 *
 * Checks performed:
 *   1. Every entity listed in inputs.yml `entities:` must appear in docs/PRODUCT.md.
 *   2. Every module listed in inputs.yml `modules:` must appear in docs/PRODUCT.md.
 *   3. No substring inside a <private>...</private> block in docs/PRODUCT.md may
 *      appear in any tracked governance doc or source file (private-tag leak).
 *
 * Exits 0 on success, 1 on any sync violation or leak.
 *
 * Run via: pnpm tools:check-product-sync
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PRODUCT_MD = resolve(ROOT, "docs/PRODUCT.md");
const INPUTS_YML = resolve(ROOT, "inputs.yml");

const SCAN_DIRS = ["apps", "packages", "docs", ".cline/memory"];
const SCAN_EXT = new Set([".ts", ".tsx", ".md", ".mjs", ".js", ".json", ".yml", ".yaml"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build", ".git"]);
const SKIP_FILES = new Set(["PRODUCT.md"]);

// Minimum length for a private-tag fragment to count as a leak. Filters out
// trivial words and reduces false positives.
const MIN_LEAK_LENGTH = 30;

function loadYaml(path) {
  return yaml.load(readFileSync(path, "utf8"));
}

function stripPrivate(text) {
  return text.replace(/<private>[\s\S]*?<\/private>/g, "");
}

function extractPrivateBlocks(text) {
  const blocks = [];
  for (const match of text.matchAll(/<private>([\s\S]*?)<\/private>/g)) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, acc);
    } else if (stat.isFile()) {
      const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "";
      if (SCAN_EXT.has(ext) && !SKIP_FILES.has(entry)) {
        acc.push(path);
      }
    }
  }
  return acc;
}

/**
 * Normalize a string for cross-format comparison. inputs.yml uses snake_case
 * (e.g. `speed_dial_board`, `reports_export`) while PRODUCT.md uses Title Case
 * ("Speed Dial Board"), prose ("speed-dial board"), or section headings with
 * connectors ("Reports & Export"). Strip underscores, hyphens, ampersands,
 * slashes, commas, and collapse whitespace before substring comparison.
 */
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[_\-&/,()[\]:.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkEntitiesAndModules(inputs, productText) {
  const errors = [];
  const productNorm = normalize(productText);

  const entities = Array.isArray(inputs.entities) ? inputs.entities : [];
  for (const entity of entities) {
    const name = typeof entity === "string" ? entity : entity?.name;
    if (!name) continue;
    if (!productNorm.includes(normalize(name))) {
      errors.push(`Entity '${name}' declared in inputs.yml but not mentioned in PRODUCT.md`);
    }
  }

  const modules = Array.isArray(inputs.modules) ? inputs.modules : [];
  for (const mod of modules) {
    const name = typeof mod === "string" ? mod : mod?.name;
    if (!name) continue;
    if (!productNorm.includes(normalize(name))) {
      errors.push(`Module '${name}' declared in inputs.yml but not mentioned in PRODUCT.md`);
    }
  }

  return errors;
}

function checkPrivateLeak(privateBlocks) {
  const errors = [];
  if (privateBlocks.length === 0) return errors;

  // Build a list of fragments (lines) long enough to count as a meaningful leak.
  const fragments = [];
  for (const block of privateBlocks) {
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length >= MIN_LEAK_LENGTH) {
        fragments.push(trimmed);
      }
    }
  }

  if (fragments.length === 0) return errors;

  const files = SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)));

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const frag of fragments) {
      if (content.includes(frag)) {
        const rel = relative(ROOT, file);
        errors.push(
          `Private-tag content leaked into ${rel}: "${frag.slice(0, 60)}${frag.length > 60 ? "…" : ""}"`,
        );
      }
    }
  }

  return errors;
}

function main() {
  if (!existsSync(PRODUCT_MD)) {
    console.error("✗ docs/PRODUCT.md not found");
    process.exit(1);
  }
  if (!existsSync(INPUTS_YML)) {
    console.error("✗ inputs.yml not found");
    process.exit(1);
  }

  const productRaw = readFileSync(PRODUCT_MD, "utf8");
  const inputs = loadYaml(INPUTS_YML);

  const privateBlocks = extractPrivateBlocks(productRaw);
  const productStripped = stripPrivate(productRaw);

  const syncErrors = checkEntitiesAndModules(inputs, productStripped);
  const leakErrors = checkPrivateLeak(privateBlocks);

  if (syncErrors.length === 0 && leakErrors.length === 0) {
    console.log("✓ PRODUCT.md ↔ inputs.yml in sync");
    console.log(`✓ No private-tag leaks across ${SCAN_DIRS.join(", ")}`);
    process.exit(0);
  }

  if (syncErrors.length > 0) {
    console.error("✗ Sync violations (Rule 9):");
    for (const e of syncErrors) console.error(`  - ${e}`);
  }
  if (leakErrors.length > 0) {
    console.error("✗ Private-tag leaks (Rule 20):");
    for (const e of leakErrors) console.error(`  - ${e}`);
  }
  process.exit(1);
}

main();
