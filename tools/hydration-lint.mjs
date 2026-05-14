#!/usr/bin/env node
/**
 * hydration-lint.mjs
 *
 * Heuristic scan for common Next.js SSR/CSR hydration footguns in apps/web.
 * Flags non-deterministic expressions in render bodies of files that are NOT
 * marked `"use client"` (i.e. server-rendered or shared components).
 *
 * Footguns detected:
 *   - `typeof window` checks (branch on server vs client → mismatch)
 *   - `Math.random()` in render output
 *   - `new Date()` / `Date.now()` in render output
 *   - `window.` / `document.` / `localStorage.` direct refs without "use client"
 *
 * Heuristic — false positives possible. Exits 0 even if findings present; this
 * is an advisory linter run separately from typecheck/lint to surface candidates
 * for review. Set HYDRATION_LINT_STRICT=1 to make findings fail the build.
 *
 * Run via: pnpm tools:hydration-lint
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCAN_ROOT = resolve(ROOT, "apps/web/src");

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build"]);

// Path segments that indicate server-only or non-component code (not hydration-sensitive).
// Files under these never render into HTML — they run on the server (tRPC routers,
// auth callbacks, route handlers, libraries, middleware).
const SERVER_ONLY_PATH_SEGMENTS = ["/src/server/", "/src/lib/", "/src/middleware.", "/src/env."];
const PATTERNS = [
  { name: "typeof-window-branch", re: /\btypeof\s+window\s*[!=]==?\s*['"]undefined['"]/g },
  { name: "math-random-in-render", re: /\bMath\.random\s*\(/g },
  { name: "new-date-in-render", re: /\bnew\s+Date\s*\(\s*\)/g },
  { name: "date-now-in-render", re: /\bDate\.now\s*\(/g },
  { name: "raw-window-ref", re: /\bwindow\.(?!matchMedia|location\.hostname)/g },
  { name: "raw-document-ref", re: /\bdocument\.(?!getElementById|querySelector)/g },
  { name: "raw-localstorage-ref", re: /\blocalStorage\./g },
];

const STRICT = process.env.HYDRATION_LINT_STRICT === "1";

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, acc);
    } else if (stat.isFile() && (entry.endsWith(".ts") || entry.endsWith(".tsx"))) {
      acc.push(path);
    }
  }
  return acc;
}

function isClientFile(content) {
  // Tolerate leading shebang, comments, or blank lines before the directive.
  const head = content.slice(0, 200);
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s*\n)*\s*['"]use client['"]/.test(head);
}

function isServerOnlyPath(path) {
  return SERVER_ONLY_PATH_SEGMENTS.some((seg) => path.includes(seg));
}

function scanFile(path) {
  const content = readFileSync(path, "utf8");
  if (isClientFile(content)) return [];
  if (isServerOnlyPath(path)) return [];

  const findings = [];
  for (const { name, re } of PATTERNS) {
    for (const match of content.matchAll(re)) {
      const before = content.slice(0, match.index);
      const line = before.split("\n").length;
      findings.push({ pattern: name, line });
    }
  }
  return findings;
}

function main() {
  if (!existsSync(SCAN_ROOT)) {
    console.log(`✓ ${relative(ROOT, SCAN_ROOT)} not found — nothing to lint (skipping).`);
    process.exit(0);
  }

  const files = walk(SCAN_ROOT);
  const report = new Map();
  let total = 0;

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      report.set(relative(ROOT, file), findings);
      total += findings.length;
    }
  }

  if (total === 0) {
    console.log(`✓ No hydration footguns detected across ${files.length} server/shared file(s).`);
    process.exit(0);
  }

  console.warn(`⚠ ${total} hydration footgun candidate(s) in ${report.size} file(s):`);
  for (const [file, findings] of report) {
    console.warn(`  ${file}`);
    for (const f of findings) {
      console.warn(`    L${f.line}  ${f.pattern}`);
    }
  }
  console.warn("\nThese are heuristic findings. Review each: if the code only runs in event");
  console.warn("handlers, useEffect, or behind a client-only guard, it is safe to ignore.");
  console.warn("Add 'use client' if the file is intended to be client-only.");

  if (STRICT) {
    console.warn("\n(HYDRATION_LINT_STRICT=1 → failing build)");
    process.exit(1);
  }
  process.exit(0);
}

main();
