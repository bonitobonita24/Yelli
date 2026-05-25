/**
 * Phase 8 Item 3b-i — unit coverage for verifyXenditCallbackToken.
 *
 * Six cases lock in the security claim from .claude/rules/security.md
 * XENDIT PAYMENT WEBHOOK SECURITY rule 1:
 *   - Match → true
 *   - Mismatch (same length) → false  (the actual constant-time path)
 *   - Length mismatch → false         (without throwing)
 *   - null / undefined / empty → false (the Headers.get() and bad-input shapes)
 *
 * The constant-time guarantee itself is enforced by node:crypto.timingSafeEqual;
 * we don't try to time-measure it from JS (flaky in CI). We DO verify it's the
 * implementation choice by reading the file's import statement in a meta test —
 * cheap insurance against a future commit silently regressing to `===`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verifyXenditCallbackToken } from "./webhook-verify";

const VALID_TOKEN = "xnd_webhook_test_token_abc123_2026";

describe("verifyXenditCallbackToken (Phase 8 Item 3b-i)", () => {
  it("returns true when tokens match exactly", () => {
    expect(verifyXenditCallbackToken(VALID_TOKEN, VALID_TOKEN)).toBe(true);
  });

  it("returns false when tokens differ in content but match in length", () => {
    const wrong = VALID_TOKEN.split("").reverse().join("");
    expect(wrong).toHaveLength(VALID_TOKEN.length); // sanity: same length path
    expect(verifyXenditCallbackToken(wrong, VALID_TOKEN)).toBe(false);
  });

  it("returns false when lengths differ — without throwing (timingSafeEqual would throw)", () => {
    expect(() =>
      verifyXenditCallbackToken("short", VALID_TOKEN),
    ).not.toThrow();
    expect(verifyXenditCallbackToken("short", VALID_TOKEN)).toBe(false);
    expect(verifyXenditCallbackToken(VALID_TOKEN + "x", VALID_TOKEN)).toBe(false);
  });

  it("returns false on null receivedToken (the Headers.get() shape)", () => {
    expect(verifyXenditCallbackToken(null, VALID_TOKEN)).toBe(false);
  });

  it("returns false on undefined receivedToken", () => {
    expect(verifyXenditCallbackToken(undefined, VALID_TOKEN)).toBe(false);
  });

  it("returns false on empty string receivedToken", () => {
    expect(verifyXenditCallbackToken("", VALID_TOKEN)).toBe(false);
  });

  it("uses crypto.timingSafeEqual (regression guard against === drift)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "webhook-verify.ts"), "utf8");
    expect(src).toMatch(/timingSafeEqual/);
    // Negative anchor: no naked '===' on a Buffer/Uint8Array compare snuck in.
    // (Allows '===' on length comparisons, which are not the constant-time path.)
    expect(src).not.toMatch(/received === expected/);
  });
});
