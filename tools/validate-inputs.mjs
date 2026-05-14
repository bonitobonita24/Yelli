#!/usr/bin/env node
/**
 * validate-inputs.mjs
 *
 * Validates inputs.yml against inputs.schema.json (JSON Schema draft 2020-12).
 * Exits 0 on success, 1 on validation failure.
 *
 * Run via: pnpm tools:validate-inputs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const INPUTS_YML = resolve(ROOT, "inputs.yml");
const INPUTS_SCHEMA = resolve(ROOT, "inputs.schema.json");

function loadYaml(path) {
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw);
}

function loadJson(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

function main() {
  let inputs;
  let schema;

  try {
    inputs = loadYaml(INPUTS_YML);
  } catch (err) {
    console.error(`✗ Failed to read/parse inputs.yml: ${err.message}`);
    process.exit(1);
  }

  try {
    schema = loadJson(INPUTS_SCHEMA);
  } catch (err) {
    console.error(`✗ Failed to read/parse inputs.schema.json: ${err.message}`);
    process.exit(1);
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(inputs);

  if (!valid) {
    console.error("✗ inputs.yml failed schema validation:");
    for (const err of validate.errors ?? []) {
      const path = err.instancePath || "(root)";
      console.error(`  - ${path} ${err.message}`);
      if (err.params && Object.keys(err.params).length > 0) {
        console.error(`      params: ${JSON.stringify(err.params)}`);
      }
    }
    process.exit(1);
  }

  console.log("✓ inputs.yml is valid against inputs.schema.json");
  process.exit(0);
}

main();
